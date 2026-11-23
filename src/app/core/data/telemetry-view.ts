/** Proyección de la telemetría cruda a filas legibles para la pantalla IoT. */

import type { MqttEventoMensaje, MqttMetricasEsp1, MqttMetricasEsp2, MqttTelemetriaSnapshot } from './mqtt-contracts';
import { isStale, TELEMETRY_FIXTURE_BANNER, type TelemetryStreamPayload } from './telemetry-core';

export interface TelemetryDato {
  readonly etiqueta: string;
  readonly valor: string;
  readonly unidad: string | null;
  readonly disponible: boolean;
  readonly nota?: string;
}

export interface TelemetryEventoVista {
  readonly id: string;
  readonly nombre: string;
  readonly estadoTexto: string;
  readonly fecha: string;
  readonly evidencia: string;
  readonly nota: string;
}

export interface TelemetryPlacaVista {
  readonly id: 'placa1' | 'placa2';
  readonly titulo: string;
  readonly riesgo: string;
  readonly estadoConexion: string;
  readonly conexionOk: boolean;
  readonly sinDatos: boolean;
  readonly obsoleto: boolean;
  readonly ultimaActualizacion: string;
  readonly ultimaMedicion: string;
  readonly datos: readonly TelemetryDato[];
  readonly eventos: readonly TelemetryEventoVista[];
  readonly avisos: readonly string[];
}

export interface TelemetryVistas {
  readonly placa1: TelemetryPlacaVista;
  readonly placa2: TelemetryPlacaVista;
}

const SIN_DATO = 'No disponible';

function dato(
  etiqueta: string,
  valor: string,
  unidad: string | null,
  disponible: boolean,
  nota?: string,
): TelemetryDato {
  return { etiqueta, valor, unidad, disponible, ...(nota ? { nota } : {}) };
}

function numero(valor: number | null | undefined, decimales = 2): string {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor.toFixed(decimales) : SIN_DATO;
}

function siNo(valor: boolean | null | undefined): string {
  return typeof valor === 'boolean' ? (valor ? 'Sí' : 'No') : SIN_DATO;
}

function fechaLegible(iso: string | null | undefined): string {
  if (typeof iso !== 'string' || iso.length === 0) return 'Sin fecha NTP';

  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime())
    ? 'Fecha no válida'
    : `${fecha.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

function vectorTexto(vector: { x: number; y: number; z: number } | null | undefined): string {
  return vector ? `${numero(vector.x)}, ${numero(vector.y)}, ${numero(vector.z)}` : SIN_DATO;
}

function estadoConexionDe(
  snapshot: MqttTelemetriaSnapshot,
  placa: 'placa1' | 'placa2',
): { texto: string; ok: boolean } {
  if (!snapshot.bridge.connected) return { texto: 'Receptor sin enlace MQTT', ok: false };

  const conexion = snapshot[placa].conexion;
  if (conexion === null) return { texto: 'Sin dato MQTT (LWT)', ok: false };

  return conexion.online
    ? { texto: 'En línea (mensaje retenido LWT)', ok: true }
    : { texto: 'Desconectado (LWT)', ok: false };
}

function datosEsp1(metricas: MqttMetricasEsp1 | null): readonly TelemetryDato[] {
  if (!metricas) return [];

  const { temperatura, acelerometro, ultrasonico, touch, eventos } = metricas;
  const vector = acelerometro.aceleracion_m_s2;
  const giro = acelerometro.giro_grados_s;

  return [
    dato(
      'Temperatura DHT11',
      numero(temperatura.valor_c, 1),
      '°C',
      temperatura.valor_c !== null,
      `Estado del sensor: ${temperatura.estado_sensor}. Fallos consecutivos: ${temperatura.fallos_consecutivos}.`,
    ),
    dato(
      'Humedad DHT11',
      numero(temperatura.humedad_porcentaje, 1),
      '%',
      temperatura.humedad_porcentaje !== null,
      'El firmware publica null cuando la lectura de humedad no es válida.',
    ),
    dato('Acelerómetro MPU', acelerometro.valido ? 'Lectura válida' : SIN_DATO, null, acelerometro.valido),
    dato('Aceleración (x, y, z)', vectorTexto(vector), 'm/s²', vector !== null),
    dato('Giro (x, y, z)', vectorTexto(giro), '°/s', giro !== null),
    dato(
      'Temperatura interna MPU',
      numero(acelerometro.temperatura_interna_c, 1),
      '°C',
      acelerometro.temperatura_interna_c !== null,
    ),
    dato('Pico de movimiento', numero(acelerometro.pico_m_s2), 'm/s²', acelerometro.pico_m_s2 !== null),
    dato('RMS de movimiento', numero(acelerometro.rms_m_s2), 'm/s²', acelerometro.rms_m_s2 !== null),
    dato('Actividad', numero(acelerometro.actividad_porcentaje, 1), '%', acelerometro.actividad_porcentaje !== null),
    dato('Factor de cresta', numero(acelerometro.factor_cresta), null, acelerometro.factor_cresta !== null),
    dato('Frecuencia de muestreo', numero(acelerometro.frecuencia_muestreo_hz, 1), 'Hz', true),
    dato('Ventana estadística', siNo(acelerometro.ventana_valida), null, true),
    dato('Condición IMU', acelerometro.condicion, null, true),
    dato('Impacto (detectando)', siNo(eventos.impacto), null, true),
    dato('Posible sismo (detectando)', siNo(eventos.sismo), null, true),
    dato('Incendio local (detectando)', siNo(eventos.incendio), null, true),
    dato('Simulacro (detectando)', siNo(eventos.simulacro), null, true),
    dato('Emergencia manual (detectando)', siNo(eventos.emergencia), null, true),
    dato('Incendio remoto activo', siNo(metricas.incendio_remoto_activo), null, true),
    dato('Alerta retenida', siNo(metricas.alerta_retenida), null, true),
    dato('Distancia ultrasónica', numero(ultrasonico.distancia_cm, 1), 'cm', ultrasonico.distancia_cm !== null),
    dato('Estado ultrasónico', ultrasonico.estado, null, true),
    dato('Touch', siNo(touch.activo), null, true),
  ];
}

function datosEsp2(metricas: MqttMetricasEsp2 | null): readonly TelemetryDato[] {
  if (!metricas) return [];

  const { temperatura, ir } = metricas;

  return [
    dato(
      'Temperatura DHT11',
      numero(temperatura.valor_c, 1),
      '°C',
      temperatura.valor_c !== null,
      `Estado del sensor: ${temperatura.estado_sensor}. Fallos consecutivos: ${temperatura.fallos_consecutivos}.`,
    ),
    dato('Detección incendio activa', siNo(temperatura.deteccion_incendio_activa), null, true),
    dato('Sensor IR de entrada', siNo(ir.entrada), null, true, 'Módulo activo en LOW (G27).'),
    dato('Sensor IR de salida', siNo(ir.salida), null, true, 'Módulo activo en LOW (G26).'),
    dato('Contador de entradas', numero(ir.detecciones_entrada, 0), 'detecciones', true),
    dato('Contador de salidas', numero(ir.detecciones_salida, 0), 'detecciones', true),
  ];
}

function describirEvidencia(evento: MqttEventoMensaje): string {
  const evidencia = evento.evidencia;

  if ('origen' in evidencia) {
    const temporal =
      'temperatura_c' in evidencia && evidencia.temperatura_c !== null
        ? ` · ${numero(evidencia.temperatura_c, 1)} °C`
        : '';
    return `Origen: ${evidencia.origen}${temporal}`;
  }

  return `Pico ${numero(evidencia.pico_m_s2)} m/s² · RMS ${numero(evidencia.rms_m_s2)} m/s²`;
}

function eventosDe(evento: MqttEventoMensaje | null): readonly TelemetryEventoVista[] {
  if (!evento) return [];

  return [
    {
      id: evento.evento_id,
      nombre: evento.evento,
      estadoTexto: evento.estado ? 'Detección activa' : 'Detección finalizada',
      fecha: fechaLegible(evento.fecha),
      evidencia: describirEvidencia(evento),
      nota: 'El campo estado describe la detección; no confirma una alarma oficial.',
    },
  ];
}

function avisosDe(
  snapshot: MqttTelemetriaSnapshot,
  estado: ReturnType<typeof estadoConexionDe>,
  obsoleto: boolean,
  demo: boolean,
  sinDatos: boolean,
): readonly string[] {
  const avisos: string[] = [];

  if (demo) avisos.push(TELEMETRY_FIXTURE_BANNER);
  if (snapshot.bridge.lastError) avisos.push(`Receptor: ${snapshot.bridge.lastError}`);
  if (!estado.ok) avisos.push('El estado de conexión no está confirmado por MQTT.');
  if (sinDatos) avisos.push('Todavía no se han recibido métricas de esta placa.');
  if (obsoleto) avisos.push('Datos obsoletos: no se ha recibido telemetría recientemente.');

  return avisos;
}

/** Construye ambas secciones de la pantalla a partir de un stream payload. */
export function buildTelemetryViews(payload: TelemetryStreamPayload, now: number): TelemetryVistas {
  const snapshot = payload.snapshot;
  const placa1 = snapshot.placa1;
  const placa2 = snapshot.placa2;
  const conexion1 = estadoConexionDe(snapshot, 'placa1');
  const conexion2 = estadoConexionDe(snapshot, 'placa2');
  const obsoleto1 = isStale(placa1.updatedAt, now);
  const obsoleto2 = isStale(placa2.updatedAt, now);
  const sinDatos1 = placa1.metricas === null;
  const sinDatos2 = placa2.metricas === null;

  return {
    placa1: {
      id: 'placa1',
      titulo: 'ESP32 1 — Placa 1',
      riesgo: 'Riesgo bajo · Sala riesgo_bajo',
      estadoConexion: conexion1.texto,
      conexionOk: conexion1.ok,
      sinDatos: sinDatos1,
      obsoleto: obsoleto1,
      ultimaActualizacion: fechaLegible(placa1.updatedAt),
      ultimaMedicion: fechaLegible(placa1.metricas?.fecha ?? null),
      datos: datosEsp1(placa1.metricas),
      eventos: eventosDe(placa1.ultimoEvento),
      avisos: avisosDe(snapshot, conexion1, obsoleto1, payload.demo, sinDatos1),
    },
    placa2: {
      id: 'placa2',
      titulo: 'ESP32 2 — Placa 2',
      riesgo: 'Riesgo alto · Sala riesgo_alto',
      estadoConexion: conexion2.texto,
      conexionOk: conexion2.ok,
      sinDatos: sinDatos2,
      obsoleto: obsoleto2,
      ultimaActualizacion: fechaLegible(placa2.updatedAt),
      ultimaMedicion: fechaLegible(placa2.metricas?.fecha ?? null),
      datos: datosEsp2(placa2.metricas),
      eventos: eventosDe(placa2.ultimoEvento),
      avisos: avisosDe(snapshot, conexion2, obsoleto2, payload.demo, sinDatos2),
    },
  };
}
