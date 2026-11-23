/**
 * SENA CROWD INTELLIGENCE — MQTT.3.
 *
 * Normalización y deduplicación de eventos publicados por ESP32 1.
 * `estado:false` es fin de detección, NO cierre oficial. El cierre de simulacro
 * solo se sincroniza cuando existe evidencia del comando action:false que ESP1
 * envía a ESP2 (ESP1.txt:641-669), no solo por el cambio de estado.
 */

import type { AlarmIncidente } from './alarm-command-core';
import type { PropuestaActivacionAlarma } from './alarm-incident-contract';
import type { MqttComandoAlarmaEsp2, MqttEventoMensaje } from './mqtt-contracts';

/** Literales verificados contra `mqtt-contracts.ts` y `alarm-incident-contract.ts` en las pruebas. */
const TOPICO_COMANDOS_ALARMA = 'sena/casanare/placa2/comandos/alarma';

/**
 * Copias de los textos aprobados. Se mantienen como literales para que este
 * núcleo siga siendo importable desde Node sin resolución de extensiones; las
 * pruebas comprueban que coinciden con el contrato canónico MQTT.3B.
 */
const TIPO_ALARMA_MANUAL = 'alarma_manual' as const;
const TITULO_ALARMA_MANUAL = '⚠️ PRECAUCIÓN' as const;
const MENSAJE_ALARMA_MANUAL =
  'Diríjase con calma a la zona segura y siga las indicaciones del personal autorizado.' as const;
const SEVERIDAD_ALARMA_MANUAL = 'critical' as const;
const IDENTIDAD_DISPOSITIVO = 'dispositivo' as const;

export const EVENTOS_ESP1 = ['incendio', 'sismo', 'impacto', 'simulacro', 'emergencia'] as const;
export const PREFIJO_EVENTOS_ESP1 = 'sena/casanare/placa1/eventos/';
export const VENTANA_CIERRE_SIMULACRO_MS = 10_000;

function esComandoCierreSimulacro(value: unknown): value is MqttComandoAlarmaEsp2 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const crudo = value as Record<string, unknown>;
  if (crudo['action'] !== false) return false;

  const alcance = crudo['alcance'] === undefined ? 'todas' : crudo['alcance'];
  if (alcance !== 'simulacro') return false;

  const motivo = crudo['motivo'];
  if (motivo !== undefined && motivo !== 'falsa_alarma') return false;

  return true;
}

export type HardwareMecanismo = 'touch' | 'sensor_temperatura' | 'sensor_movimiento' | 'desconocido';

export interface EventoHardwareNormalizado {
  readonly eventoId: string;
  readonly incidente: AlarmIncidente;
  readonly estado: boolean;
  readonly placa: 'placa1';
  readonly sala: 'riesgo_bajo';
  readonly sesion: string;
  readonly secuencia: number;
  readonly mecanismo: HardwareMecanismo;
  readonly recibidoEn: string;
  readonly mensaje: MqttEventoMensaje;
}

export interface EvidenciaCierreSimulacro {
  readonly eventoId: string;
  readonly topic: string;
  readonly comando: MqttComandoAlarmaEsp2;
  readonly recibidoEn: string;
  readonly placa: 'placa1';
}

export type HardwareEventDecision =
  | {
      readonly tipo: 'CREAR_INCIDENTE_HARDWARE';
      readonly evento: EventoHardwareNormalizado;
      readonly idempotencia: string;
      readonly origen: 'hardware';
      /** Incidente ampliado listo para registrar conservando `tipo='alarma_manual'`. */
      readonly propuesta: PropuestaActivacionAlarma;
      readonly identidad: 'dispositivo';
      readonly requiereUsuarioHumano: false;
      readonly motivo: string;
    }
  | {
      readonly tipo: 'FIN_DETECCION';
      readonly evento: EventoHardwareNormalizado;
      readonly incidente: AlarmIncidente;
      readonly noFinalizaEmergenciaReal: boolean;
      readonly requiereEvidenciaCierre: boolean;
      readonly motivo: string;
    }
  | {
      readonly tipo: 'SINCRONIZAR_CIERRE_SIMULACRO';
      readonly eventoId: string;
      readonly evidencia: EvidenciaCierreSimulacro;
      readonly motivo: 'cierre_explicito_esp1';
    }
  | {
      readonly tipo: 'IGNORAR_DUPLICADO';
      readonly eventoId: string;
      readonly motivo: string;
    }
  | {
      readonly tipo: 'IGNORAR_INVALIDO';
      readonly motivo: string;
      readonly code: string;
    }
  | {
      readonly tipo: 'EVIDENCIA_RECHAZADA';
      readonly eventoId: string;
      readonly motivo: string;
      readonly code: string;
    };

export type NormalizarEventoHardwareResultado =
  | { readonly valido: true; readonly evento: EventoHardwareNormalizado }
  | { readonly valido: false; readonly code: string; readonly motivo: string };

function esRegistro(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function esFechaIso(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function esIncidente(value: string): value is AlarmIncidente {
  return (EVENTOS_ESP1 as readonly string[]).includes(value);
}

function mecanismoDesdeEvidencia(evidencia: Record<string, unknown>): HardwareMecanismo {
  const origen = evidencia['origen'];
  if (origen === 'touch_o_control_local') return 'touch';
  if (origen === 'temperatura_alta') return 'sensor_temperatura';
  if (typeof evidencia['pico_m_s2'] === 'number' || typeof evidencia['rms_m_s2'] === 'number') {
    return 'sensor_movimiento';
  }
  return 'desconocido';
}

/** Valida topic, cabecera y cuerpo contra el contrato publicado por ESP1. */
export function normalizarEventoHardware(
  topic: string,
  payload: unknown,
  recibidoEn: string = new Date().toISOString(),
): NormalizarEventoHardwareResultado {
  if (!esFechaIso(recibidoEn)) {
    return { valido: false, code: 'FECHA_RECEPCION_INVALIDA', motivo: 'La fecha de recepción no es ISO8601.' };
  }

  if (!topic.startsWith(PREFIJO_EVENTOS_ESP1)) {
    return { valido: false, code: 'TOPICO_NO_ESP1', motivo: 'El topic no pertenece a eventos de placa1.' };
  }

  const nombre = topic.slice(PREFIJO_EVENTOS_ESP1.length);
  if (nombre.length === 0 || nombre.includes('/') || !esIncidente(nombre)) {
    return { valido: false, code: 'EVENTO_TOPICO_NO_VALIDO', motivo: 'El evento del topic no es reconocido.' };
  }

  if (!esRegistro(payload)) {
    return { valido: false, code: 'PAYLOAD_NO_OBJETO', motivo: 'El payload MQTT debe ser un objeto JSON.' };
  }

  const eventoId = payload['evento_id'];
  if (typeof eventoId !== 'string' || eventoId.length === 0 || eventoId.length > 63) {
    return { valido: false, code: 'EVENTO_ID_INVALIDO', motivo: 'evento_id debe tener entre 1 y 63 caracteres.' };
  }

  const sesion = payload['sesion'];
  const secuencia = payload['secuencia'];
  const evidencia = payload['evidencia'];

  if (
    payload['version'] !== 1 ||
    payload['placa'] !== 'placa1' ||
    payload['sala'] !== 'riesgo_bajo' ||
    payload['tipo'] !== 'evento' ||
    payload['evento'] !== nombre ||
    typeof payload['estado'] !== 'boolean' ||
    typeof sesion !== 'string' ||
    sesion.length === 0 ||
    typeof secuencia !== 'number' ||
    !Number.isFinite(secuencia) ||
    !esRegistro(evidencia)
  ) {
    return {
      valido: false,
      code: 'CONTRATO_FIRMWARE_INVALIDO',
      motivo: 'Cabecera, evento, disposición o evidencia no coinciden con ESP1.',
    };
  }

  const mensaje = payload as unknown as MqttEventoMensaje;

  return {
    valido: true,
    evento: {
      eventoId,
      incidente: nombre,
      estado: payload['estado'],
      placa: 'placa1',
      sala: 'riesgo_bajo',
      sesion,
      secuencia,
      mecanismo: mecanismoDesdeEvidencia(evidencia),
      recibidoEn,
      mensaje,
    },
  };
}

export interface DeduplicadorEventosHardware {
  procesar(evento: EventoHardwareNormalizado): HardwareEventDecision;
  registrarEvidenciaCierre(evidencia: EvidenciaCierreSimulacro): HardwareEventDecision;
  tieneEvento(eventoId: string): boolean;
  readonly tamanio: number;
}

/**
 * Historial acotado, equivalente a los 16 `evento_id` que ESP2 recuerda
 * (ESP2.txt: deduplicación remota). Dedupe por `evento_id`, nunca por contenido.
 */
export function crearDeduplicadorEventosHardware(limite = 16): DeduplicadorEventosHardware {
  const vistos: string[] = [];
  const vistosSet = new Set<string>();
  const activaciones = new Map<string, EventoHardwareNormalizado>();
  const cierres = new Set<string>();

  function recordar(id: string): void {
    if (vistosSet.has(id)) return;
    vistosSet.add(id);
    vistos.push(id);
    if (vistos.length > limite) {
      const antiguo = vistos.shift();
      if (antiguo !== undefined) {
        vistosSet.delete(antiguo);
        activaciones.delete(antiguo);
        cierres.delete(`${antiguo}:cierre`);
      }
    }
  }

  return {
    get tamanio(): number {
      return vistos.length;
    },

    tieneEvento(eventoId: string): boolean {
      return vistosSet.has(eventoId);
    },

    procesar(evento: EventoHardwareNormalizado): HardwareEventDecision {
      if (vistosSet.has(evento.eventoId)) {
        return {
          tipo: 'IGNORAR_DUPLICADO',
          eventoId: evento.eventoId,
          motivo: 'evento_id ya procesado.',
        };
      }

      recordar(evento.eventoId);

      if (!evento.estado) {
        const hayCierre = cierres.has(`${evento.eventoId}:cierre`);
        if (evento.incidente === 'simulacro' && hayCierre) {
          return {
            tipo: 'FIN_DETECCION',
            evento,
            incidente: 'simulacro',
            noFinalizaEmergenciaReal: false,
            requiereEvidenciaCierre: false,
            motivo: 'Fin de detección con cierre explícito ya registrado.',
          };
        }

        return {
          tipo: 'FIN_DETECCION',
          evento,
          incidente: evento.incidente,
          noFinalizaEmergenciaReal: true,
          requiereEvidenciaCierre: evento.incidente === 'simulacro' && !hayCierre,
          motivo:
            evento.incidente === 'simulacro'
              ? 'Fin de detección; se requiere evidencia del comando action:false enviado por ESP1.'
              : 'Fin de detección; no finaliza una emergencia real.',
        };
      }

      activaciones.set(evento.eventoId, evento);

      if (cierres.has(`${evento.eventoId}:cierre`)) {
        return {
          tipo: 'SINCRONIZAR_CIERRE_SIMULACRO',
          eventoId: evento.eventoId,
          evidencia: {
            eventoId: evento.eventoId,
            topic: TOPICO_COMANDOS_ALARMA,
            comando: { action: false, alcance: 'simulacro' },
            recibidoEn: evento.recibidoEn,
            placa: 'placa1',
          },
          motivo: 'cierre_explicito_esp1',
        };
      }

      return {
        tipo: 'CREAR_INCIDENTE_HARDWARE',
        evento,
        idempotencia: evento.eventoId,
        origen: 'hardware',
        propuesta: {
          clave_idempotencia: evento.eventoId,
          tipo: TIPO_ALARMA_MANUAL,
          evento: evento.incidente,
          origen: 'hardware',
          titulo: TITULO_ALARMA_MANUAL,
          mensaje: MENSAJE_ALARMA_MANUAL,
          severidad: SEVERIDAD_ALARMA_MANUAL,
        },
        identidad: IDENTIDAD_DISPOSITIVO,
        requiereUsuarioHumano: false,
        motivo: `Detección iniciada por ${evento.mecanismo} en placa1.`,
      };
    },

    registrarEvidenciaCierre(evidencia: EvidenciaCierreSimulacro): HardwareEventDecision {
      const clave = `${evidencia.eventoId}:cierre`;

      if (cierres.has(clave)) {
        return {
          tipo: 'IGNORAR_DUPLICADO',
          eventoId: evidencia.eventoId,
          motivo: 'Evidencia de cierre ya registrada.',
        };
      }

      if (evidencia.topic !== TOPICO_COMANDOS_ALARMA || evidencia.placa !== 'placa1') {
        return {
          tipo: 'EVIDENCIA_RECHAZADA',
          eventoId: evidencia.eventoId,
          motivo: 'La evidencia debe provenir del topic de comandos original y de placa1.',
          code: 'EVIDENCIA_ORIGEN_INVALIDO',
        };
      }

      if (!esFechaIso(evidencia.recibidoEn)) {
        return {
          tipo: 'EVIDENCIA_RECHAZADA',
          eventoId: evidencia.eventoId,
          motivo: 'La fecha de la evidencia no es ISO8601.',
          code: 'EVIDENCIA_FECHA_INVALIDA',
        };
      }

      if (!esComandoCierreSimulacro(evidencia.comando)) {
        return {
          tipo: 'EVIDENCIA_RECHAZADA',
          eventoId: evidencia.eventoId,
          motivo: 'El comando observado no es un apagado de simulacro válido.',
          code: 'EVIDENCIA_COMANDO_INVALIDO',
        };
      }

      const activacion = activaciones.get(evidencia.eventoId);
      if (activacion === undefined || activacion.incidente !== 'simulacro' || !activacion.estado) {
        return {
          tipo: 'EVIDENCIA_RECHAZADA',
          eventoId: evidencia.eventoId,
          motivo: 'No existe una activación de simulacro previa con ese evento_id.',
          code: 'EVIDENCIA_SIN_ACTIVACION',
        };
      }

      const diferencia = Math.abs(Date.parse(evidencia.recibidoEn) - Date.parse(activacion.recibidoEn));
      if (diferencia > VENTANA_CIERRE_SIMULACRO_MS) {
        return {
          tipo: 'EVIDENCIA_RECHAZADA',
          eventoId: evidencia.eventoId,
          motivo: 'La evidencia quedó fuera de la ventana de cierre del simulacro.',
          code: 'EVIDENCIA_FUERA_DE_VENTANA',
        };
      }

      cierres.add(clave);
      recordar(`${evidencia.eventoId}:cierre`);

      return {
        tipo: 'SINCRONIZAR_CIERRE_SIMULACRO',
        eventoId: evidencia.eventoId,
        evidencia,
        motivo: 'cierre_explicito_esp1',
      };
    },
  };
}

/** Adaptador de un mensaje SSE ya recibido por TelemetryService. */
export function decidirDesdeMensajeMqtt(
  deduplicador: DeduplicadorEventosHardware,
  topic: string,
  payload: unknown,
  recibidoEn: string,
): HardwareEventDecision {
  const normalizado = normalizarEventoHardware(topic, payload, recibidoEn);
  if (!normalizado.valido) {
    return { tipo: 'IGNORAR_INVALIDO', motivo: normalizado.motivo, code: normalizado.code };
  }
  return deduplicador.procesar(normalizado.evento);
}
