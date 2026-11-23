-- DIAGNOSTICO SOLO LECTURA. Preparado, NO ejecutado automáticamente.
-- Ejecutar en el SQL Editor del proyecto confirmado por su propietario.
-- No devuelve filas de usuarios, tokens, claves ni definiciones de funciones.
begin transaction read only;

select nombre, to_regclass('public.' || nombre) is not null as existe
from (values
  ('usuarios'), ('eventos_alarma_manual'), ('dispositivos_fcm'),
  ('notificaciones_emergencia_outbox'), ('notificaciones_emergencia_envios')
) as objetos(nombre);

select c.relname as tabla, c.relrowsecurity as rls_activo
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('usuarios', 'eventos_alarma_manual', 'dispositivos_fcm',
    'notificaciones_emergencia_outbox', 'notificaciones_emergencia_envios');

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('eventos_alarma_manual', 'dispositivos_fcm',
    'notificaciones_emergencia_outbox', 'notificaciones_emergencia_envios')
order by table_name, ordinal_position;

select n.nspname as esquema, p.proname as funcion,
  pg_get_function_identity_arguments(p.oid) as argumentos,
  pg_get_function_result(p.oid) as retorno,
  p.prosecdef as security_definer,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'crear_incidente_con_notificacion', 'registrar_intento_fcm',
  'crear_desafio_fcm', 'confirmar_registro_fcm',
  'reclamar_notificacion_emergencia', 'renovar_lease_notificacion_emergencia',
  'finalizar_notificacion_emergencia'
)
order by p.proname;

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('usuarios', 'eventos_alarma_manual', 'dispositivos_fcm',
    'notificaciones_emergencia_outbox', 'notificaciones_emergencia_envios');

select event_object_table as tabla, trigger_name, event_manipulation, action_timing
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in ('eventos_alarma_manual', 'dispositivos_fcm',
    'notificaciones_emergencia_outbox', 'notificaciones_emergencia_envios');

select table_name, grantee, privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name in ('usuarios', 'eventos_alarma_manual', 'dispositivos_fcm',
    'notificaciones_emergencia_outbox', 'notificaciones_emergencia_envios')
  and grantee in ('anon', 'authenticated', 'service_role');

commit;
