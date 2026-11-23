-- Fase 5.2.2, Punto A.1: esquema único public.usuarios, RLS y hook de tokens.
-- Este archivo es una preparación local. NO se aplica a Supabase Cloud sin autorización.
-- La migración debe ejecutarse con el rol postgres (rol propietario en Supabase),
-- de modo que las funciones SECURITY DEFINER queden propiedad de postgres.

create schema if not exists private;

-- El esquema private no se expone en la Data API de Supabase.
revoke all on schema private from public;
grant usage on schema private to authenticated, supabase_auth_admin;

-- Única tabla propia aprobada: exactamente cuatro columnas.
create table public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  rol text not null,
  activo boolean not null default true,

  -- Validación real en PostgreSQL, equivalente a la regla actual del frontend:
  -- longitud 3..32 y /^[A-Za-z0-9._-]+$/.
  constraint usuarios_nombre_length_check
    check (char_length(nombre) between 3 and 32),
  constraint usuarios_nombre_pattern_check
    check (nombre ~ '^[A-Za-z0-9._-]+$'),

  -- Solo Administrador e Instructor. Se usa TEXT con CHECK, no un enum.
  constraint usuarios_rol_check
    check (rol in ('administrador', 'instructor'))
);

-- Unicidad case-insensitive sobre el nombre normalizado, sin columna adicional.
create unique index usuarios_nombre_lower_key on public.usuarios (lower(nombre));

comment on table public.usuarios is
  'Perfiles de aplicación para Supabase Auth. Nunca contiene contraseñas ni hashes.';
comment on column public.usuarios.id is
  'UUID de auth.users(id); identidad gestionada por Supabase Auth.';
comment on column public.usuarios.nombre is
  'Nombre de usuario visible para Admin e Instructor.';
comment on column public.usuarios.rol is
  'Rol de aplicación: administrador o instructor.';
comment on column public.usuarios.activo is
  'Estado de la cuenta. Las cuentas inactivas no obtienen tokens ni datos.';

-- No se crean columnas username_key, created_at ni updated_at.
-- No se crea un trigger: la tabla no admite escrituras del cliente.
alter table public.usuarios enable row level security;

-- Privilegios mínimos: anon no recibe nada; authenticated solo SELECT con RLS;
-- supabase_auth_admin solo SELECT para ejecutar el hook con RLS.
revoke all on table public.usuarios from public, anon, authenticated;
grant select on table public.usuarios to authenticated;
grant select on table public.usuarios to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- Funciones auxiliares de RLS
-- SECURITY DEFINER es necesario aquí para leer public.usuarios sin recursión RLS.
-- search_path se fija a '' y todos los objetos están calificados por esquema.
-- Las funciones no exponen datos, no escriben y su EXECUTE está restringido.
-- ---------------------------------------------------------------------------

create or replace function private.usuario_activo(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.id = p_user_id
      and u.activo
  );
$$;

create or replace function private.usuario_activo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.usuario_activo(auth.uid());
$$;

create or replace function private.rol_actual()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.rol
  from public.usuarios u
  where u.id = auth.uid()
    and u.activo
  limit 1;
$$;

-- El envoltorio se ejecuta como postgres, por lo que puede invocar la función
-- parametrizada sin conceder EXECUTE a authenticated ni a supabase_auth_admin.
-- La función parametrizada no es necesaria para el hook: este solo necesita SELECT.
revoke all on function private.usuario_activo(uuid) from public, anon, authenticated;

revoke all on function private.usuario_activo() from public, anon, authenticated;
grant execute on function private.usuario_activo() to authenticated;

revoke all on function private.rol_actual() from public, anon, authenticated;
grant execute on function private.rol_actual() to authenticated;

-- ---------------------------------------------------------------------------
-- Políticas RLS
-- Permisiva: el usuario activo ve solo su fila; Admin activo ve solo filas activas.
-- Restrictiva: ninguna cuenta inactiva ve datos. Las escrituras ya están bloqueadas
-- por los privilegios de PostgreSQL y por la ausencia de policies de escritura.
-- ---------------------------------------------------------------------------

create policy usuarios_select_own_or_admin
  on public.usuarios
  for select
  to authenticated
  using (
    activo
    and (
      id = auth.uid()
      or private.rol_actual() = 'administrador'
    )
  );

-- FOR SELECT es suficiente: authenticated no tiene grants de INSERT/UPDATE/DELETE
-- y no existe ninguna política permisiva de escritura. PostgreSQL rechaza cualquier
-- escritura antes de evaluar RLS, con insufficient_privilege.
create policy usuarios_active_only
  on public.usuarios
  as restrictive
  for select
  to authenticated
  using (private.usuario_activo());

-- Permite al rol interno de Supabase Auth leer usuarios al ejecutar el hook.
create policy usuarios_auth_admin_read
  on public.usuarios
  for select
  to supabase_auth_admin
  using (true);

-- ---------------------------------------------------------------------------
-- Custom Access Token Hook
-- Se ejecuta como invoker (supabase_auth_admin) y NO modifica los claims
-- obligatorios: solo añade app_metadata.app_role al objeto de claims original.
-- ---------------------------------------------------------------------------

create or replace function private.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_claims jsonb;
  v_role text;
begin
  if jsonb_typeof(event) is distinct from 'object' then
    return jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 403,
        'message', 'Solicitud de token inválida.'
      )
    );
  end if;

  begin
    v_user_id := (event ->> 'user_id')::uuid;
  exception
    when invalid_text_representation then
      v_user_id := null;
  end;

  v_claims := event -> 'claims';

  if v_user_id is null or jsonb_typeof(v_claims) is distinct from 'object' then
    return jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 403,
        'message', 'Solicitud de token inválida.'
      )
    );
  end if;

  select u.rol
    into v_role
    from public.usuarios u
   where u.id = v_user_id
     and u.activo;

  if v_role is null then
    return jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 403,
        'message', 'La cuenta de aplicación no existe o está inactiva.'
      )
    );
  end if;

  if jsonb_typeof(v_claims -> 'app_metadata') is distinct from 'object' then
    v_claims := jsonb_set(v_claims, '{app_metadata}', '{}'::jsonb, true);
  end if;

  v_claims := jsonb_set(
    v_claims,
    '{app_metadata,app_role}',
    to_jsonb(v_role),
    true
  );

  return jsonb_set(event, '{claims}', v_claims, true);
end;
$$;

comment on function private.custom_access_token_hook(jsonb) is
  'Hook de Supabase Auth: valida usuario activo y añade app_metadata.app_role.';

revoke all on function private.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function private.custom_access_token_hook(jsonb) to supabase_auth_admin;
