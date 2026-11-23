-- SQL MANUAL — NO ejecutado por este repositorio.
-- Ejecutar desde Supabase SQL Editor si se decide usar el worker de outbox.
--
-- Las tablas indicadas ya existen manualmente: las sentencias
-- `create table if not exists` son inertes en ese caso.
-- Este script NO modifica ni elimina registros existentes. Las funciones RPC
-- solo actúan en tiempo de ejecución sobre trabajos que ellas mismas reclaman.

create table if not exists public.notificaciones_emergencia_outbox (
  id uuid primary key default gen_random_uuid(),
  alarma_id uuid not null unique,
  tipo text,
  titulo text,
  mensaje text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'procesando', 'enviado', 'fallido')),
  intentos integer not null default 0,
  proximo_intento_en timestamptz not null default now(),
  ultimo_error_codigo text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists notificaciones_emergencia_outbox_pendientes_idx
  on public.notificaciones_emergencia_outbox (estado, proximo_intento_en, creado_en);

alter table public.notificaciones_emergencia_outbox enable row level security;

-- Seguimiento por destinatario: evita reenviar a un dispositivo que ya recibió
-- la notificación cuando el trabajo se reintenta por un fallo parcial.
-- Se guarda solo un hash SHA-256 del token FCM, nunca el token en claro.
create table if not exists public.notificaciones_emergencia_envios (
  id uuid primary key default gen_random_uuid(),
  notificacion_id uuid not null
    references public.notificaciones_emergencia_outbox (id) on delete cascade,
  token_hash text not null,
  estado text not null default 'fallido'
    check (estado in ('enviado', 'fallido', 'invalido')),
  ultimo_error_codigo text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (notificacion_id, token_hash)
);

create index if not exists notificaciones_emergencia_envios_notificacion_idx
  on public.notificaciones_emergencia_envios (notificacion_id, estado);

alter table public.notificaciones_emergencia_envios enable row level security;

-- ---------------------------------------------------------------------------
-- Arrendamiento (lease) de trabajos interrumpidos
-- ---------------------------------------------------------------------------

alter table public.notificaciones_emergencia_outbox
  add column if not exists lease_id uuid,
  add column if not exists lease_expires_at timestamptz;

create index if not exists notificaciones_emergencia_outbox_lease_idx
  on public.notificaciones_emergencia_outbox (estado, lease_expires_at)
  where estado = 'procesando';

comment on column public.notificaciones_emergencia_outbox.lease_id is
  'Identificador del worker propietario del trabajo mientras está procesando.';

comment on column public.notificaciones_emergencia_outbox.lease_expires_at is
  'Vencimiento del arrendamiento. Un trabajo procesando vencido puede recuperarse.';

-- Sin políticas para anon/authenticated: solo service_role puede leer/escribir.
-- No se conceden permisos públicos.

-- Reclamo atómico: FOR UPDATE SKIP LOCKED impide que dos workers tomen la misma
-- fila. También recupera trabajos 'procesando' cuyo lease venció. Para filas
-- heredadas sin lease_expires_at se usa actualizado_en + 30 minutos.
--
-- La firma cambia de 2 a 3 argumentos para que PostgreSQL reciba
-- p_max_intents. CREATE OR REPLACE con otra firma crearía una SOBRECARGA, no
-- reemplazaría la función antigua; por eso se elimina explícitamente la firma
-- anterior antes de crear la nueva.
drop function if exists public.reclamar_notificacion_emergencia(uuid, integer);

create or replace function public.reclamar_notificacion_emergencia(
  p_worker_id uuid,
  p_lease_seconds integer default 300,
  p_max_intents integer default 5
)
returns table (
  id uuid,
  alarma_id uuid,
  tipo text,
  titulo text,
  mensaje text,
  intentos integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_now timestamptz := now();
begin
  if p_worker_id is null
     or p_lease_seconds is null or p_lease_seconds < 60 or p_lease_seconds > 900
     or p_max_intents is null or p_max_intents < 1 or p_max_intents > 10 then
    raise exception 'ARGUMENTOS_INVALIDOS';
  end if;

  -- Bucle: los trabajos con intentos agotados se cierran en 'fallido' y se
  -- sigue buscando, en lugar de devolver NULL y dejar pendientes sin reclamar.
  loop
    select o.id
      into v_job_id
      from public.notificaciones_emergencia_outbox as o
     where
        (
          o.estado = 'pendiente'
          and o.proximo_intento_en <= v_now
        )
        or
        (
          o.estado = 'procesando'
          and coalesce(o.lease_expires_at, o.actualizado_en + interval '30 minutes') <= v_now
        )
     order by
        case when o.estado = 'procesando' then 0 else 1 end,
        o.creado_en asc
     limit 1
     for update skip locked;

    if v_job_id is null then
      return;
    end if;

    -- Agotados: se marcan 'fallido' aunque estuvieran 'procesando' con lease
    -- vencido. No se modifica ultimo_error_codigo si ya tenía uno.
    update public.notificaciones_emergencia_outbox as o
       set estado = 'fallido',
           ultimo_error_codigo = coalesce(o.ultimo_error_codigo, 'MAX_ATTEMPTS_EXHAUSTED'),
           lease_id = null,
           lease_expires_at = null,
           actualizado_en = v_now
     where o.id = v_job_id
       and o.intentos >= p_max_intents;

    if found then
      v_job_id := null;
      continue;
    end if;

    return query
    update public.notificaciones_emergencia_outbox as o
       set estado = 'procesando',
           intentos = o.intentos + 1,
           lease_id = p_worker_id,
           lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
           actualizado_en = v_now
     where o.id = v_job_id
       and o.estado in ('pendiente', 'procesando')
    returning
        o.id,
        o.alarma_id,
        o.tipo,
        o.titulo,
        o.mensaje,
        o.intentos;

    return;
  end loop;
end;
$$;

-- Renovación: solo el propietario del lease puede extenderlo.
create or replace function public.renovar_lease_notificacion_emergencia(
  p_id uuid,
  p_lease_id uuid,
  p_lease_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if p_id is null or p_lease_id is null or p_lease_seconds < 60 or p_lease_seconds > 900 then
    raise exception 'ARGUMENTOS_INVALIDOS';
  end if;

  update public.notificaciones_emergencia_outbox as o
     set lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         actualizado_en = now()
   where o.id = p_id
     and o.lease_id = p_lease_id
     and o.estado = 'procesando';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

-- Cierre protegido: un worker con lease vencido o sustituido no puede
-- sobrescribir el resultado del worker que actualmente posee el trabajo.
create or replace function public.finalizar_notificacion_emergencia(
  p_id uuid,
  p_lease_id uuid,
  p_estado text,
  p_error_codigo text default null,
  p_proximo_intento_en timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if p_id is null or p_lease_id is null or p_estado not in ('enviado', 'pendiente', 'fallido') then
    raise exception 'ARGUMENTOS_INVALIDOS';
  end if;

  update public.notificaciones_emergencia_outbox as o
     set estado = p_estado,
         ultimo_error_codigo =
           case when p_estado = 'enviado' then null else p_error_codigo end,
         proximo_intento_en =
           case
             when p_estado in ('pendiente', 'fallido')
               then coalesce(p_proximo_intento_en, now())
             else o.proximo_intento_en
           end,
         lease_id = null,
         lease_expires_at = null,
         actualizado_en = now()
   where o.id = p_id
     and o.lease_id = p_lease_id
     and o.estado = 'procesando';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

-- La firma antigua se eliminó arriba; estos permisos aplican solo a la nueva
-- firma de 3 argumentos. Las otras dos RPC conservan su firma y sus permisos.
revoke all on function public.reclamar_notificacion_emergencia(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.renovar_lease_notificacion_emergencia(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.finalizar_notificacion_emergencia(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;

grant execute on function public.reclamar_notificacion_emergencia(uuid, integer, integer) to service_role;
grant execute on function public.renovar_lease_notificacion_emergencia(uuid, uuid, integer) to service_role;
grant execute on function public.finalizar_notificacion_emergencia(uuid, uuid, text, text, timestamptz) to service_role;

comment on function public.reclamar_notificacion_emergencia(uuid, integer, integer) is
  'Reclama de forma atómica un trabajo pendiente o con lease vencido y cierra los que agotaron p_max_intents. Uso exclusivo del worker.';

comment on function public.renovar_lease_notificacion_emergencia(uuid, uuid, integer) is
  'Extiende el lease solo si el worker sigue siendo el propietario.';

comment on function public.finalizar_notificacion_emergencia(uuid, uuid, text, text, timestamptz) is
  'Cierra un trabajo solo si el lease_id coincide. Evita escrituras de workers obsoletos.';
