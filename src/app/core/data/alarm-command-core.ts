/**
 * SENA CROWD INTELLIGENCE — MQTT.3.
 *
 * Núcleo puro del comando MQTT original del ESP32 2. No Angular, no Node, no red.
 * Los topics, campos y patrones físicos se derivan de ESP1.txt / ESP2.txt y de
 * `mqtt-contracts.ts`. No se inventa ningún topic ni se afirma confirmación
 * física: el firmware no publica ACK de buzzer/LED.
 */

import type { MqttComandoAlarmaEsp2, MqttEventoNombre } from './mqtt-contracts';

/**
 * Valor literal copiado de `mqtt-contracts.ts` (MQTT_TOPICS.ESP2_COMANDOS_ALARMA).
 * Se mantiene como literal para que el núcleo sea importable desde Node sin
 * dependencias de resolución de extensiones; las pruebas comprueban ambas fuentes.
 */
export const ALARM_COMMAND_TOPIC = 'sena/casanare/placa2/comandos/alarma';
const ALARM_COMMAND_QOS = 0 as const;

export type AlarmIncidente = MqttEventoNombre;
export type AlarmCommandKind = 'activacion' | 'desactivacion';
export type AlarmCommandFase = 'pendiente' | 'publicado' | 'error';
export type AlarmConfirmacionFisica = 'no_disponible';

export const ALARM_INCIDENTES: readonly AlarmIncidente[] = [
  'incendio',
  'sismo',
  'impacto',
  'simulacro',
  'emergencia',
] as const;

export const ALARM_CONFIRMACION_FISICA: AlarmConfirmacionFisica = 'no_disponible';

export type AlarmCommandErrorCode =
  | 'IDEMPOTENCIA_REQUERIDA'
  | 'INCIDENTE_NO_VALIDO'
  | 'PAYLOAD_NO_OBJETO'
  | 'ACTION_NO_BOOLEANO'
  | 'EVENTO_REQUERIDO'
  | 'ALCANCE_NO_VALIDO'
  | 'MOTIVO_NO_VALIDO'
  | 'FECHA_NO_VALIDA';

export class AlarmCommandError extends Error {
  readonly code: AlarmCommandErrorCode;

  constructor(code: AlarmCommandErrorCode, message: string) {
    super(message);
    this.name = 'AlarmCommandError';
    this.code = code;
  }
}

/** Patterns physically implemented by ESP32 2. Source: esp32/ESP2.txt. */
export interface Esp2AlarmPattern {
  readonly incidente: AlarmIncidente;
  readonly buzzerGpio: 16;
  readonly ledsVerdes: readonly number[];
  readonly encendidoMs: number;
  readonly apagadoMs: number;
  readonly oled: string;
  readonly notas: string;
  readonly firmwareReferencias: readonly string[];
}

/**
 * Verificado en firmware (ESP2.txt):
 * - ALARMA_PIN=16 y LED_VERDES={18,19,23} (L85-L88).
 * - Patrones en atenderPatron() (L1005-L1061).
 * - Simulacro silencia G16 a los 30 s pero mantiene alarmaActiva/OLED (L191, L973-L1003).
 * - apagarAlarma() no publica ACK (L330-L354).
 * - No existe GPIO declarado para "LED rojos" separado; el estado visual se asocia a alarmaActiva.
 */
export const ESP2_ALARM_PATTERNS: Readonly<Record<AlarmIncidente, Esp2AlarmPattern>> = {
  incendio: {
    incidente: 'incendio',
    buzzerGpio: 16,
    ledsVerdes: [18, 19, 23],
    encendidoMs: 150,
    apagadoMs: 150,
    oled: 'Muestra incendio; also activates local temperature logic.',
    notas: 'GPIO16 pulsa 150/150 ms; verdes rotan con cada pulso.',
    firmwareReferencias: ['ESP2.txt:85-88', 'ESP2.txt:1012-1015', 'ESP2.txt:1042-1060'],
  },
  sismo: {
    incidente: 'sismo',
    buzzerGpio: 16,
    ledsVerdes: [18, 19, 23],
    encendidoMs: 400,
    apagadoMs: 400,
    oled: 'Muestra sismo y origen del evento.',
    notas: 'GPIO16 pulsa 400/400 ms; verdes rotan con cada pulso.',
    firmwareReferencias: ['ESP2.txt:85-88', 'ESP2.txt:1017-1020', 'ESP2.txt:1042-1060'],
  },
  impacto: {
    incidente: 'impacto',
    buzzerGpio: 16,
    ledsVerdes: [18, 19, 23],
    encendidoMs: 100,
    apagadoMs: 100,
    oled: 'Muestra impacto y origen del evento.',
    notas: 'GPIO16 pulsa 100/100 ms; verdes rotan con cada pulso.',
    firmwareReferencias: ['ESP2.txt:85-88', 'ESP2.txt:1022-1026', 'ESP2.txt:1042-1060'],
  },
  simulacro: {
    incidente: 'simulacro',
    buzzerGpio: 16,
    ledsVerdes: [18, 19, 23],
    encendidoMs: 700,
    apagadoMs: 700,
    oled: 'Alerta visible hasta action:false, aunque el buzzer se silencie a los 30 s.',
    notas:
      'GPIO16 pulsa 700/700 ms durante 30 s; después sonidoHabilitado=false pero alarmaActiva/OLED siguen activos.',
    firmwareReferencias: ['ESP2.txt:191-192', 'ESP2.txt:973-1003', 'ESP2.txt:1028-1031'],
  },
  emergencia: {
    incidente: 'emergencia',
    buzzerGpio: 16,
    ledsVerdes: [18, 19, 23],
    encendidoMs: 250,
    apagadoMs: 250,
    oled: 'Muestra emergencia y origen del evento.',
    notas: 'GPIO16 pulsa 250/250 ms; verdes rotan con cada pulso.',
    firmwareReferencias: ['ESP2.txt:85-88', 'ESP2.txt:1033-1036', 'ESP2.txt:1042-1060'],
  },
};

export interface AlarmCommandDraft {
  readonly idempotencyKey: string;
  readonly kind: AlarmCommandKind;
  readonly incidente: AlarmIncidente | null;
  readonly topic: string;
  readonly qos: 0;
  readonly retain: false;
  readonly payload: MqttComandoAlarmaEsp2;
  readonly createdAt: string;
}

export interface AlarmCommandState {
  readonly draft: AlarmCommandDraft;
  readonly fase: AlarmCommandFase;
  readonly publicadoEn: string | null;
  readonly error: string | null;
  readonly confirmacionFisica: AlarmConfirmacionFisica;
  readonly mensaje: string;
}

export interface AlarmCommandValidation {
  readonly valido: boolean;
  readonly payload: MqttComandoAlarmaEsp2 | null;
  readonly code: AlarmCommandErrorCode | null;
  readonly reason: string;
}

function esIncidente(value: unknown): value is AlarmIncidente {
  return typeof value === 'string' && (ALARM_INCIDENTES as readonly string[]).includes(value);
}

function esFechaIso(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function validarIdempotencia(idempotencyKey: string): void {
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
    throw new AlarmCommandError('IDEMPOTENCIA_REQUERIDA', 'Se requiere una clave de idempotencia no vacía.');
  }
}

function validarFecha(createdAt: string): void {
  if (!esFechaIso(createdAt)) {
    throw new AlarmCommandError('FECHA_NO_VALIDA', 'La fecha de creación debe ser ISO8601 válida.');
  }
}

/** Construye `{"action":true,"evento":"..."}` exactamente como lo acepta ESP2. */
export function crearComandoActivacion(
  incidente: AlarmIncidente,
  idempotencyKey: string,
  createdAt: string = new Date().toISOString(),
): AlarmCommandDraft {
  validarIdempotencia(idempotencyKey);
  validarFecha(createdAt);

  if (!esIncidente(incidente)) {
    throw new AlarmCommandError('INCIDENTE_NO_VALIDO', `Incidente no reconocido por ESP2: ${String(incidente)}`);
  }

  return {
    idempotencyKey,
    kind: 'activacion',
    incidente,
    topic: ALARM_COMMAND_TOPIC,
    qos: ALARM_COMMAND_QOS,
    retain: false,
    payload: { action: true, evento: incidente },
    createdAt,
  };
}

export interface OpcionesComandoDesactivacion {
  readonly idempotencyKey: string;
  readonly alcance?: 'simulacro' | 'todas';
  readonly motivo?: 'falsa_alarma';
  readonly createdAt?: string;
}

/**
 * Construye `{"action":false,"alcance":"...","motivo":"..."}`.
 * ESP2 rechaza `motivo=falsa_alarma` si `alcance` no es `simulacro` (ESP2.txt:1151-1161).
 */
export function crearComandoDesactivacion(opciones: OpcionesComandoDesactivacion): AlarmCommandDraft {
  const { idempotencyKey, alcance = 'todas', motivo, createdAt = new Date().toISOString() } = opciones;

  validarIdempotencia(idempotencyKey);
  validarFecha(createdAt);

  if (alcance !== 'simulacro' && alcance !== 'todas') {
    throw new AlarmCommandError('ALCANCE_NO_VALIDO', 'alcance debe ser "simulacro" o "todas".');
  }

  if (motivo !== undefined && motivo !== 'falsa_alarma') {
    throw new AlarmCommandError('MOTIVO_NO_VALIDO', 'motivo solo admite "falsa_alarma".');
  }

  if (motivo === 'falsa_alarma' && alcance !== 'simulacro') {
    throw new AlarmCommandError('MOTIVO_NO_VALIDO', 'falsa_alarma requiere alcance="simulacro".');
  }

  const payload: MqttComandoAlarmaEsp2 = { action: false, alcance };
  if (motivo !== undefined) payload.motivo = motivo;

  return {
    idempotencyKey,
    kind: 'desactivacion',
    incidente: alcance === 'simulacro' ? 'simulacro' : null,
    topic: ALARM_COMMAND_TOPIC,
    qos: ALARM_COMMAND_QOS,
    retain: false,
    payload,
    createdAt,
  };
}

/** Cierre que ESP1 ya envía al ESP2 al hacer doble toque durante un simulacro. */
export function crearComandoCierreSimulacro(
  idempotencyKey: string,
  falsaAlarma = true,
  createdAt: string = new Date().toISOString(),
): AlarmCommandDraft {
  return crearComandoDesactivacion({
    idempotencyKey,
    alcance: 'simulacro',
    ...(falsaAlarma ? { motivo: 'falsa_alarma' as const } : {}),
    createdAt,
  });
}

/**
 * Validación defensiva que replica las reglas del parser de ESP2 (ESP2.txt:1106-1162).
 * No confía en que el productor haya usado los constructores de este módulo.
 */
export function validarComandoAlarma(value: unknown): AlarmCommandValidation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { valido: false, payload: null, code: 'PAYLOAD_NO_OBJETO', reason: 'El comando debe ser un objeto JSON.' };
  }

  const crudo = value as Record<string, unknown>;

  if (typeof crudo['action'] !== 'boolean') {
    return { valido: false, payload: null, code: 'ACTION_NO_BOOLEANO', reason: 'action debe ser booleano.' };
  }

  if (crudo['action'] === true) {
    const evento = crudo['evento'];
    if (typeof evento !== 'string' || evento.length === 0) {
      return { valido: false, payload: null, code: 'EVENTO_REQUERIDO', reason: 'action=true requiere evento.' };
    }
    if (!esIncidente(evento)) {
      return { valido: false, payload: null, code: 'INCIDENTE_NO_VALIDO', reason: `Evento no reconocido: ${evento}` };
    }
    return { valido: true, payload: { action: true, evento }, code: null, reason: '' };
  }

  const alcance = crudo['alcance'] === undefined ? 'todas' : crudo['alcance'];
  if (alcance !== 'simulacro' && alcance !== 'todas') {
    return {
      valido: false,
      payload: null,
      code: 'ALCANCE_NO_VALIDO',
      reason: 'alcance debe ser "simulacro" o "todas".',
    };
  }

  const motivo = crudo['motivo'];
  if (motivo !== undefined && motivo !== 'falsa_alarma') {
    return { valido: false, payload: null, code: 'MOTIVO_NO_VALIDO', reason: 'motivo solo admite "falsa_alarma".' };
  }
  if (motivo === 'falsa_alarma' && alcance !== 'simulacro') {
    return {
      valido: false,
      payload: null,
      code: 'MOTIVO_NO_VALIDO',
      reason: 'falsa_alarma requiere alcance="simulacro".',
    };
  }

  const payload: MqttComandoAlarmaEsp2 = { action: false, alcance };
  if (motivo === 'falsa_alarma') payload.motivo = 'falsa_alarma';

  return { valido: true, payload, code: null, reason: '' };
}

/** Serialización canónica: el firmware solo necesita action/evento/alcance/motivo. */
export function serializarComandoAlarma(draft: AlarmCommandDraft): string {
  return JSON.stringify(draft.payload);
}

export function estadoPendiente(draft: AlarmCommandDraft): AlarmCommandState {
  return {
    draft,
    fase: 'pendiente',
    publicadoEn: null,
    error: null,
    confirmacionFisica: ALARM_CONFIRMACION_FISICA,
    mensaje: 'Comando preparado; pendiente de publicación.',
  };
}

export function estadoPublicado(draft: AlarmCommandDraft, publicadoEn: string): AlarmCommandState {
  return {
    draft,
    fase: 'publicado',
    publicadoEn,
    error: null,
    confirmacionFisica: ALARM_CONFIRMACION_FISICA,
    mensaje: 'Comando entregado al transporte MQTT. El firmware no publica confirmación física.',
  };
}

export function estadoError(draft: AlarmCommandDraft, error: string): AlarmCommandState {
  return {
    draft,
    fase: 'error',
    publicadoEn: null,
    error,
    confirmacionFisica: ALARM_CONFIRMACION_FISICA,
    mensaje: `No se pudo publicar el comando: ${error}`,
  };
}

/** Vista explícita para la UI; nunca inventa estado físico ni estado Supabase. */
export interface AlarmCommandView {
  readonly tipoAlarma: AlarmIncidente | 'desactivacion';
  readonly origen: 'cliente';
  readonly estadoSupabase: 'no_consultado';
  readonly estadoComandoMqtt: AlarmCommandFase;
  readonly conectividadEsp2: 'sin_dato';
  readonly estadoFisico: AlarmConfirmacionFisica;
  readonly ultimaActualizacion: string;
}

export function vistaComandoAlarma(
  state: AlarmCommandState,
  ahora: string = new Date().toISOString(),
): AlarmCommandView {
  return {
    tipoAlarma: state.draft.incidente ?? 'desactivacion',
    origen: 'cliente',
    estadoSupabase: 'no_consultado',
    estadoComandoMqtt: state.fase,
    conectividadEsp2: 'sin_dato',
    estadoFisico: ALARM_CONFIRMACION_FISICA,
    ultimaActualizacion: ahora,
  };
}
