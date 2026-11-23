-- Fase 5.2.2, Punto A.1: pruebas preparadas del Custom Access Token Hook.
-- NO ejecutar contra Supabase Cloud ni contra una base de datos de producción.
-- Resultado real: NO VERIFICADA (no hay psql / Supabase CLI / Docker en el entorno local).
-- Uso previsto: ejecutar en una base local desechable; todas las fixtures se revierten.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures locales sintéticas (sin contraseñas, sin cuentas reales).
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
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', null,
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', null,
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'authenticated', 'authenticated', null,
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), now()),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'authenticated', 'authenticated', null,
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), now())
on conflict (id) do nothing;

insert into public.usuarios (id, nombre, rol, activo)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'HookValido',   'instructor', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'HookInactivo', 'instructor', false),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'HookAdmin',    'administrador', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- El hook se ejecuta como supabase_auth_admin, tal como lo invoca Supabase Auth.
-- ---------------------------------------------------------------------------

set local role supabase_auth_admin;

-- Caso válido: conserva claims obligatorios y añade solo app_role.
do $$
declare
  v_user_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_claims jsonb;
  v_event jsonb;
  v_result jsonb;
begin
  v_claims := jsonb_build_object(
    'iss', 'https://local.invalid/auth/v1',
    'aud', 'authenticated',
    'exp', 4102444800,
    'iat', 1700000000,
    'sub', v_user_id::text,
    'email', '',
    'phone', '',
    'app_metadata', jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    'user_metadata', '{}'::jsonb,
    'role', 'authenticated',
    'aal', 'aal1',
    'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', 1700000000)),
    'session_id', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'is_anonymous', false
  );

  v_event := jsonb_build_object(
    'user_id', v_user_id::text,
    'claims', v_claims,
    'authentication_method', 'password'
  );

  v_result := private.custom_access_token_hook(v_event);

  if v_result -> 'error' is not null then
    raise exception 'FALLIDO: el hook rechazó un usuario activo: %', v_result -> 'error' ->> 'message';
  end if;

  if not jsonb_exists_all(v_result -> 'claims', array[
    'iss', 'aud', 'exp', 'iat', 'sub', 'email', 'phone',
    'app_metadata', 'user_metadata', 'role', 'aal', 'amr',
    'session_id', 'is_anonymous'
  ]) then
    raise exception 'FALLIDO: el hook eliminó claims obligatorios';
  end if;

  if (v_result -> 'claims') is distinct from v_claims then
    -- Solo se permite el cambio previsto dentro de app_metadata.app_role.
    if (v_result -> 'claims' - 'app_metadata') is distinct from (v_claims - 'app_metadata') then
      raise exception 'FALLIDO: el hook modificó claims fuera de app_metadata';
    end if;
  end if;

  if (v_result -> 'claims' ->> 'sub') is distinct from v_user_id::text then
    raise exception 'FALLIDO: el hook modificó el claim sub';
  end if;

  if (v_result -> 'claims' ->> 'role') is distinct from 'authenticated' then
    raise exception 'FALLIDO: el hook modificó el claim role';
  end if;

  if (v_result -> 'claims' -> 'app_metadata' ->> 'provider') is distinct from 'email' then
    raise exception 'FALLIDO: el hook sobrescribió app_metadata existente';
  end if;

  if (v_result -> 'claims' -> 'app_metadata' ->> 'app_role') is distinct from 'instructor' then
    raise exception 'FALLIDO: el hook no inyectó app_role desde public.usuarios';
  end if;

  if (v_result -> 'claims' -> 'user_metadata') is distinct from v_claims -> 'user_metadata' then
    raise exception 'FALLIDO: el hook modificó user_metadata';
  end if;
end $$;

-- El rol se toma de PostgreSQL, no del event: un claim falso debe ser corregido.
do $$
declare
  v_user_id uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  v_event jsonb;
  v_result jsonb;
begin
  v_event := jsonb_build_object(
    'user_id', v_user_id::text,
    'claims', jsonb_build_object(
      'sub', v_user_id::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('app_role', 'instructor')
    ),
    'authentication_method', 'token_refresh'
  );

  v_result := private.custom_access_token_hook(v_event);

  if v_result -> 'error' is not null then
    raise exception 'FALLIDO: el hook rechazó un administrador activo';
  end if;

  if (v_result -> 'claims' -> 'app_metadata' ->> 'app_role') is distinct from 'administrador' then
    raise exception 'FALLIDO: el hook no corrigió app_role desde public.usuarios';
  end if;
end $$;

-- Usuario inexistente: debe devolver error HTTP 403 sin claims.
do $$
declare
  v_user_id uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  v_event jsonb;
  v_result jsonb;
begin
  v_event := jsonb_build_object(
    'user_id', v_user_id::text,
    'claims', jsonb_build_object(
      'sub', v_user_id::text,
      'role', 'authenticated',
      'app_metadata', '{}'::jsonb
    ),
    'authentication_method', 'password'
  );

  v_result := private.custom_access_token_hook(v_event);

  if v_result -> 'error' is null then
    raise exception 'FALLIDO: el hook aceptó un usuario inexistente';
  end if;

  if (v_result -> 'error' ->> 'http_code')::integer <> 403 then
    raise exception 'FALLIDO: el hook devolvió un código distinto de 403 para usuario inexistente';
  end if;

  if jsonb_exists(v_result, 'claims') then
    raise exception 'FALLIDO: el hook devolvió claims junto con un error';
  end if;
end $$;

-- Usuario inactivo: debe devolver error HTTP 403 sin claims.
do $$
declare
  v_user_id uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_event jsonb;
  v_result jsonb;
begin
  v_event := jsonb_build_object(
    'user_id', v_user_id::text,
    'claims', jsonb_build_object(
      'sub', v_user_id::text,
      'role', 'authenticated',
      'app_metadata', '{}'::jsonb
    ),
    'authentication_method', 'token_refresh'
  );

  v_result := private.custom_access_token_hook(v_event);

  if v_result -> 'error' is null then
    raise exception 'FALLIDO: el hook aceptó un usuario inactivo';
  end if;

  if (v_result -> 'error' ->> 'http_code')::integer <> 403 then
    raise exception 'FALLIDO: el hook devolvió un código distinto de 403 para usuario inactivo';
  end if;

  if jsonb_exists(v_result, 'claims') then
    raise exception 'FALLIDO: el hook devolvió claims junto con un error de usuario inactivo';
  end if;
end $$;

-- Eventos mal formados: deben rechazarse sin exponer claims.
do $$
declare
  v_result jsonb;
begin
  v_result := private.custom_access_token_hook('[]'::jsonb);
  if v_result -> 'error' is null then
    raise exception 'FALLIDO: el hook aceptó un evento que no es objeto';
  end if;

  v_result := private.custom_access_token_hook(jsonb_build_object(
    'user_id', 'no-es-un-uuid',
    'claims', '{}'::jsonb
  ));
  if v_result -> 'error' is null then
    raise exception 'FALLIDO: el hook aceptó un user_id inválido';
  end if;

  v_result := private.custom_access_token_hook(jsonb_build_object(
    'user_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ));
  if v_result -> 'error' is null then
    raise exception 'FALLIDO: el hook aceptó un evento sin claims';
  end if;
end $$;

rollback;
