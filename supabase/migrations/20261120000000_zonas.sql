-- ZONAS.4: configuración de zonas en Supabase (preparación LOCAL).
-- NO ejecutar contra Supabase Cloud sin autorización explícita nueva.
-- Debe ejecutarse con el rol postgres, igual que 20261118000000_usuarios.sql.
--
-- Dependencia: esta migración reutiliza private.usuario_activo() y
-- private.rol_actual() sin modificarlos. No crea usuarios, no cambia Auth,
-- no despliega Edge Functions, no almacena ocupación real ni credenciales MQTT.
-- ZONE_CONFIG_MODE permanece 'demo' en la aplicación.

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in ('usuario_activo', 'rol_actual')
  ) then
    raise exception
      'FALLIDO: falta la migración de usuarios; se requieren private.usuario_activo() y private.rol_actual()';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Tabla de configuración pura de zonas.
-- No existe ninguna columna de ocupación, sensores, MQTT ni notas internas.
-- ---------------------------------------------------------------------------

create table public.zonas (
  id text primary key,
  codigo text not null,
  nombre text not null,
  capacidad integer not null,
  icono text not null,
  tipo text not null,
  segura boolean not null default false,
  activo boolean not null default true,
  publico boolean not null default true,

  -- Geometría opcional del SVG. Todas presentes o todas ausentes.
  map_x double precision,
  map_y double precision,
  ancho double precision,
  alto double precision,
  etiqueta_x double precision,
  etiqueta_y double precision,

  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  -- Equivalencia con los validadores de ZONAS.2.
  constraint zonas_id_check
    check (char_length(id) between 1 and 64 and id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint zonas_codigo_check
    check (char_length(codigo) between 1 and 32 and btrim(codigo) <> ''),
  constraint zonas_nombre_check
    check (char_length(nombre) between 1 and 120 and btrim(nombre) <> ''),
  constraint zonas_capacidad_check
    check (capacidad > 0),
  constraint zonas_icono_check
    check (
      char_length(icono) between 1 and 64
      and btrim(icono) <> ''
      and icono ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
  constraint zonas_tipo_check
    check (tipo in ('cafeteria', 'biblioteca', 'pasillo', 'punto-encuentro')),
  constraint zonas_map_complete_check
    check (
      (
        map_x is null and map_y is null and ancho is null and alto is null
        and etiqueta_x is null and etiqueta_y is null
      )
      or
      (
        map_x is not null and map_y is not null and ancho is not null and alto is not null
        and etiqueta_x is not null and etiqueta_y is not null
      )
    ),
  constraint zonas_map_ranges_check
    check (
      (map_x is null or map_x >= 0)
      and (map_y is null or map_y >= 0)
      and (ancho is null or ancho > 0)
      and (alto is null or alto > 0)
    )
);

-- Índice parcial: solo las filas con segura = true participan en la unicidad.
-- Las demás zonas pueden coexistir sin límite.
create unique index zonas_single_segura_key on public.zonas (segura) where segura;

comment on table public.zonas is
  'Configuración de zonas del SENA. No contiene ocupación real, MQTT ni secretos.';
comment on column public.zonas.id is
  'Identificador textual estable, compatible con los cuatro IDs históricos.';
comment on column public.zonas.capacidad is
  'Capacidad configurada de la zona; entero positivo. No es la ocupación actual.';
comment on column public.zonas.publico is
  'Si la zona puede exponerse en la vista pública.';
comment on column public.zonas.creado_en is
  'Fecha de creación de la configuración, administrativa; no se expone en la vista pública.';

-- ---------------------------------------------------------------------------
-- 2. actualizado_en automático.
-- Función nueva en private; no modifica los helpers existentes.
-- ---------------------------------------------------------------------------

create or replace function private.zonas_set_actualizado_en()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

revoke all on function private.zonas_set_actualizado_en() from public, anon, authenticated;

create trigger zonas_touch_actualizado_en
before update on public.zonas
for each row execute function private.zonas_set_actualizado_en();

-- ---------------------------------------------------------------------------
-- 3. RLS y privilegios mínimos sobre la tabla base.
-- anon no recibe ningún privilegio sobre public.zonas.
-- authenticated recibe SELECT/INSERT/UPDATE; nunca DELETE ni TRUNCATE.
-- Las decisiones de rol se toman en PostgreSQL con private.rol_actual(),
-- nunca con app_metadata.app_role del JWT.
-- ---------------------------------------------------------------------------

alter table public.zonas enable row level security;

revoke all on table public.zonas from public, anon, authenticated;
grant select, insert, update on table public.zonas to authenticated;

create policy zonas_select_admin_or_public
  on public.zonas
  for select
  to authenticated
  using (
    private.rol_actual() = 'administrador'
    or (activo and publico)
  );

create policy zonas_insert_admin
  on public.zonas
  for insert
  to authenticated
  with check (private.rol_actual() = 'administrador');

create policy zonas_update_admin
  on public.zonas
  for update
  to authenticated
  using (private.rol_actual() = 'administrador')
  with check (private.rol_actual() = 'administrador');

-- Restrictiva: ninguna cuenta inactiva lee ni escribe, aunque el JWT conserve
-- un app_role antiguo. Se aplica también a INSERT/UPDATE mediante WITH CHECK.
create policy zonas_active_only
  on public.zonas
  as restrictive
  for all
  to authenticated
  using (private.usuario_activo())
  with check (private.usuario_activo());

-- ---------------------------------------------------------------------------
-- 4. Vista pública.
-- El propietario es postgres (la migración se ejecuta con ese rol) y la vista
-- no es security_invoker: anon/authenticated nunca consultan la tabla base a
-- través de la API de datos. Por eso la vista replica el filtro activo/publico
-- y bloquea cuentas autenticadas inactivas con private.usuario_activo().
-- RLS sigue activo en la tabla base para accesos directos con privilegios.
-- ---------------------------------------------------------------------------

create view public.zonas_publicas with (security_barrier = true) as
select
  z.id,
  z.codigo,
  z.nombre,
  z.capacidad,
  z.icono,
  z.tipo,
  z.segura,
  z.activo,
  z.publico,
  z.map_x,
  z.map_y,
  z.ancho,
  z.alto,
  z.etiqueta_x,
  z.etiqueta_y
from public.zonas z
where z.activo
  and z.publico
  and (
    -- Aprendiz / público: sin UID (anon) ve zonas públicas.
    -- Instructor y Administrador activos: también las ven.
    -- Cuenta inactiva con JWT antiguo: auth.uid() no es null y falla el helper.
    auth.uid() is null
    or private.usuario_activo()
  );

comment on view public.zonas_publicas is
  'Columnas exactas consumidas por SupabaseZonesRepository. Sin notas ni campos administrativos.';

revoke all on public.zonas_publicas from public, anon, authenticated;
grant select on public.zonas_publicas to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Seed controlado de las cuatro zonas históricas.
-- ON CONFLICT DO NOTHING conserva cualquier fila existente con el mismo ID.
-- La geometría se toma de src/app/features/mapa/map-layout.ts para que la
-- futura fuente remota no cambie el plano actual. No se inserta ocupación.
-- ---------------------------------------------------------------------------

insert into public.zonas (
  id, codigo, nombre, capacidad, icono, tipo, segura, activo, publico,
  map_x, map_y, ancho, alto, etiqueta_x, etiqueta_y
)
values
  ('cafeteria', 'A', 'Cafetería', 50, 'cafe-outline', 'cafeteria', false, true, true,
   28, 52, 144, 112, 100, 108),
  ('biblioteca', 'B', 'Biblioteca', 60, 'book-outline', 'biblioteca', false, true, true,
   188, 52, 144, 112, 260, 108),
  ('pasillo-principal', 'C', 'Pasillo principal', 50, 'walk-outline', 'pasillo', false, true, true,
   28, 200, 304, 96, 180, 238),
  ('zona-segura', 'Zona segura', 'Punto de encuentro', 100, 'shield-checkmark-outline', 'punto-encuentro', true, true, true,
   88, 342, 184, 100, 180, 392)
on conflict (id) do nothing;
