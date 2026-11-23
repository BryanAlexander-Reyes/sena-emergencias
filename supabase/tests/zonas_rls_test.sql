-- ZONAS.4: pruebas preparadas de RLS, constraints y contrato de public.zonas.
-- NO ejecutar contra Supabase Cloud ni contra una base de datos de producción.
-- Resultado real: NO VERIFICADA (no hay psql / Supabase CLI / Docker en el entorno local).
-- Uso previsto: ejecutar en una base local desechable DESPUÉS de aplicar
-- 20261118000000_usuarios.sql y 20261120000000_zonas.sql, y confirmar que no
-- aparece ningún mensaje con prefijo "FALLIDO". Todo se revierte con ROLLBACK.
--
-- Se asume que el seed de la migración está presente (cuatro IDs históricos).

begin;

-- ---------------------------------------------------------------------------
-- Fixtures locales de Auth y de public.usuarios. UUIDs sintéticos, sin correo
-- ni contraseña. No se envían a Supabase Cloud.
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  email_confirmed_at, created_at, updated_at
)
values
  ('61111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', null,
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), now()),
  ('62222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', null,
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), now()),
  ('63333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', null,
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), now()),
  ('64444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', null,
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), now())
on conflict (id) do nothing;

insert into public.usuarios (id, nombre, rol, activo)
values
  ('61111111-1111-1111-1111-111111111111', 'InstructorUno', 'instructor', true),
  ('62222222-2222-2222-2222-222222222222', 'AdminUno', 'administrador', true),
  ('63333333-3333-3333-3333-333333333333', 'AdminInactivo', 'administrador', false),
  ('64444444-4444-4444-4444-444444444444', 'InstructorDos', 'instructor', true)
on conflict (id) do nothing;

-- Zonas de prueba adicionales; no dependen de los contadores del seed.
insert into public.zonas (
  id, codigo, nombre, capacidad, icono, tipo, segura, activo, publico
)
values
  ('zona-test-publica', 'TP', 'Zona pública de prueba', 10, 'cube-outline', 'cafeteria', false, true, true),
  ('zona-test-privada', 'TZ', 'Zona privada de prueba', 10, 'cube-outline', 'biblioteca', false, true, false),
  ('zona-test-inactiva', 'TI', 'Zona inactiva de prueba', 10, 'cube-outline', 'pasillo', false, false, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 1. anon (Aprendiz / público): sin acceso a la tabla base; solo ve la vista.
-- ---------------------------------------------------------------------------

set local role anon;
reset request.jwt.claims;

do $$
begin
  perform 1 from public.zonas limit 1;
  raise exception 'FALLIDO: anon pudo consultar la tabla base public.zonas';
exception
  when insufficient_privilege then null;
end $$;

do $$
begin
  insert into public.zonas (id, codigo, nombre, capacidad, icono, tipo)
  values ('zona-test-anon', 'TA', 'Intento anónimo', 1, 'cube-outline', 'cafeteria');
  raise exception 'FALLIDO: anon pudo insertar en public.zonas';
exception
  when insufficient_privilege then null;
end $$;

do $$
begin
  update public.zonas set nombre = 'Intento anónimo' where id = 'zona-test-publica';
  raise exception 'FALLIDO: anon pudo actualizar public.zonas';
exception
  when insufficient_privilege then null;
end $$;

do $$
begin
  delete from public.zonas where id = 'zona-test-publica';
  raise exception 'FALLIDO: anon pudo eliminar de public.zonas';
exception
  when insufficient_privilege then null;
end $$;

do $$
declare
  v_count integer;
  v_id text;
begin
  select count(*) into v_count
  from public.zonas_publicas
  where id in ('zona-test-publica', 'zona-test-privada', 'zona-test-inactiva');
  if v_count <> 1 then
    raise exception 'FALLIDO: anon visible % zonas de prueba en la vista, esperado 1', v_count;
  end if;

  select id into v_id
  from public.zonas_publicas
  where id in ('zona-test-publica', 'zona-test-privada', 'zona-test-inactiva');
  if v_id <> 'zona-test-publica' then
    raise exception 'FALLIDO: anon vio una zona no pública o inactiva: %', v_id;
  end if;
end $$;

do $$
begin
  insert into public.zonas_publicas (id, codigo, nombre, capacidad, icono, tipo, segura, activo, publico)
  values ('zona-test-view-anon', 'TV', 'Intento en vista', 1, 'cube-outline', 'cafeteria', false, true, true);
  raise exception 'FALLIDO: anon pudo escribir en la vista';
exception
  when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Instructor activo con claim coherente: solo lectura de zonas públicas.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"64444444-4444-4444-4444-444444444444","role":"authenticated","app_metadata":{"app_role":"instructor"}}';

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.zonas
  where id in ('zona-test-publica', 'zona-test-privada', 'zona-test-inactiva');
  if v_count <> 1 then
    raise exception 'FALLIDO: instructor visible % zonas en la base, esperado 1', v_count;
  end if;

  select count(*) into v_count
  from public.zonas_publicas
  where id in ('zona-test-publica', 'zona-test-privada', 'zona-test-inactiva');
  if v_count <> 1 then
    raise exception 'FALLIDO: instructor visible % zonas en la vista, esperado 1', v_count;
  end if;
end $$;

do $$
begin
  insert into public.zonas (id, codigo, nombre, capacidad, icono, tipo)
  values ('zona-test-instructor', 'TI2', 'Intento instructor', 1, 'cube-outline', 'cafeteria');
  raise exception 'FALLIDO: instructor pudo insertar zonas';
exception
  when insufficient_privilege then null;
end $$;

do $$
begin
  update public.zonas set nombre = 'Intento instructor' where id = 'zona-test-publica';
  if found then
    raise exception 'FALLIDO: instructor pudo actualizar zonas';
  end if;
end $$;

do $$
begin
  delete from public.zonas where id = 'zona-test-publica';
  raise exception 'FALLIDO: instructor pudo eliminar zonas';
exception
  when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------------------
-- 3. JWT con app_role obsoleto: el helper de PostgreSQL manda.
-- DB dice instructor; el token dice administrador. No debe escalar.
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"61111111-1111-1111-1111-111111111111","role":"authenticated","app_metadata":{"app_role":"administrador"}}';

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.zonas
  where id in ('zona-test-publica', 'zona-test-privada', 'zona-test-inactiva');
  if v_count <> 1 then
    raise exception 'FALLIDO: claim obsoleto concedió % zonas, esperado 1', v_count;
  end if;
end $$;

do $$
begin
  insert into public.zonas (id, codigo, nombre, capacidad, icono, tipo)
  values ('zona-test-claim-falso', 'TF', 'Intento con claim falso', 1, 'cube-outline', 'cafeteria');
  raise exception 'FALLIDO: un claim app_role obsoleto permitió insertar';
exception
  when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Administrador activo: lee todo en la base, escribe, pero no borra.
-- El token dice instructor para demostrar que no se usa el claim.
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"62222222-2222-2222-2222-222222222222","role":"authenticated","app_metadata":{"app_role":"instructor"}}';

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.zonas
  where id in ('zona-test-publica', 'zona-test-privada', 'zona-test-inactiva');
  if v_count <> 3 then
    raise exception 'FALLIDO: administrador visible % zonas de prueba, esperado 3', v_count;
  end if;

  -- La vista sigue siendo el subconjunto público, también para el administrador.
  select count(*) into v_count
  from public.zonas_publicas
  where id in ('zona-test-publica', 'zona-test-privada', 'zona-test-inactiva');
  if v_count <> 1 then
    raise exception 'FALLIDO: la vista expuso % zonas al administrador, esperado 1', v_count;
  end if;
end $$;

do $$
declare
  v_before timestamptz;
begin
  insert into public.zonas (
    id, codigo, nombre, capacidad, icono, tipo, segura, activo, publico,
    creado_en, actualizado_en
  )
  values (
    'zona-test-admin-write', 'AW', 'Escritura admin', 5, 'cube-outline', 'pasillo',
    false, true, true, now() - interval '1 hour', now() - interval '1 hour'
  );

  select actualizado_en into v_before
  from public.zonas
  where id = 'zona-test-admin-write';

  update public.zonas
  set nombre = 'Escritura admin actualizada'
  where id = 'zona-test-admin-write';
  if not found then
    raise exception 'FALLIDO: administrador no pudo actualizar una zona';
  end if;

  if (select actualizado_en from public.zonas where id = 'zona-test-admin-write') <= v_before then
    raise exception 'FALLIDO: el trigger no actualizó actualizado_en';
  end if;
end $$;

do $$
begin
  delete from public.zonas where id = 'zona-test-admin-write';
  raise exception 'FALLIDO: administrador pudo eliminar zonas';
exception
  when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Cuenta inactiva con JWT de administrador: sin acceso a base ni a vista.
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"63333333-3333-3333-3333-333333333333","role":"authenticated","app_metadata":{"app_role":"administrador"}}';

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.zonas;
  if v_count <> 0 then
    raise exception 'FALLIDO: cuenta inactiva visible % zonas en la base, esperado 0', v_count;
  end if;

  select count(*) into v_count from public.zonas_publicas;
  if v_count <> 0 then
    raise exception 'FALLIDO: cuenta inactiva visible % zonas en la vista, esperado 0', v_count;
  end if;
end $$;

do $$
begin
  insert into public.zonas (id, codigo, nombre, capacidad, icono, tipo)
  values ('zona-test-inactivo-write', 'IW', 'Intento inactivo', 1, 'cube-outline', 'cafeteria');
  raise exception 'FALLIDO: cuenta inactiva pudo insertar';
exception
  when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------------------
-- 6-9. Constraints reales de PostgreSQL (ejecutadas por el dueño de la sesión).
-- ---------------------------------------------------------------------------

reset role;
reset request.jwt.claims;

do $$
begin
  insert into public.zonas (id, codigo, nombre, capacidad, icono, tipo)
  values ('ID_Mayusculas', 'X', 'ID inválido', 1, 'cube-outline', 'cafeteria');
  raise exception 'FALLIDO: se permitió un ID con mayúsculas';
exception
  when check_violation then null;
end $$;

do $$
begin
  insert into public.zonas (id, codigo, nombre, capacidad, icono, tipo)
  values ('zona-test-tipo', 'X', 'Tipo inválido', 1, 'cube-outline', 'tipo-raro');
  raise exception 'FALLIDO: se permitió un tipo fuera de ZONE_TYPES';
exception
  when check_violation then null;
end $$;

do $$
begin
  insert into public.zonas (id, codigo, nombre, capacidad, icono, tipo)
  values ('zona-test-capacidad', 'X', 'Capacidad inválida', 0, 'cube-outline', 'cafeteria');
  raise exception 'FALLIDO: se permitió capacidad 0';
exception
  when check_violation then null;
end $$;

do $$
begin
  insert into public.zonas (id, codigo, nombre, capacidad, icono, tipo, map_x)
  values ('zona-test-map-incompleto', 'X', 'Mapa incompleto', 1, 'cube-outline', 'cafeteria', 10);
  raise exception 'FALLIDO: se permitió geometría parcial';
exception
  when check_violation then null;
end $$;

do $$
begin
  insert into public.zonas (id, codigo, nombre, capacidad, icono, tipo, segura)
  values ('zona-test-segura-dup', 'SD', 'Segunda zona segura', 1, 'shield-outline', 'punto-encuentro', true);
  raise exception 'FALLIDO: se permitió más de una zona segura';
exception
  when unique_violation then null;
end $$;

-- Reinserción del seed: no debe sobrescribir ni duplicar los cuatro IDs.
do $$
declare
  v_before integer;
  v_after integer;
begin
  select count(*) into v_before
  from public.zonas
  where id in ('cafeteria', 'biblioteca', 'pasillo-principal', 'zona-segura');

  insert into public.zonas (
    id, codigo, nombre, capacidad, icono, tipo, segura, activo, publico,
    map_x, map_y, ancho, alto, etiqueta_x, etiqueta_y
  )
  values
    ('cafeteria', 'A', 'Cafetería', 50, 'cafe-outline', 'cafeteria', false, true, true, 28, 52, 144, 112, 100, 108),
    ('biblioteca', 'B', 'Biblioteca', 60, 'book-outline', 'biblioteca', false, true, true, 188, 52, 144, 112, 260, 108),
    ('pasillo-principal', 'C', 'Pasillo principal', 50, 'walk-outline', 'pasillo', false, true, true, 28, 200, 304, 96, 180, 238),
    ('zona-segura', 'Zona segura', 'Punto de encuentro', 100, 'shield-checkmark-outline', 'punto-encuentro', true, true, true, 88, 342, 184, 100, 180, 392)
  on conflict (id) do nothing;

  select count(*) into v_after
  from public.zonas
  where id in ('cafeteria', 'biblioteca', 'pasillo-principal', 'zona-segura');

  if v_before <> 4 or v_after <> 4 then
    raise exception 'FALLIDO: seed no idempotente (antes %, después %)', v_before, v_after;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Contrato exacto: columnas de la vista y ausencia de datos prohibidos.
-- ---------------------------------------------------------------------------

do $$
declare
  v_cols text;
  v_count integer;
begin
  select string_agg(column_name, ',' order by ordinal_position) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'zonas_publicas';

  if v_cols <> 'id,codigo,nombre,capacidad,icono,tipo,segura,activo,publico,map_x,map_y,ancho,alto,etiqueta_x,etiqueta_y' then
    raise exception 'FALLIDO: columnas de zonas_publicas = %', v_cols;
  end if;

  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'zonas';
  if v_count <> 17 then
    raise exception 'FALLIDO: public.zonas tiene % columnas, esperado 17', v_count;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'zonas'
      and column_name ~* '^(people|ocupacion|occupancy|mqtt|password|nota|notas)'
  ) then
    raise exception 'FALLIDO: public.zonas contiene una columna prohibida';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 11. RLS, policies, grants y opciones de la vista.
-- ---------------------------------------------------------------------------

do $$
declare
  v_count integer;
  v_type text;
  v_cmd text;
  v_opts text[];
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'zonas' and c.relrowsecurity
  ) then
    raise exception 'FALLIDO: RLS no está habilitado en public.zonas';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'zonas'
      and (cmd = 'DELETE' or (cmd = 'ALL' and policyname <> 'zonas_active_only'))
  ) then
    raise exception 'FALLIDO: existe una policy de DELETE o ALL inesperada';
  end if;

  select poltype, cmd into v_type, v_cmd
  from pg_policies
  where schemaname = 'public' and tablename = 'zonas'
    and policyname = 'zonas_active_only';
  if v_type is distinct from 'R' or v_cmd is distinct from 'ALL' then
    raise exception 'FALLIDO: zonas_active_only debe ser RESTRICTIVE FOR ALL';
  end if;

  if has_table_privilege('anon', 'public.zonas', 'SELECT')
     or has_table_privilege('anon', 'public.zonas', 'INSERT')
     or has_table_privilege('anon', 'public.zonas', 'UPDATE')
     or has_table_privilege('anon', 'public.zonas', 'DELETE')
     or has_table_privilege('anon', 'public.zonas', 'TRUNCATE') then
    raise exception 'FALLIDO: anon tiene privilegios sobre public.zonas';
  end if;

  if not has_table_privilege('authenticated', 'public.zonas', 'SELECT')
     or not has_table_privilege('authenticated', 'public.zonas', 'INSERT')
     or not has_table_privilege('authenticated', 'public.zonas', 'UPDATE') then
    raise exception 'FALLIDO: faltan privilegios mínimos de administración';
  end if;

  if has_table_privilege('authenticated', 'public.zonas', 'DELETE')
     or has_table_privilege('authenticated', 'public.zonas', 'TRUNCATE') then
    raise exception 'FALLIDO: authenticated tiene privilegios de borrado';
  end if;

  if not has_table_privilege('anon', 'public.zonas_publicas', 'SELECT')
     or not has_table_privilege('authenticated', 'public.zonas_publicas', 'SELECT') then
    raise exception 'FALLIDO: falta SELECT en la vista pública';
  end if;

  if has_table_privilege('anon', 'public.zonas_publicas', 'INSERT')
     or has_table_privilege('anon', 'public.zonas_publicas', 'UPDATE')
     or has_table_privilege('anon', 'public.zonas_publicas', 'DELETE')
     or has_table_privilege('authenticated', 'public.zonas_publicas', 'INSERT')
     or has_table_privilege('authenticated', 'public.zonas_publicas', 'UPDATE')
     or has_table_privilege('authenticated', 'public.zonas_publicas', 'DELETE') then
    raise exception 'FALLIDO: la vista pública admite escrituras';
  end if;

  select reloptions into v_opts
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'zonas_publicas';

  if v_opts is null or not ('security_barrier=true' = any(v_opts)) then
    raise exception 'FALLIDO: la vista no usa security_barrier';
  end if;

  if 'security_invoker=true' = any(v_opts) then
    raise exception 'FALLIDO: la vista no debe ser security_invoker';
  end if;
end $$;

-- Una sola zona segura y debe ser la histórica.
do $$
declare
  v_count integer;
  v_id text;
begin
  select count(*) into v_count from public.zonas where segura;
  if v_count <> 1 then
    raise exception 'FALLIDO: hay % zonas seguras, esperado 1', v_count;
  end if;

  select id into v_id from public.zonas where segura;
  if v_id <> 'zona-segura' then
    raise exception 'FALLIDO: la zona segura es %, esperado zona-segura', v_id;
  end if;
end $$;

rollback;
