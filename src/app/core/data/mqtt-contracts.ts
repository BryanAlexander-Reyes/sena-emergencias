/**
 * Contratos MQTT reales extraídos de ESP1.txt y ESP2.txt (solo lectura de firmware).
 *
 * REGLAS:
 * - No inventar topics.
 * - No renombrar campos.
 * - No asumir que un evento equivale a alarma confirmada.
 * - No interpretar comando enviado como confirmación física.
 * - Telemetría solo en memoria; no persistir en Supabase.
 *
 * Campos no documentados explícitamente en firmware se marcan como PENDIENTE_VERIFICACION.
 */

export const MQTT_TOPICS = {
  METRICAS: 'sena/casanare/metricas',
  ESP1_EVENTOS_INCENDIO: 'sena/casanare/placa1/eventos/incendio',
  ESP1_EVENTOS_SISMO: 'sena/casanare/placa1/eventos/sismo',
  ESP1_EVENTOS_IMPACTO: 'sena/casanare/placa1/eventos/impacto',
  ESP1_EVENTOS_SIMULACRO: 'sena/casanare/placa1/eventos/simulacro',
  ESP1_EVENTOS_EMERGENCIA: 'sena/casanare/placa1/eventos/emergencia',
  ESP1_EVENTOS_WILDCARD: 'sena/casanare/placa1/eventos/+',
  ESP2_EVENTOS_INCENDIO: 'sena/casanare/placa2/eventos/incendio',
  ESP2_COMANDOS_ALARMA: 'sena/casanare/placa2/comandos/alarma',
  ESP1_ESTADO_CONEXION: 'sena/casanare/placa1/estado/conexion',
  ESP2_ESTADO_CONEXION: 'sena/casanare/placa2/estado/conexion',
} as const;

export type MqttTopic = (typeof MQTT_TOPICS)[keyof typeof MQTT_TOPICS];

export const MQTT_QOS = {
  /** ESP1/ESP2 publican métricas/eventos con publish(..., false) => QoS 0, no retain. */
  PUBLICACION_DEFAULT: 0,
  /** ESP1 suscribe incendio remoto QoS 1; ESP2 suscribe eventos/comandos QoS 0. */
  ESP1_SUSCRIPCION_INCENDIO_REMOTO: 1,
  ESP2_SUSCRIPCION_EVENTOS_REMOTOS: 0,
  ESP2_SUSCRIPCION_COMANDOS: 0,
  /** LWT configurado con QoS 1, retain true. */
  LWT: 1,
} as const;

export type MqttPlaca = 'placa1' | 'placa2';
export type MqttSala = 'riesgo_bajo' | 'riesgo_alto';
export type MqttTipoMensaje = 'metricas' | 'evento';
export type MqttEventoNombre = 'incendio' | 'sismo' | 'impacto' | 'simulacro' | 'emergencia';
export type MqttEstadoSensorTemperatura = 'ok' | 'fallo' | 'sin_datos' | 'esperando';
export type MqttEstadoUltrasonico = 'esperando' | 'ok' | 'fuera_de_rango' | 'sin_eco' | 'echo_high';
export type MqttCondicionAcelerometro = 'sin_datos' | 'impacto' | 'posible_sismo' | 'observacion' | 'sin_evento';
export type MqttComandoAlcance = 'simulacro' | 'todas';
export type MqttComandoMotivo = 'falsa_alarma';

export interface MqttCabeceraBase {
  version: 1;
  placa: MqttPlaca;
  sala: MqttSala;
  sesion: string;
  secuencia: number;
  tipo: MqttTipoMensaje;
  tiempo_activo_ms: number;
  /** ISO8601 UTC "YYYY-MM-DDTHH:MM:SSZ" o null si NTP no válido. */
  fecha: string | null;
}

export interface MqttEventoIncendioEvidencia {
  origen: 'temperatura_alta';
  temperatura_c: number | null;
  umbral_c: number;
  rearme_inferior_a_c: number;
}

export interface MqttEventoMovimientoEvidencia {
  pico_m_s2: number;
  rms_m_s2: number;
  actividad_porcentaje: number;
  factor_cresta: number;
  ventana_valida: boolean;
}

export interface MqttEventoManualEvidencia {
  origen: 'touch_o_control_local';
}

export type MqttEventoEvidencia =
  MqttEventoIncendioEvidencia | MqttEventoMovimientoEvidencia | MqttEventoManualEvidencia;

export interface MqttEventoMensaje extends MqttCabeceraBase {
  tipo: 'evento';
  evento_id: string;
  evento: MqttEventoNombre;
  /** true = detección activa/iniciada; false = detección finalizada. NO equivale a alarma confirmada/cerrada oficialmente. */
  estado: boolean;
  evidencia: MqttEventoEvidencia;
}

export interface MqttTemperaturaEsp1 {
  valida: boolean;
  fallos_consecutivos: number;
  estado_sensor: Exclude<MqttEstadoSensorTemperatura, 'esperando'>;
  deteccion_incendio_activa: boolean;
  valor_c: number | null;
  humedad_porcentaje: number | null;
}

export interface MqttVector3 {
  x: number;
  y: number;
  z: number;
}

export interface MqttAcelerometroEsp1 {
  valido: boolean;
  identidad: number;
  ventana_valida: boolean;
  frecuencia_muestreo_hz: number;
  aceleracion_m_s2: MqttVector3 | null;
  giro_grados_s: MqttVector3 | null;
  temperatura_interna_c: number | null;
  pico_m_s2: number | null;
  rms_m_s2: number | null;
  actividad_porcentaje: number | null;
  factor_cresta: number | null;
  /** Presente solo cuando ventana_valida=true. */
  saturacion?: boolean;
  condicion: MqttCondicionAcelerometro;
}

export interface MqttUltrasonicoEsp1 {
  valido: boolean;
  estado: MqttEstadoUltrasonico | string; // ESP1 asigna estadoHC string; valores observados documentados.
  distancia_cm: number | null;
}

export interface MqttTouchEsp1 {
  activo: boolean;
}

export interface MqttEventosDetectandoEsp1 {
  incendio: boolean;
  sismo: boolean;
  impacto: boolean;
  simulacro: boolean;
  emergencia: boolean;
}

export interface MqttMetricasEsp1 extends MqttCabeceraBase {
  tipo: 'metricas';
  placa: 'placa1';
  sala: 'riesgo_bajo';
  temperatura: MqttTemperaturaEsp1;
  acelerometro: MqttAcelerometroEsp1;
  ultrasonico: MqttUltrasonicoEsp1;
  touch: MqttTouchEsp1;
  alerta_retenida: boolean;
  incendio_remoto_activo: boolean;
  eventos: MqttEventosDetectandoEsp1;
}

export interface MqttTemperaturaEsp2 {
  valida: boolean;
  estado_sensor: MqttEstadoSensorTemperatura;
  fallos_consecutivos: number;
  deteccion_incendio_activa: boolean;
  valor_c: number | null;
}

export interface MqttIrEsp2 {
  entrada: boolean;
  salida: boolean;
  detecciones_entrada: number;
  detecciones_salida: number;
}

export interface MqttMetricasEsp2 extends MqttCabeceraBase {
  tipo: 'metricas';
  placa: 'placa2';
  sala: 'riesgo_alto';
  temperatura: MqttTemperaturaEsp2;
  ir: MqttIrEsp2;
}

export type MqttMetricasMensaje = MqttMetricasEsp1 | MqttMetricasEsp2;

export interface MqttComandoAlarmaEsp2 {
  action: boolean;
  /** Requerido cuando action=true. */
  evento?: MqttEventoNombre;
  /** action=false: "simulacro" | "todas", default "todas" en ESP2. */
  alcance?: MqttComandoAlcance;
  /** action=false: "falsa_alarma" solo válido con alcance="simulacro". */
  motivo?: MqttComandoMotivo | string;
}

export interface MqttEstadoConexion {
  online: boolean;
}

/** Envelope recibido por el bridge/cliente; agrega metadatos de transporte, no del firmware. */
export interface MqttEnvelope<TPayload = unknown> {
  topic: string;
  payload: TPayload;
  receivedAt: string; // ISO8601
  /** QoS/retain observados en firmware cuando se conoce; puede ser PENDIENTE_VERIFICACION en broker real. */
  transport: {
    qosObservado?: number;
    retainObservado?: boolean;
  };
}

export interface MqttTelemetriaSnapshot {
  placa1: {
    conexion: MqttEstadoConexion | null;
    metricas: MqttMetricasEsp1 | null;
    ultimoEvento: MqttEventoMensaje | null;
    updatedAt: string | null;
  };
  placa2: {
    conexion: MqttEstadoConexion | null;
    metricas: MqttMetricasEsp2 | null;
    ultimoEvento: MqttEventoMensaje | null;
    updatedAt: string | null;
  };
  bridge: {
    connected: boolean;
    lastError: string | null;
    updatedAt: string | null;
  };
}

export const MQTT_CONTRACT_METADATA = {
  sourceFiles: ['ESP1.txt', 'ESP2.txt'],
  extractedAt: '2026-11-23',
  topicsInventados: false,
  camposRenombrados: false,
  notas: [
    'ESP1 publica comando a placa2 con action:false; ESP2 acepta action:true|false.',
    'ESP2 no publica confirmación física de buzzer/alarma: comando enviado != confirmación física.',
    'evento.estado=false indica detección finalizada, no cierre oficial de emergencia.',
    'Telemetría debe mantenerse en memoria; no persistir en Supabase.',
    'Frecuencia métricas ESP1: forzada; 1s con alerta; minuto de época con NTP sin alerta; 60s fallback sin NTP.',
    'Frecuencia métricas ESP2: 1s con incendio activo; minuto de época con NTP normal; 60s fallback sin NTP; DHT cada 2500ms.',
    'ESP1 cola métricas tamaño 1 overwrite; eventos 16; remotos 8. ESP2 métricas 1 overwrite; eventos 8; órdenes 8.',
  ],
} as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isMqttEstadoConexion(value: unknown): value is MqttEstadoConexion {
  return isRecord(value) && typeof value['online'] === 'boolean';
}

export function isMqttCabeceraBase(value: unknown): value is MqttCabeceraBase {
  return (
    isRecord(value) &&
    value['version'] === 1 &&
    (value['placa'] === 'placa1' || value['placa'] === 'placa2') &&
    (value['sala'] === 'riesgo_bajo' || value['sala'] === 'riesgo_alto') &&
    typeof value['sesion'] === 'string' &&
    typeof value['secuencia'] === 'number' &&
    (value['tipo'] === 'metricas' || value['tipo'] === 'evento') &&
    typeof value['tiempo_activo_ms'] === 'number' &&
    (typeof value['fecha'] === 'string' || value['fecha'] === null)
  );
}

export function isMqttEventoMensaje(value: unknown): value is MqttEventoMensaje {
  if (!isMqttCabeceraBase(value) || value.tipo !== 'evento') return false;

  const crudo = value as unknown as Record<string, unknown>;
  return (
    typeof crudo['evento_id'] === 'string' &&
    typeof crudo['evento'] === 'string' &&
    typeof crudo['estado'] === 'boolean' &&
    isRecord(crudo['evidencia'])
  );
}

export function isMqttMetricasEsp1(value: unknown): value is MqttMetricasEsp1 {
  if (!isMqttCabeceraBase(value) || value.tipo !== 'metricas' || value.placa !== 'placa1') return false;

  const crudo = value as unknown as Record<string, unknown>;
  return (
    isRecord(crudo['temperatura']) &&
    isRecord(crudo['acelerometro']) &&
    isRecord(crudo['ultrasonico']) &&
    isRecord(crudo['touch']) &&
    isRecord(crudo['eventos'])
  );
}

export function isMqttMetricasEsp2(value: unknown): value is MqttMetricasEsp2 {
  if (!isMqttCabeceraBase(value) || value.tipo !== 'metricas' || value.placa !== 'placa2') return false;

  const crudo = value as unknown as Record<string, unknown>;
  return isRecord(crudo['temperatura']) && isRecord(crudo['ir']);
}
