/**
 * Persistencia atómica y finalización real de alarmas manuales.
 *
 * La activación SOLO se considera creada si la RPC protegida devuelve la
 * alarma. Si la RPC no existe o falla, el endpoint no publica el comando MQTT.
 * No ejecuta SQL, no cambia RLS y no despliega nada.
 */

import { createClient } from '@supabase/supabase-js';

import { esCodigoErrorAlarma } from '../src/app/core/data/alarm-incident-contract.ts';

import { crearActivacionAtomica } from './mqtt4-activacion-atomica.mjs';
import { normalizarUrlSupabase } from './supabase-url.mjs';
import { comandoParaAlarmasActivas } from './alarm-sound-policy.mjs';

function codigoDeErrorSupabase(error) {
  const codigo = String(error?.code ?? error?.message ?? '');
  if (codigo === '23505' || /duplicate|idempot/i.test(codigo)) return 'IDEMPOTENCY_CONFLICT';
  if (/active.{0,20}alarm|alarma.{0,20}activa/i.test(codigo)) return 'ACTIVE_ALARM_EXISTS';
  return 'RPC_NO_DISPONIBLE';
}

function normalizarRespuestaRpc(data) {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    if (data.ok === false) {
      return { ok: false, error: esCodigoErrorAlarma(data.error) ? data.error : 'RPC_NO_DISPONIBLE' };
    }
    const alarma = data.alarma ?? data.incidente ?? data;
    if (alarma && typeof alarma === 'object' && typeof alarma.id === 'string') {
      return { ok: true, alarma };
    }
  }
  return { ok: false, error: 'RPC_NO_DISPONIBLE' };
}

export function crearPersistenciaSupabase({
  url = '',
  publishableKey = '',
  serviceRoleKey = '',
  rpcName = 'crear_incidente_con_notificacion',
  clientFactory = createClient,
  fetchImpl = fetch,
  notificationWorkerSecret = '',
} = {}) {
  const baseUrl = normalizarUrlSupabase(url);
  const adminClient =
    baseUrl && serviceRoleKey
      ? clientFactory(baseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        })
      : null;

  const activarAtomico = crearActivacionAtomica({
    rpc: async (parametros) => {
      if (adminClient === null) return { ok: false, error: 'RPC_NO_DISPONIBLE' };
      try {
        const { data, error } = await adminClient.rpc(rpcName, parametros);
        if (error) return { ok: false, error: codigoDeErrorSupabase(error) };
        return normalizarRespuestaRpc(data);
      } catch {
        return { ok: false, error: 'RPC_NO_DISPONIBLE' };
      }
    },
  });

  const activar = async (solicitud) => {
    const result = await activarAtomico({
      tipo: 'alarma_manual',
      evento: solicitud.evento,
      origen: solicitud.origen,
      titulo: solicitud.titulo,
      mensaje: solicitud.mensaje,
      severidad: solicitud.severidad,
      activadoPor: solicitud.activadoPor,
      claveIdempotencia: solicitud.claveIdempotencia,
      ...(solicitud.requiereEvento === true ? { requiereEvento: true } : {}),
    });
    if (result.ok && notificationWorkerSecret) {
      // Solo servidor. La outbox conserva pendientes si el worker no responde.
      try {
        const response = await fetchImpl(`${baseUrl}/functions/v1/procesar-notificaciones-emergencia`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-worker-secret': notificationWorkerSecret },
          body: '{}', signal: AbortSignal.timeout(5000),
        });
        result.notificacionPendiente = !response.ok;
      } catch { result.notificacionPendiente = true; }
    }
    return result;
  };

  const latestSoundCommand = async () => {
    if (!adminClient) throw new Error('SOUND_STATE_UNAVAILABLE');
    const { data, error } = await adminClient.rpc('latest_alarm_sound_command');
    if (error || !data || typeof data.version !== 'string') throw new Error('SOUND_STATE_UNAVAILABLE');
    return data;
  };

  const verificarActivacion = async ({ alarmaId, evento }) => {
    if (!adminClient) return { ok: false };
    try {
      const { data: row, error } = await adminClient.from('eventos_alarma_manual').select('*').eq('id', alarmaId).maybeSingle();
      if (error || !row || row.id !== alarmaId || row.tipo !== 'alarma_manual' || row.estado !== 'activa' ||
          (row.evento != null && row.evento !== evento)) return { ok: false };
      // Las filas legacy pueden no tener evento; no modificar ni recrearlas.
      const { id, tipo, estado, titulo, mensaje, severidad, fecha_activacion } = row;
      return { ok: true, alarma: { id, tipo, estado, titulo, mensaje, severidad, fecha_activacion,
        evento: row.evento ?? null, origen: row.origen ?? 'cliente' } };
    } catch { return { ok: false }; }
  };

  const finalizar = async (solicitud) => {
    if (!baseUrl || !publishableKey || typeof solicitud.jwt !== 'string' || solicitud.jwt.length === 0) {
      return { ok: false, status: 503, error: 'RPC_NO_DISPONIBLE' };
    }

    try {
      const respuesta = await fetchImpl(`${baseUrl}/functions/v1/finalizar-alarma-manual`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: publishableKey,
          Authorization: `Bearer ${solicitud.jwt}`,
        },
        body: JSON.stringify({ alarma_id: solicitud.alarmaId }),
      });
      const cuerpo = await respuesta.json();
      if (!respuesta.ok || cuerpo?.status !== 'FINALIZED' || !cuerpo?.alarma) {
        return { ok: false, status: 502, error: 'RPC_NO_DISPONIBLE' };
      }
      // Nunca confiar en el alcance de apagado enviado por el cliente.
      // Sin lectura administrativa confirmada no se publica ningún apagado.
      if (!adminClient) return { ok: false, error: 'RPC_NO_DISPONIBLE' };
      const { data: activas, error: lecturaError } = await adminClient.from('eventos_alarma_manual')
        .select('id, evento, fecha_activacion').eq('estado', 'activa');
      if (lecturaError || !Array.isArray(activas)) return { ok: false, error: 'RPC_NO_DISPONIBLE' };
      // En el MVP simple nunca apagar si aparece otra alarma inesperada.
      if (activas.length > 0) return { ok: false, error: 'MQTT_NO_DISPONIBLE' };
      return { ok: true, alarma: cuerpo.alarma, comandoReconciliado: comandoParaAlarmasActivas(activas) };
    } catch {
      return { ok: false, status: 503, error: 'RPC_NO_DISPONIBLE' };
    }
  };

  return { activar, finalizar, verificarActivacion, latestSoundCommand, persistenciaAtomicaDisponible: adminClient !== null };
}
