/**
 * Fixtures de telemetría para pruebas SIN HARDWARE.
 *
 * Réplica exacta de los campos publicados por ESP1.txt / ESP2.txt.
 * NO son lecturas físicas: el receptor las etiqueta con `demo: true` y la
 * pantalla muestra un aviso permanente cuando se usan.
 */

import type { MqttEventoMensaje, MqttMetricasEsp1, MqttMetricasEsp2, MqttTelemetriaSnapshot } from './mqtt-contracts';
import type { TelemetryStreamPayload } from './telemetry-core';

export const FIXTURE_BANNER = 'DATOS DE PRUEBA — NO LECTURAS FÍSICAS';

export const FIXTURE_FECHA = '2026-11-23T12:00:00Z';
export const FIXTURE_RECEIVED_AT = '2026-11-23T12:00:05Z';

export const TOPIC_METRICAS = 'sena/casanare/metricas';
export const TOPIC_EVENTO_ESP1_INCENDIO = 'sena/casanare/placa1/eventos/incendio';
export const TOPIC_EVENTO_ESP1_SISMO = 'sena/casanare/placa1/eventos/sismo';
export const TOPIC_EVENTO_ESP2_INCENDIO = 'sena/casanare/placa2/eventos/incendio';
export const TOPIC_CONEXION_ESP1 = 'sena/casanare/placa1/estado/conexion';
export const TOPIC_CONEXION_ESP2 = 'sena/casanare/placa2/estado/conexion';

export function fixtureMetricasEsp1(): MqttMetricasEsp1 {
  return {
    version: 1,
    placa: 'placa1',
    sala: 'riesgo_bajo',
    sesion: 'p1-FIXTURE01',
    secuencia: 41,
    tipo: 'metricas',
    tiempo_activo_ms: 184200,
    fecha: FIXTURE_FECHA,
    temperatura: {
      valida: true,
      fallos_consecutivos: 0,
      estado_sensor: 'ok',
      deteccion_incendio_activa: false,
      valor_c: 27.4,
      humedad_porcentaje: 61.2,
    },
    acelerometro: {
      valido: true,
      identidad: 112,
      ventana_valida: true,
      frecuencia_muestreo_hz: 98.4,
      aceleracion_m_s2: { x: 0.12, y: -0.08, z: 9.78 },
      giro_grados_s: { x: 0.4, y: -0.2, z: 0.1 },
      temperatura_interna_c: 36.8,
      pico_m_s2: 1.85,
      rms_m_s2: 0.72,
      actividad_porcentaje: 68.5,
      factor_cresta: 2.57,
      saturacion: false,
      condicion: 'sin_evento',
    },
    ultrasonico: {
      valido: true,
      estado: 'ok',
      distancia_cm: 84.5,
    },
    touch: { activo: false },
    alerta_retenida: false,
    incendio_remoto_activo: false,
    eventos: {
      incendio: false,
      sismo: false,
      impacto: false,
      simulacro: false,
      emergencia: false,
    },
  };
}

export function fixtureMetricasEsp2(): MqttMetricasEsp2 {
  return {
    version: 1,
    placa: 'placa2',
    sala: 'riesgo_alto',
    sesion: 'p2-FIXTURE02',
    secuencia: 77,
    tipo: 'metricas',
    tiempo_activo_ms: 301900,
    fecha: FIXTURE_FECHA,
    temperatura: {
      valida: true,
      estado_sensor: 'ok',
      fallos_consecutivos: 0,
      deteccion_incendio_activa: false,
      valor_c: 38.6,
    },
    ir: {
      entrada: false,
      salida: true,
      detecciones_entrada: 12,
      detecciones_salida: 9,
    },
  };
}

export function fixtureEventoEsp1(evento: 'incendio' | 'sismo' = 'incendio', estado = true): MqttEventoMensaje {
  const evidencia =
    evento === 'incendio'
      ? {
          origen: 'temperatura_alta' as const,
          temperatura_c: 41.7,
          umbral_c: 40,
          rearme_inferior_a_c: 37,
        }
      : {
          pico_m_s2: 6.42,
          rms_m_s2: 1.31,
          actividad_porcentaje: 88.2,
          factor_cresta: 4.9,
          ventana_valida: true,
        };

  return {
    version: 1,
    placa: 'placa1',
    sala: 'riesgo_bajo',
    sesion: 'p1-FIXTURE01',
    secuencia: 42,
    tipo: 'evento',
    tiempo_activo_ms: 184300,
    fecha: FIXTURE_FECHA,
    evento_id: 'p1-FIXTURE01-3',
    evento,
    estado,
    evidencia,
  };
}

export function fixtureEventoEsp2(estado = true): MqttEventoMensaje {
  return {
    version: 1,
    placa: 'placa2',
    sala: 'riesgo_alto',
    sesion: 'p2-FIXTURE02',
    secuencia: 78,
    tipo: 'evento',
    tiempo_activo_ms: 302000,
    fecha: FIXTURE_FECHA,
    evento_id: 'p2-FIXTURE02-1',
    evento: 'incendio',
    estado,
    evidencia: {
      origen: 'temperatura_alta',
      temperatura_c: 41.2,
      umbral_c: 40,
      rearme_inferior_a_c: 37,
    },
  };
}

/** Métrica con valores nulos reales del firmware (sensor sin datos): NO se rellena. */
export function fixtureMetricasEsp1SinDatos(): MqttMetricasEsp1 {
  const base = fixtureMetricasEsp1();
  return {
    ...base,
    temperatura: {
      ...base.temperatura,
      valida: false,
      estado_sensor: 'sin_datos',
      valor_c: null,
      humedad_porcentaje: null,
    },
    acelerometro: {
      ...base.acelerometro,
      valido: false,
      ventana_valida: false,
      aceleracion_m_s2: null,
      giro_grados_s: null,
      temperatura_interna_c: null,
      pico_m_s2: null,
      rms_m_s2: null,
      actividad_porcentaje: null,
      factor_cresta: null,
      condicion: 'sin_datos',
    },
    ultrasonico: { valido: false, estado: 'sin_eco', distancia_cm: null },
  };
}

export interface FixtureMensajeMqtt {
  readonly topic: string;
  readonly payload: unknown;
}

/** Seguencia de demostración que ejercita los 5 topics suscritos. */
export function fixtureMensajes(): readonly FixtureMensajeMqtt[] {
  return [
    { topic: TOPIC_CONEXION_ESP1, payload: { online: true } },
    { topic: TOPIC_CONEXION_ESP2, payload: { online: true } },
    { topic: TOPIC_METRICAS, payload: fixtureMetricasEsp1() },
    { topic: TOPIC_METRICAS, payload: fixtureMetricasEsp2() },
    { topic: TOPIC_EVENTO_ESP1_INCENDIO, payload: fixtureEventoEsp1() },
    { topic: TOPIC_EVENTO_ESP2_INCENDIO, payload: fixtureEventoEsp2() },
  ];
}

export interface FixtureInvalida {
  readonly topic: string;
  readonly payload: unknown;
  readonly motivo: string;
}

export const fixtureInvalidas: readonly FixtureInvalida[] = [
  { topic: TOPIC_METRICAS, payload: { tipo: 'metricas' }, motivo: 'cabecera incompleta' },
  { topic: TOPIC_METRICAS, payload: { ...fixtureMetricasEsp1(), placa: 'placa3' }, motivo: 'placa desconocida' },
  {
    topic: TOPIC_METRICAS,
    payload: { ...fixtureMetricasEsp2(), sala: 'riesgo_bajo' },
    motivo: 'sala incoherente',
  },
  {
    topic: TOPIC_EVENTO_ESP1_SISMO,
    payload: fixtureEventoEsp1('incendio'),
    motivo: 'topic y evento no coinciden',
  },
  { topic: TOPIC_EVENTO_ESP2_INCENDIO, payload: { online: true }, motivo: 'evento sin cabecera' },
  { topic: TOPIC_CONEXION_ESP1, payload: { online: 'si' }, motivo: 'online no booleano' },
  { topic: 'sena/casanare/placa2/comandos/alarma', payload: { action: false }, motivo: 'topic no suscrito' },
];

export function fixtureSnapshot(receivedAt = FIXTURE_RECEIVED_AT): MqttTelemetriaSnapshot {
  return {
    placa1: {
      conexion: { online: true },
      metricas: fixtureMetricasEsp1(),
      ultimoEvento: fixtureEventoEsp1(),
      updatedAt: receivedAt,
    },
    placa2: {
      conexion: { online: true },
      metricas: fixtureMetricasEsp2(),
      ultimoEvento: fixtureEventoEsp2(),
      updatedAt: receivedAt,
    },
    bridge: { connected: true, lastError: null, updatedAt: receivedAt },
  };
}

export function fixtureStreamPayload(receivedAt = FIXTURE_RECEIVED_AT, demo = true): TelemetryStreamPayload {
  return { snapshot: fixtureSnapshot(receivedAt), demo, receivedAt };
}
