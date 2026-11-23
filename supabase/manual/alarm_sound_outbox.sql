-- PREPARADO LOCALMENTE, NO EJECUTADO. Requiere evento/origen ya instalados.
-- Revisar esquema y respaldar antes. No elimina registros ni desactiva RLS.
begin;
create table if not exists public.alarm_sound_state (
  singleton boolean primary key default true check (singleton),
  version bigint not null default 0
);
insert into public.alarm_sound_state(singleton) values(true) on conflict do nothing;
create table if not exists public.alarm_sound_outbox (
  version bigint primary key,
  payload jsonb not null,
  creado_en timestamptz not null default now()
);
alter table public.alarm_sound_state enable row level security;
alter table public.alarm_sound_outbox enable row level security;
revoke all on public.alarm_sound_state, public.alarm_sound_outbox from anon, authenticated;
grant select on public.alarm_sound_state, public.alarm_sound_outbox to service_role;

create or replace function public.lock_alarm_sound_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- BEFORE STATEMENT: adquirir antes de los bloqueos de filas de incidentes.
  perform pg_catalog.pg_advisory_xact_lock(194027, 1);
  return null;
end;
$$;
create or replace function public.queue_alarm_sound_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_version bigint; v_evento text; v_payload jsonb;
begin
  select coalesce(evento, 'emergencia') into v_evento
  from public.eventos_alarma_manual where estado = 'activa'
  order by case evento when 'incendio' then 1 when 'sismo' then 2
    when 'impacto' then 3 when 'emergencia' then 4 when 'simulacro' then 5 else 4 end,
    fecha_activacion, id limit 1;
  v_payload := case when found then jsonb_build_object('action', true, 'evento', v_evento)
    else jsonb_build_object('action', false, 'alcance', 'todas') end;
  update public.alarm_sound_state set version = version + 1
    where singleton returning version into v_version;
  insert into public.alarm_sound_outbox(version, payload)
    values(v_version, v_payload || jsonb_build_object('sound_version', v_version::text));
  return null;
end;
$$;
revoke all on function public.lock_alarm_sound_changes() from public, anon, authenticated;
revoke all on function public.queue_alarm_sound_snapshot() from public, anon, authenticated;
-- CREATE OR REPLACE TRIGGER conserva tablas y datos (PostgreSQL de Supabase).
create or replace trigger alarm_sound_serialize
  before insert or update or delete on public.eventos_alarma_manual
  for each statement execute function public.lock_alarm_sound_changes();
create or replace trigger alarm_sound_enqueue
  after insert or update or delete on public.eventos_alarma_manual
  for each statement execute function public.queue_alarm_sound_snapshot();
create or replace function public.latest_alarm_sound_command() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('version', version::text, 'payload', payload)
  from public.alarm_sound_outbox order by version desc limit 1;
$$;
revoke all on function public.latest_alarm_sound_command() from public, anon, authenticated;
grant execute on function public.latest_alarm_sound_command() to service_role;
commit;
