-- ============================================================================
-- SQL MANUAL DEFINITIVO — SENA CROWD INTELLIGENCE (MVP alarmas)
-- Pegar COMPLETO en Supabase SQL Editor. NO ejecutado por este repositorio.
--
-- Garantias que instala (todas aditivas, sin borrar ni reescribir registros):
--   1. Columnas evento/origen en eventos_alarma_manual con CHECK.
--   2. Unicidad de clave_idempotencia (idempotencia garantizada por la BD).
--   3. Una sola alarma manual activa (MVP sencillo).
--   4. RPC atomica incidente + outbox con bloqueo de concurrencia,
--      idempotencia estricta y EXECUTE exclusivo de service_role.
--
-- Compatibilidad legacy:
--   - tipo sigue siendo 'alarma_manual'; no se renombra ninguna columna.
--   - Registros historicos conservan evento NULL y origen NULL (se interpreta
--     como 'cliente' al leer). No hay backfill.
--   - La Edge Function legacy activar-alarma-manual no se modifica.
--   - No se tocan las politicas RLS existentes de eventos_alarma_manual.
--
-- Si existen datos incompatibles (claves duplicadas),
-- el script FALLA con un mensaje claro y no modifica ningun registro.
-- ============================================================================

-- Transaccion unica: si cualquier guarda falla (duplicados, varias activas),
-- el script aborta y NINGUN cambio queda aplicado.
begin;

-- ----------------------------------------------------------------------------
-- 0) Outbox: inerte si la tabla ya existe con el contrato manual conocido.
--    (El worker FCM y sus RPC viven en notificaciones_emergencia_outbox.sql;
--    no son necesarios para activar/finalizar la alarma de prueba.)
-- ----------------------------------------------------------------------------
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

alter table public.notificaciones_emergencia_outbox
  add column if not exists lease_id uuid,
  add column if not exists lease_expires_at timestamptz;

alter table public.notificaciones_emergencia_outbox enable row level security;
-- Sin politicas para anon/authenticated: solo service_role lee/escribe.

-- ----------------------------------------------------------------------------
-- 1) Columnas nuevas con CHECK (NULL historico permitido).
-- ----------------------------------------------------------------------------
alter table public.eventos_alarma_manual
  add column if not exists evento text,
  add column if not exists origen text;

comment on column public.eventos_alarma_manual.evento is
  'Incidente declarado: incendio, sismo, impacto, simulacro o emergencia. NULL en registros historicos.';

comment on column public.eventos_alarma_manual.origen is
  'Origen del incidente: cliente o hardware. NULL historico se interpreta como cliente.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.eventos_alarma_manual'::regclass
      and conname = 'eventos_alarma_manual_evento_check'
  ) then
    alter table public.eventos_alarma_manual
      add constraint eventos_alarma_manual_evento_check
      check (evento is null or evento in ('incendio', 'sismo', 'impacto', 'simulacro', 'emergencia'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.eventos_alarma_manual'::regclass
      and conname = 'eventos_alarma_manual_origen_check'
  ) then
    alter table public.eventos_alarma_manual
      add constraint eventos_alarma_manual_origen_check
      check (origen is null or origen in ('cliente', 'hardware'));
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2) Unicidad de clave_idempotencia. Falla sin tocar datos si hay duplicados.
--    (Multiples NULL siguen permitidos: filas legacy sin clave.)
-- ----------------------------------------------------------------------------
do $$
declare
  v_duplicadas integer;
begin
  select count(*) into v_duplicadas
  from (
    select clave_idempotencia
    from public.eventos_alarma_manual
    where clave_idempotencia is not null
    group by clave_idempotencia
    having count(*) > 1
  ) duplicadas;

  if v_duplicadas > 0 then
    raise exception
      'CLAVES_DUPLICADAS: existen % claves de idempotencia repetidas en eventos_alarma_manual. Revisarlas antes de continuar; no se modifico ningun registro.',
      v_duplicadas;
  end if;
end;
$$;

create unique index if not exists eventos_alarma_manual_clave_idempotencia_uidx
  on public.eventos_alarma_manual (clave_idempotencia);

-- ----------------------------------------------------------------------------
-- 3) Una alarma activa. Si ya hay varias, abortar sin modificar el historial.
-- ----------------------------------------------------------------------------
do $$
begin
  if (select count(*) from public.eventos_alarma_manual where estado = 'activa') > 1 then
    raise exception 'VARIAS_ALARMAS_ACTIVAS: revisar y finalizar individualmente antes de instalar el MVP sencillo';
  end if;
end;
$$;
create unique index if not exists eventos_alarma_manual_una_activa_uidx
  on public.eventos_alarma_manual (estado) where estado = 'activa';

-- ----------------------------------------------------------------------------
-- 4) RPC atomica. La firma exacta evita crear una sobrecarga accidental.
-- ----------------------------------------------------------------------------
drop function if exists public.crear_incidente_con_notificacion(
  text, text, text, text, text, text, uuid, uuid
);

create or replace function public.crear_incidente_con_notificacion(
  p_tipo text,
  p_evento text,
  p_origen text,
  p_titulo text,
  p_mensaje text,
  p_severidad text,
  p_activado_por uuid,
  p_clave_idempotencia uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- La ruta hardware sigue bloqueada: este RPC solo escribe origen cliente.
  v_origen text := 'cliente';
  v_existente public.eventos_alarma_manual%rowtype;
  v_alarma public.eventos_alarma_manual%rowtype;
  v_restriccion text;
begin
  if p_tipo is distinct from 'alarma_manual' then
    return jsonb_build_object('ok', false, 'error', 'TIPO_NO_VALIDO');
  end if;

  if p_titulo is distinct from '⚠️ PRECAUCIÓN'
     or p_mensaje is distinct from 'Diríjase con calma a la zona segura y siga las indicaciones del personal autorizado.'
     or p_severidad is distinct from 'critical' then
    return jsonb_build_object('ok', false, 'error', 'INVALID_BODY');
  end if;

  -- Compatibilidad historica: un cliente legacy puede no declarar evento.
  if p_evento is not null
     and p_evento not in ('incendio', 'sismo', 'impacto', 'simulacro', 'emergencia') then
    return jsonb_build_object('ok', false, 'error', 'EVENTO_NO_VALIDO');
  end if;

  if p_origen is distinct from 'cliente' then
    return jsonb_build_object('ok', false, 'error', 'ORIGEN_NO_VALIDO');
  end if;

  if p_activado_por is null then
    return jsonb_build_object('ok', false, 'error', 'USUARIO_REQUERIDO');
  end if;

  if p_clave_idempotencia is null then
    return jsonb_build_object('ok', false, 'error', 'IDEMPOTENCIA_REQUERIDA');
  end if;

  -- Bloqueo global transaccional: serializa toda activacion manual antes de
  -- consultar o crear una alarma. Distintas claves crean incidentes separados.
  perform pg_advisory_xact_lock(
    hashtext('sena:eventos_alarma_manual'),
    hashtext('activacion')
  );

  -- Bloqueo por clave de idempotencia, siempre despues del bloqueo global.
  perform pg_advisory_xact_lock(hashtext(p_clave_idempotencia::text));

  -- Defensa en profundidad: el UUID debe corresponder a un operador activo.
  if not exists (
    select 1
    from public.usuarios as u
    where u.id = p_activado_por
      and u.activo = true
      and u.rol in ('administrador', 'instructor')
  ) then
    return jsonb_build_object('ok', false, 'error', 'ROL_NO_AUTORIZADO');
  end if;

  -- Idempotencia: reutilizar la clave solo es valido si todos los parametros
  -- son compatibles. Los registros historicos sin evento/origen se comparan
  -- como evento NULL y origen cliente, sin inventar valores.
  select *
    into v_existente
    from public.eventos_alarma_manual
   where clave_idempotencia = p_clave_idempotencia
   for update;

  if found then
    if v_existente.tipo is distinct from p_tipo
       or v_existente.evento is distinct from p_evento
       or coalesce(v_existente.origen, 'cliente') is distinct from v_origen
       or v_existente.titulo is distinct from p_titulo
       or v_existente.mensaje is distinct from p_mensaje
       or v_existente.severidad is distinct from p_severidad
       or v_existente.activado_por is distinct from p_activado_por then
      return jsonb_build_object('ok', false, 'error', 'IDEMPOTENCY_CONFLICT');
    end if;

    return jsonb_build_object(
      'ok', true,
      'alarma', jsonb_build_object(
        'id', v_existente.id,
        'tipo', v_existente.tipo,
        'evento', v_existente.evento,
        'origen', coalesce(v_existente.origen, 'cliente'),
        'titulo', v_existente.titulo,
        'mensaje', v_existente.mensaje,
        'severidad', v_existente.severidad,
        'estado', v_existente.estado,
        'fecha_activacion', v_existente.fecha_activacion,
        'eventoReportado', v_existente.evento is not null
      )
    );
  end if;

  -- La consulta de idempotencia anterior permite reintentos de la misma alarma.
  if exists (select 1 from public.eventos_alarma_manual where estado = 'activa') then
    return jsonb_build_object('ok', false, 'error', 'ACTIVE_ALARM_EXISTS');
  end if;

  -- Atomicidad: incidente + outbox en la misma transaccion. Si el outbox
  -- falla, la excepcion revierte tambien el incidente.
  begin
    insert into public.eventos_alarma_manual (
      tipo, evento, origen, titulo, mensaje, severidad, activado_por, clave_idempotencia
    )
    values (
      p_tipo, p_evento, v_origen, p_titulo, p_mensaje, p_severidad, p_activado_por, p_clave_idempotencia
    )
    returning * into v_alarma;

    insert into public.notificaciones_emergencia_outbox (alarma_id, tipo, titulo, mensaje)
    values (v_alarma.id, p_tipo, p_titulo, p_mensaje);
  exception
    when unique_violation then
      -- Carrera con la ruta legacy (no toma el advisory lock): los indices
      -- unicos detectan el conflicto y aqui se resuelve sin duplicar nada.
      get stacked diagnostics v_restriccion = constraint_name;

      if v_restriccion = 'eventos_alarma_manual_clave_idempotencia_uidx' then
        select *
          into v_existente
          from public.eventos_alarma_manual
         where clave_idempotencia = p_clave_idempotencia;

        if found
           and v_existente.tipo is not distinct from p_tipo
           and v_existente.evento is not distinct from p_evento
           and coalesce(v_existente.origen, 'cliente') is not distinct from v_origen
           and v_existente.titulo is not distinct from p_titulo
           and v_existente.mensaje is not distinct from p_mensaje
           and v_existente.severidad is not distinct from p_severidad
           and v_existente.activado_por is not distinct from p_activado_por then
          return jsonb_build_object(
            'ok', true,
            'alarma', jsonb_build_object(
              'id', v_existente.id,
              'tipo', v_existente.tipo,
              'evento', v_existente.evento,
              'origen', coalesce(v_existente.origen, 'cliente'),
              'titulo', v_existente.titulo,
              'mensaje', v_existente.mensaje,
              'severidad', v_existente.severidad,
              'estado', v_existente.estado,
              'fecha_activacion', v_existente.fecha_activacion,
              'eventoReportado', v_existente.evento is not null
            )
          );
        end if;

        return jsonb_build_object('ok', false, 'error', 'IDEMPOTENCY_CONFLICT');
      elsif v_restriccion = 'eventos_alarma_manual_una_activa_uidx' then
        return jsonb_build_object('ok', false, 'error', 'ACTIVE_ALARM_EXISTS');
      else
        raise;
      end if;
  end;

  return jsonb_build_object(
    'ok', true,
    'alarma', jsonb_build_object(
      'id', v_alarma.id,
      'tipo', v_alarma.tipo,
      'evento', v_alarma.evento,
      'origen', v_alarma.origen,
      'titulo', v_alarma.titulo,
      'mensaje', v_alarma.mensaje,
      'severidad', v_alarma.severidad,
      'estado', v_alarma.estado,
      'fecha_activacion', v_alarma.fecha_activacion,
      'eventoReportado', v_alarma.evento is not null
    )
  );
end;
$$;

revoke all on function public.crear_incidente_con_notificacion(
  text, text, text, text, text, text, uuid, uuid
) from public, anon, authenticated;

grant execute on function public.crear_incidente_con_notificacion(
  text, text, text, text, text, text, uuid, uuid
) to service_role;

comment on function public.crear_incidente_con_notificacion(
  text, text, text, text, text, text, uuid, uuid
) is
  'Crea de forma atomica el incidente manual y su outbox. Bloqueo global anti-activaciones simultaneas, idempotencia estricta y unicidad garantizada por indices. Solo service_role.';

commit;
