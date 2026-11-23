/**
 * MQTT.4 / C1 — Adaptador fail-closed de activación atómica.
 *
 * La alarma y su fila de outbox SOLO pueden crearse mediante la RPC inyectada.
 * No existe camino de respaldo que inserte la alarma sin notificación: si la
 * RPC falta o falla, se rechaza la activación. No ejecuta SQL ni toca Supabase.
 */

import { createHash } from 'node:crypto';

import {
  esCodigoErrorAlarma,
  validarSolicitudRpcActivacion,
} from '../src/app/core/data/alarm-incident-contract.ts';

function huella(valor) {
  return createHash('sha256').update(JSON.stringify(valor ?? null)).digest('hex').slice(0, 16);
}

/**
 * @param {{
 *   rpc: (parametros: object) => Promise<{ok: boolean, alarma?: object, error?: string}>,
 *   metricas?: object,
 *   registrar?: (entrada: object) => void,
 *   ahora?: () => string,
 * }} opciones
 */
export function crearActivacionAtomica({
  rpc,
  metricas = { registrar: () => {} },
  registrar = () => {},
  ahora = () => new Date().toISOString(),
} = {}) {
  if (typeof rpc !== 'function') {
    throw new TypeError('La RPC atómica es obligatoria: no se permite activación sin ella (C1).');
  }

  return async function activar(solicitud = {}) {
    const validacion = validarSolicitudRpcActivacion(solicitud);
    if (!validacion.valida) {
      metricas.registrar(validacion.code, { origen: solicitud.origen ?? null });
      registrar({ resultado: 'rechazado', code: validacion.code, en: ahora() });
      return { ok: false, status: 400, error: validacion.code };
    }

    if (solicitud.evento === undefined || solicitud.evento === null) {
      metricas.registrar('EVENTO_NO_SELECCIONADO', { origen: solicitud.origen });
      registrar({ resultado: 'cliente_legacy', code: 'EVENTO_NO_SELECCIONADO', en: ahora() });
    }

    let respuesta;
    try {
      respuesta = await rpc({
        p_tipo: solicitud.tipo,
        p_evento: solicitud.evento ?? null,
        p_origen: solicitud.origen,
        p_titulo: solicitud.titulo,
        p_mensaje: solicitud.mensaje,
        p_severidad: solicitud.severidad,
        p_activado_por: solicitud.activadoPor,
        p_clave_idempotencia: solicitud.claveIdempotencia,
      });
    } catch {
      registrar({ resultado: 'rpc_no_disponible', code: 'RPC_NO_DISPONIBLE', en: ahora() });
      return { ok: false, status: 503, error: 'RPC_NO_DISPONIBLE' };
    }

    if (!respuesta || respuesta.ok !== true || !respuesta.alarma) {
      const code = esCodigoErrorAlarma(respuesta?.error) ? respuesta.error : 'RPC_NO_DISPONIBLE';
      const status = code === 'IDEMPOTENCY_CONFLICT' || code === 'ACTIVE_ALARM_EXISTS' ? 409 : 503;
      registrar({
        resultado: 'rpc_rechazada',
        code,
        clave_hash: huella(solicitud.claveIdempotencia),
        origen: solicitud.origen,
        en: ahora(),
      });
      return { ok: false, status, error: code };
    }

    registrar({
      resultado: 'creada',
      alarma_id: respuesta.alarma.id ?? null,
      clave_hash: huella(solicitud.claveIdempotencia),
      origen: solicitud.origen,
      en: ahora(),
    });

    const eventoFinal = respuesta.alarma.evento ?? solicitud.evento ?? null;
    return {
      ok: true,
      status: 201,
      alarma: {
        ...respuesta.alarma,
        evento: eventoFinal,
        origen: respuesta.alarma.origen ?? solicitud.origen,
        eventoReportado: eventoFinal != null,
      },
    };
  };
}
