-- Fase 5.2.2, Punto A.1: pruebas preparadas de RLS para public.usuarios.
-- NO ejecutar contra Supabase Cloud ni contra una base de datos de producción.
-- Resultado real: NO VERIFICADA (no hay psql / Supabase CLI / Docker en el entorno local).
-- Uso previsto: ejecutar en una base local desechable y confirmar que no hay salidas
-- con prefijo "FALLIDO"; todas las inserciones de fixtures se revierten con ROLLBACK.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures locales: UUID sintéticos dentro de una transacción revertible.
-- No son cuentas reales, no tienen contraseña y nunca se envían a Supabase Cloud.
-- ---------------------------------------------------------------------------

insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  email_confirmed_at,
  created_at,
  updated_at
)
values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', null,
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', null,
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), now()),
  ('33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', null,
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), now()),
  ('44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', null,
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), now()),
  ('55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', null,
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), now())
on conflict (id) do nothing;

insert into public.usuarios (id, nombre, rol, activo)
values
  ('11111111-1111-1111-1111-111111111111', 'InstructorUno', 'instructor', true),
  ('22222222-2222-2222-2222-222222222222', 'InstructorDos', 'instructor', true),
  ('33333333-3333-3333-3333-333333333333', 'AdminUno',      'administrador', true),
  ('44444444-4444-4444-4444-444444444444', 'InactivoUno',   'instructor', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 1. Usuario anónimo sin acceso.
-- ---------------------------------------------------------------------------

set local role anon;
reset request.jwt.claims;

do $$
begin
  perform 1 from public.usuarios limit 1;
  raise exception 'FALLIDO: anon pudo consultar usuarios';
exception
  when insufficient_privilege then null;
end $$;

do $$
begin
  insert into public.usuarios (id, nombre, rol)
  values ('55555555-5555-5555-5555-555555555555', 'AnonInsert', 'instructor');
  raise exception 'FALLIDO: anon pudo crear usuarios';
exception
  when insufficient_privilege then null;
end $$;

do $$
begin
  update public.usuarios set rol = 'administrador' where id = '11111111-1111-1111-1111-111111111111';
  raise exception 'FALLIDO: anon pudo modificar usuarios';
exception
  when insufficient_privilege then null;
end $$;

do $$
begin
  delete from public.usuarios where id = '11111111-1111-1111-1111-111111111111';
  raise exception 'FALLIDO: anon pudo eliminar usuarios';
exception
  when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2-6. Instructor activo: solo su fila, sin escrituras.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","app_metadata":{"app_role":"instructor"}}';

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.usuarios;
  if v_count <> 1 then
    raise exception 'FALLIDO: instructor visible % usuarios, esperado 1', v_count;
  end if;

  select count(*) into v_count
  from public.usuarios
  where id = '22222222-2222-2222-2222-222222222222';
  if v_count <> 0 then
    raise exception 'FALLIDO: instructor pudo consultar el usuario de otro instructor';
  end if;
end $$;

do $$
begin
  update public.usuarios set rol = 'administrador' where id = '11111111-1111-1111-1111-111111111111';
  raise exception 'FALLIDO: instructor pudo modificar su rol';
exception
  when insufficient_privilege then null;
end $$;

do $$
begin
  update public.usuarios set activo = false where id = '11111111-1111-1111-1111-111111111111';
  raise exception 'FALLIDO: instructor pudo desactivar cuentas';
exception
  when insufficient_privilege then null;
end $$;

do $$
begin
  insert into public.usuarios (id, nombre, rol)
  values ('55555555-5555-5555-5555-555555555555', 'InstructorNuevo', 'instructor');
  raise exception 'FALLIDO: instructor pudo registrar cuentas';
exception
  when insufficient_privilege then null;
end $$;

do $$
begin
  delete from public.usuarios where id = '11111111-1111-1111-1111-111111111111';
  raise exception 'FALLIDO: instructor pudo eliminar usuarios';
exception
  when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------------------
-- 7-8. Administrador activo: consultas permitidas, sin escrituras directas.
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","app_metadata":{"app_role":"administrador"}}';

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.usuarios;
  if v_count <> 3 then
    raise exception 'FALLIDO: administrador visible % usuarios activos, esperado 3', v_count;
  end if;

  select count(*) into v_count
  from public.usuarios
  where id = '22222222-2222-2222-2222-222222222222';
  if v_count <> 1 then
    raise exception 'FALLIDO: administrador no pudo consultar el usuario de instructor permitido';
  end if;

  select count(*) into v_count
  from public.usuarios
  where id = '44444444-4444-4444-4444-444444444444';
  if v_count <> 0 then
    raise exception 'FALLIDO: administrador pudo consultar un usuario inactivo';
  end if;
end $$;

do $$
begin
  insert into public.usuarios (id, nombre, rol)
  values ('55555555-5555-5555-5555-555555555555', 'AdminNuevo', 'instructor');
  raise exception 'FALLIDO: administrador pudo crear usuarios directamente';
exception
  when insufficient_privilege then null;
end $$;

do $$
begin
  update public.usuarios set rol = 'instructor' where id = '22222222-2222-2222-2222-222222222222';
  raise exception 'FALLIDO: administrador pudo cambiar roles directamente';
exception
  when insufficient_privilege then null;
end $$;

do $$
begin
  delete from public.usuarios where id = '22222222-2222-2222-2222-222222222222';
  raise exception 'FALLIDO: administrador pudo eliminar usuarios directamente';
exception
  when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Cuenta inactiva sin acceso a datos protegidos.
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","app_metadata":{"app_role":"instructor"}}';

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.usuarios;
  if v_count <> 0 then
    raise exception 'FALLIDO: cuenta inactiva visible % usuarios, esperado 0', v_count;
  end if;

  select count(*) into v_count
  from public.usuarios
  where id = '44444444-4444-4444-4444-444444444444';
  if v_count <> 0 then
    raise exception 'FALLIDO: cuenta inactiva pudo consultar su propio usuario';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 10-14. Restricciones reales de PostgreSQL (ejecutadas por el dueño de la sesión).
-- ---------------------------------------------------------------------------

reset role;
reset request.jwt.claims;

do $$
begin
  insert into public.usuarios (id, nombre, rol)
  values ('55555555-5555-5555-5555-555555555555', 'instructoruno', 'instructor');
  raise exception 'FALLIDO: se permitió nombre duplicado exacto';
exception
  when unique_violation then null;
end $$;

do $$
begin
  insert into public.usuarios (id, nombre, rol)
  values ('55555555-5555-5555-5555-555555555555', 'InstructorUno', 'instructor');
  raise exception 'FALLIDO: se permitió nombre duplicado con distinta capitalización';
exception
  when unique_violation then null;
end $$;

do $$
begin
  insert into public.usuarios (id, nombre, rol)
  values ('55555555-5555-5555-5555-555555555555', 'RolInvalido', 'aprendiz');
  raise exception 'FALLIDO: se permitió un rol inválido';
exception
  when check_violation then null;
end $$;

do $$
begin
  insert into public.usuarios (id, nombre, rol)
  values ('55555555-5555-5555-5555-555555555555', 'Ab', 'instructor');
  raise exception 'FALLIDO: se permitió un nombre demasiado corto';
exception
  when check_violation then null;
end $$;

do $$
begin
  insert into public.usuarios (id, nombre, rol)
  values ('55555555-5555-5555-5555-555555555555', 'Nombre Invalido', 'instructor');
  raise exception 'FALLIDO: se permitió un nombre con caracteres no válidos';
exception
  when check_violation then null;
end $$;

-- ---------------------------------------------------------------------------
-- 15-18. Esquema exacto, RLS activo y privilegios mínimos.
-- ---------------------------------------------------------------------------

do $$
declare
  v_count integer;
  v_extra text;
begin
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'usuarios';
  if v_count <> 4 then
    raise exception 'FALLIDO: public.usuarios tiene % columnas, esperado 4', v_count;
  end if;

  select string_agg(column_name, ', ' order by ordinal_position) into v_extra
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'usuarios'
    and column_name not in ('id', 'nombre', 'rol', 'activo');
  if v_extra is not null then
    raise exception 'FALLIDO: columnas inesperadas en public.usuarios: %', v_extra;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'usuarios'
      and column_name in (
        'password', 'password_hash', 'encrypted_password',
        'username_key', 'created_at', 'updated_at'
      )
  ) then
    raise exception 'FALLIDO: public.usuarios contiene una columna prohibida';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'usuarios'
      and c.relrowsecurity
  ) then
    raise exception 'FALLIDO: RLS no está habilitado en public.usuarios';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'usuarios'
      and policyname = 'usuarios_active_only'
      and cmd <> 'SELECT'
  ) then
    raise exception 'FALLIDO: usuarios_active_only debe ser FOR SELECT';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'usuarios'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) then
    raise exception 'FALLIDO: no deben existir policies de escritura';
  end if;
end $$;

do $$
begin
  if has_table_privilege('anon', 'public.usuarios', 'SELECT')
     or has_table_privilege('anon', 'public.usuarios', 'INSERT')
     or has_table_privilege('anon', 'public.usuarios', 'UPDATE')
     or has_table_privilege('anon', 'public.usuarios', 'DELETE')
     or has_table_privilege('anon', 'public.usuarios', 'TRUNCATE') then
    raise exception 'FALLIDO: anon tiene privilegios sobre public.usuarios';
  end if;

  if has_table_privilege('authenticated', 'public.usuarios', 'INSERT')
     or has_table_privilege('authenticated', 'public.usuarios', 'UPDATE')
     or has_table_privilege('authenticated', 'public.usuarios', 'DELETE')
     or has_table_privilege('authenticated', 'public.usuarios', 'TRUNCATE') then
    raise exception 'FALLIDO: authenticated tiene privilegios de escritura sobre public.usuarios';
  end if;

  if has_schema_privilege('anon', 'private', 'USAGE') then
    raise exception 'FALLIDO: anon tiene USAGE sobre el esquema private';
  end if;

  if not has_schema_privilege('authenticated', 'private', 'USAGE') then
    raise exception 'FALLIDO: authenticated necesita USAGE sobre private para invocar las funciones de RLS';
  end if;
end $$;

do $$
begin
  if has_function_privilege('anon', 'private.custom_access_token_hook(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.custom_access_token_hook(jsonb)', 'EXECUTE') then
    raise exception 'FALLIDO: el hook es ejecutable por anon/authenticated';
  end if;

  if not has_function_privilege('supabase_auth_admin', 'private.custom_access_token_hook(jsonb)', 'EXECUTE') then
    raise exception 'FALLIDO: supabase_auth_admin no puede ejecutar el hook';
  end if;

  if has_function_privilege('anon', 'private.usuario_activo(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'private.usuario_activo()', 'EXECUTE')
     or has_function_privilege('anon', 'private.rol_actual()', 'EXECUTE') then
    raise exception 'FALLIDO: funciones auxiliares son ejecutables por anon';
  end if;

  if has_function_privilege('authenticated', 'private.usuario_activo(uuid)', 'EXECUTE')
     or has_function_privilege('supabase_auth_admin', 'private.usuario_activo(uuid)', 'EXECUTE') then
    raise exception 'FALLIDO: la función auxiliar parametrizada está expuesta';
  end if;

  if not has_function_privilege('authenticated', 'private.usuario_activo()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'private.rol_actual()', 'EXECUTE') then
    raise exception 'FALLIDO: las funciones usadas por RLS no están disponibles para authenticated';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in ('usuario_activo', 'rol_actual')
      and (
        not p.prosecdef
        or not coalesce(p.proconfig::text like '%search_path%', false)
      )
  ) then
    raise exception 'FALLIDO: una función auxiliar no es SECURITY DEFINER con search_path fijo';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'custom_access_token_hook'
      and p.prosecdef
  ) then
    raise exception 'FALLIDO: el hook no debe ser SECURITY DEFINER';
  end if;
end $$;

rollback;
