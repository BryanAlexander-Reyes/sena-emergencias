/**
 * SENA CROWD INTELLIGENCE — Fase MQTT.2.
 *
 * Núcleo puro (sin Angular, sin Node, sin red) compartido por el receptor MQTT
 * y el cliente Ionic. Todos los nombres de topic/campo proceden de ESP1.txt y
 * ESP2.txt; ver `mqtt-contracts.ts`. No se inventan campos ni se rellenan
 * valores ausentes con datos simulados.
 */

import type { MqttEventoMensaje, MqttMetricasEsp1, MqttMetricasEsp2, MqttTelemetriaSnapshot } from './mqtt-contracts';

/** Suscripciones exactas confirmadas en los dos firmware originales. */
export const TELEMETRY_TOPICS = {
  METRICAS: 'sena/casanare/metricas',
  PLACA1_EVENTOS_WILDCARD: 'sena/casanare/placa1/eventos/+',
  PLACA2_EVENTOS_INCENDIO: 'sena/casanare/placa2/eventos/incendio',
  PLACA1_ESTADO_CONEXION: 'sena/casanare/placa1/estado/conexion',
  PLACA2_ESTADO_CONEXION: 'sena/casanare/placa2/estado/conexion',
} as const;

export const TELEMETRY_SUBSCRIPTIONS: readonly { readonly topic: string; readonly qos: 0 }[] = [
  { topic: TELEMETRY_TOPICS.METRICAS, qos: 0 },
  { topic: TELEMETRY_TOPICS.PLACA1_EVENTOS_WILDCARD, qos: 0 },
  { topic: TELEMETRY_TOPICS.PLACA2_EVENTOS_INCENDIO, qos: 0 },
  { topic: TELEMETRY_TOPICS.PLACA1_ESTADO_CONEXION, qos: 0 },
  { topic: TELEMETRY_TOPICS.PLACA2_ESTADO_CONEXION, qos: 0 },
];

/** `nombreEvento()` de ESP1; ESP2 solo publica incendio. */
export const TELEMETRY_EVENTOS_PLACA1 = ['incendio', 'sismo', 'impacto', 'simulacro', 'emergencia'] as const;

/** Las métricas normales llegan por minuto; 3 min evita marcarlas obsoletas por retrasos NTP. */
export const TELEMETRY_STALE_MS = 180_000;

/** Límite defensivo para el payload MQTT (ESP1 usa 1800 B, ESP2 usa 1024 B). */
export const TELEMETRY_MAX_PAYLOAD_BYTES = 16_384;

export const TELEMETRY_FIXTURE_BANNER = 'DATOS DE PRUEBA — NO LECTURAS FÍSICAS';

/** Cargamento enviado por SSE. `demo` identifica fixtures, nunca lecturas reales. */
export interface TelemetryStreamPayload {
  readonly snapshot: MqttTelemetriaSnapshot;
  readonly demo: boolean;
  readonly receivedAt: string;
}

export type ApplyTelemetryResult =
  | { readonly accepted: true; readonly snapshot: MqttTelemetriaSnapshot }
  | { readonly accepted: false; readonly reason: string };

/** Estado vacío explícito: nunca se sustituye por valores simulados. */
export function emptySnapshot(): MqttTelemetriaSnapshot {
  return {
    placa1: { conexion: null, metricas: null, ultimoEvento: null, updatedAt: null },
    placa2: { conexion: null, metricas: null, ultimoEvento: null, updatedAt: null },
    bridge: { connected: false, lastError: null, updatedAt: null },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function salaEsperada(placa: unknown): string | null {
  if (placa === 'placa1') return 'riesgo_bajo';
  if (placa === 'placa2') return 'riesgo_alto';
  return null;
}

function cabeceraValida(value: Record<string, unknown>, tipo: 'metricas' | 'evento', placa: string): boolean {
  return (
    value['version'] === 1 &&
    value['placa'] === placa &&
    value['sala'] === salaEsperada(placa) &&
    typeof value['sesion'] === 'string' &&
    isFiniteNumber(value['secuencia']) &&
    value['tipo'] === tipo &&
    isFiniteNumber(value['tiempo_activo_ms']) &&
    (typeof value['fecha'] === 'string' || value['fecha'] === null)
  );
}

function vectorONulo(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) && isFiniteNumber(value['x']) && isFiniteNumber(value['y']) && isFiniteNumber(value['z']))
  );
}

function temperaturaEsp1Valida(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['valida'] === 'boolean' &&
    isFiniteNumber(value['fallos_consecutivos']) &&
    typeof value['estado_sensor'] === 'string' &&
    typeof value['deteccion_incendio_activa'] === 'boolean' &&
    (value['valor_c'] === null || isFiniteNumber(value['valor_c'])) &&
    (value['humedad_porcentaje'] === null || isFiniteNumber(value['humedad_porcentaje']))
  );
}

function temperaturaEsp2Valida(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['valida'] === 'boolean' &&
    typeof value['estado_sensor'] === 'string' &&
    isFiniteNumber(value['fallos_consecutivos']) &&
    typeof value['deteccion_incendio_activa'] === 'boolean' &&
    (value['valor_c'] === null || isFiniteNumber(value['valor_c']))
  );
}

function esMetricasEsp1(value: unknown): value is MqttMetricasEsp1 {
  if (
    !isRecord(value) ||
    !cabeceraValida(value, 'metricas', 'placa1') ||
    !temperaturaEsp1Valida(value['temperatura'])
  ) {
    return false;
  }

  const imu = value['acelerometro'];
  const ultrasonico = value['ultrasonico'];
  const touch = value['touch'];
  const eventos = value['eventos'];

  const imuValido =
    isRecord(imu) &&
    typeof imu['valido'] === 'boolean' &&
    isFiniteNumber(imu['identidad']) &&
    typeof imu['ventana_valida'] === 'boolean' &&
    isFiniteNumber(imu['frecuencia_muestreo_hz']) &&
    vectorONulo(imu['aceleracion_m_s2']) &&
    vectorONulo(imu['giro_grados_s']) &&
    (imu['temperatura_interna_c'] === null || isFiniteNumber(imu['temperatura_interna_c'])) &&
    (imu['pico_m_s2'] === null || isFiniteNumber(imu['pico_m_s2'])) &&
    (imu['rms_m_s2'] === null || isFiniteNumber(imu['rms_m_s2'])) &&
    (imu['actividad_porcentaje'] === null || isFiniteNumber(imu['actividad_porcentaje'])) &&
    (imu['factor_cresta'] === null || isFiniteNumber(imu['factor_cresta'])) &&
    typeof imu['condicion'] === 'string';

  const ultrasonicoValido =
    isRecord(ultrasonico) &&
    typeof ultrasonico['valido'] === 'boolean' &&
    typeof ultrasonico['estado'] === 'string' &&
    (ultrasonico['distancia_cm'] === null || isFiniteNumber(ultrasonico['distancia_cm']));

  const touchValido = isRecord(touch) && typeof touch['activo'] === 'boolean';
  const eventosValidos =
    isRecord(eventos) && TELEMETRY_EVENTOS_PLACA1.every((nombre) => typeof eventos[nombre] === 'boolean');

  return (
    imuValido &&
    ultrasonicoValido &&
    touchValido &&
    eventosValidos &&
    typeof value['alerta_retenida'] === 'boolean' &&
    typeof value['incendio_remoto_activo'] === 'boolean'
  );
}

function esMetricasEsp2(value: unknown): value is MqttMetricasEsp2 {
  if (
    !isRecord(value) ||
    !cabeceraValida(value, 'metricas', 'placa2') ||
    !temperaturaEsp2Valida(value['temperatura'])
  ) {
    return false;
  }

  const ir = value['ir'];
  return (
    isRecord(ir) &&
    typeof ir['entrada'] === 'boolean' &&
    typeof ir['salida'] === 'boolean' &&
    isFiniteNumber(ir['detecciones_entrada']) &&
    isFiniteNumber(ir['detecciones_salida'])
  );
}

function esEvento(value: Record<string, unknown>, placa: string, evento: string): boolean {
  return (
    cabeceraValida(value, 'evento', placa) &&
    typeof value['evento_id'] === 'string' &&
    value['evento'] === evento &&
    typeof value['estado'] === 'boolean' &&
    isRecord(value['evidencia'])
  );
}

function fechaValida(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

/**
 * Aplica un mensaje MQTT ya parseado al estado en memoria. Nunca muta la entrada.
 * Devuelve el motivo exacto del rechazo para que el receptor lo informe por SSE.
 */
export function applyTelemetryEnvelope(
  snapshot: MqttTelemetriaSnapshot,
  topic: string,
  payload: unknown,
  receivedAt: string,
): ApplyTelemetryResult {
  if (!fechaValida(receivedAt)) return { accepted: false, reason: 'Fecha de recepción inválida.' };

  if (!isRecord(payload)) return { accepted: false, reason: 'Payload MQTT no es un objeto JSON.' };

  const prefijoEvento1 = TELEMETRY_TOPICS.PLACA1_EVENTOS_WILDCARD.slice(0, -1);

  if (topic === TELEMETRY_TOPICS.METRICAS) {
    const placa = payload['placa'];

    if (placa === 'placa1' && esMetricasEsp1(payload)) {
      return {
        accepted: true,
        snapshot: {
          ...snapshot,
          placa1: { ...snapshot.placa1, metricas: payload, updatedAt: receivedAt },
        },
      };
    }

    if (placa === 'placa2' && esMetricasEsp2(payload)) {
      return {
        accepted: true,
        snapshot: {
          ...snapshot,
          placa2: { ...snapshot.placa2, metricas: payload, updatedAt: receivedAt },
        },
      };
    }

    return { accepted: false, reason: 'Métrica rechazada: cabecera o campos no coinciden con el firmware.' };
  }

  if (topic.startsWith(prefijoEvento1)) {
    const nombre = topic.slice(prefijoEvento1.length);
    const permitido = (TELEMETRY_EVENTOS_PLACA1 as readonly string[]).includes(nombre);

    if (!nombre || nombre.includes('/') || !permitido || !esEvento(payload, 'placa1', nombre)) {
      return { accepted: false, reason: 'Evento de placa1 rechazado: topic y payload no coinciden.' };
    }

    return {
      accepted: true,
      snapshot: {
        ...snapshot,
        placa1: { ...snapshot.placa1, ultimoEvento: payload as unknown as MqttEventoMensaje, updatedAt: receivedAt },
      },
    };
  }

  if (topic === TELEMETRY_TOPICS.PLACA2_EVENTOS_INCENDIO) {
    if (!esEvento(payload, 'placa2', 'incendio')) {
      return { accepted: false, reason: 'Evento de placa2 rechazado: se esperaba incendio de placa2.' };
    }

    return {
      accepted: true,
      snapshot: {
        ...snapshot,
        placa2: { ...snapshot.placa2, ultimoEvento: payload as unknown as MqttEventoMensaje, updatedAt: receivedAt },
      },
    };
  }

  if (topic === TELEMETRY_TOPICS.PLACA1_ESTADO_CONEXION || topic === TELEMETRY_TOPICS.PLACA2_ESTADO_CONEXION) {
    // LWT: {"online":false} no lleva cabecera de firmware.
    if (typeof payload['online'] !== 'boolean' || Object.keys(payload).length !== 1) {
      return { accepted: false, reason: 'Estado de conexión rechazado: se esperaba {"online":boolean}.' };
    }

    const clave = topic === TELEMETRY_TOPICS.PLACA1_ESTADO_CONEXION ? 'placa1' : 'placa2';
    return {
      accepted: true,
      snapshot: {
        ...snapshot,
        [clave]: { ...snapshot[clave], conexion: { online: payload['online'] }, updatedAt: receivedAt },
      },
    };
  }

  return { accepted: false, reason: `Topic no suscrito: ${topic}` };
}

/** Última actualización conocida de cualquiera de las dos placas. */
export function latestUpdateAt(snapshot: MqttTelemetriaSnapshot): string | null {
  const candidatos = [snapshot.placa1.updatedAt, snapshot.placa2.updatedAt].filter(
    (valor): valor is string => valor !== null,
  );

  if (candidatos.length === 0) return null;

  return candidatos.reduce((masReciente, actual) =>
    Date.parse(actual) > Date.parse(masReciente) ? actual : masReciente,
  );
}

/** Un dato sin fecha, con fecha inválida o más antiguo que el umbral se considera obsoleto. */
export function isStale(iso: string | null, now: number, maxAgeMs = TELEMETRY_STALE_MS): boolean {
  if (iso === null) return true;

  const tiempo = Date.parse(iso);
  return !Number.isFinite(tiempo) || now - tiempo > maxAgeMs;
}

export function isTelemetryStreamPayload(value: unknown): value is TelemetryStreamPayload {
  if (
    !isRecord(value) ||
    !isRecord(value['snapshot']) ||
    typeof value['demo'] !== 'boolean' ||
    typeof value['receivedAt'] !== 'string'
  ) {
    return false;
  }

  const snapshot = value['snapshot'];
  return isRecord(snapshot['placa1']) && isRecord(snapshot['placa2']) && isRecord(snapshot['bridge']);
}
