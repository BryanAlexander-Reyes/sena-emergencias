/**
 * SENA CROWD INTELLIGENCE — MQTT.3B.
 *
 * Contrato ampliado del incidente de alarma manual. Núcleo puro: sin Angular,
 * sin Node, sin red y sin Supabase.
 *
 * Regla aprobada: `tipo` conserva su significado y su valor `'alarma_manual'`.
 * Se AGREGAN dos campos independientes:
 *   - `evento`: incendio | sismo | impacto | simulacro | emergencia
 *   - `origen`: cliente | hardware
 *
 * Los registros creados antes de MQTT.3B no tenían esos campos. No se inventa
 * un valor para `evento`: se expone como `null` y se marca `eventoReportado=false`.
 * `origen` de esos registros es `cliente` por definición (los creaba un usuario).
 */

export const ALARM_INCIDENTES = ['incendio', 'sismo', 'impacto', 'simulacro', 'emergencia'] as const;
export type AlarmaIncidente = (typeof ALARM_INCIDENTES)[number];

export const ALARM_ORIGENES = ['cliente', 'hardware'] as const;
export type AlarmaOrigen = (typeof ALARM_ORIGENES)[number];

/**
 * MQTT.4 / C2: lista canónica de códigos. La usa el contrato, el endpoint Node,
 * los diffs protegidos y las pruebas. No se inventan códigos por capa.
 */
export const ALARM_ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'ROL_NO_AUTORIZADO',
  'METHOD_NOT_ALLOWED',
  'INVALID_BODY',
  'EVENTO_NO_SELECCIONADO',
  'EVENTO_NO_VALIDO',
  'ORIGEN_NO_VALIDO',
  'TIPO_NO_VALIDO',
  'USUARIO_REQUERIDO',
  'IDENTIDAD_HARDWARE_INVALIDA',
  'IDEMPOTENCIA_REQUERIDA',
  'IDEMPOTENCIA_NO_UUID',
  'IDEMPOTENCIA_DUPLICADA',
  'EVENTO_ID_INVALIDO',
  'IDEMPOTENCY_CONFLICT',
  'ACTIVE_ALARM_EXISTS',
  'RPC_NO_DISPONIBLE',
  'TOPICO_NO_PERMITIDO',
  'OPCIONES_MQTT_INVALIDAS',
  'PAYLOAD_NO_VALIDO',
  'PAYLOAD_NO_OBJETO',
  'ACTION_NO_BOOLEANO',
  'EVENTO_REQUERIDO',
  'INCIDENTE_NO_VALIDO',
  'ALCANCE_NO_VALIDO',
  'MOTIVO_NO_VALIDO',
  'FECHA_NO_VALIDA',
  'MQTT_NO_CONECTADO',
  'MQTT_NO_DISPONIBLE',
  'DRAFT_INVALIDO',
  'QOS_RETAIN_INVALIDOS',
  'FALLO_TRANSPORTE',
  'SIN_TRANSPORTE',
  'PUBLICADOR_NO_CONFIGURADO',
  'MQTT_PUBLISH_PENDIENTE',
  'ENDPOINT_NO_CONFIGURADO',
  'ENDPOINT_NO_SEGURO',
  'SUPABASE_NOT_CONFIGURED',
  'INVALID_ALARM_ID',
  'INVALID_ALARM_RESPONSE',
  'NETWORK_DOWN',
  'COMANDO_INVALIDO',
] as const;

export type AlarmErrorCode = (typeof ALARM_ERROR_CODES)[number];

export function esCodigoErrorAlarma(value: unknown): value is AlarmErrorCode {
  return typeof value === 'string' && (ALARM_ERROR_CODES as readonly string[]).includes(value);
}

/** Valor histórico: NO se renombra ni se cambia su significado. */
export const TIPO_ALARMA_MANUAL = 'alarma_manual' as const;

/** Textos aprobados de la alarma manual; se conservan literalmente. */
export const TITULO_ALARMA_MANUAL = '⚠️ PRECAUCIÓN' as const;
export const MENSAJE_ALARMA_MANUAL =
  'Diríjase con calma a la zona segura y siga las indicaciones del personal autorizado.' as const;
export const SEVERIDAD_ALARMA_MANUAL = 'critical' as const;

/** Longitud máxima de `evento_id` según el contrato de ESP1. */
export const EVENTO_ID_MAX_LENGTH = 63;

/** Forma histórica devuelta por `consultar-alarma-activa` (contrato que consume Ionic). */
export interface IncidenteAlarmaHistorico {
  readonly id: string;
  readonly tipo: string;
  readonly titulo: string;
  readonly mensaje: string;
  readonly severidad: string;
  readonly fecha_activacion: string;
  readonly estado?: 'activa' | 'finalizada';
  readonly fecha_finalizacion?: string | null;
}

/** Forma ampliada. Los campos nuevos son aditivos. */
export interface IncidenteAlarma extends IncidenteAlarmaHistorico {
  readonly evento: AlarmaIncidente | null;
  readonly origen: AlarmaOrigen;
  /** false cuando el registro es anterior a MQTT.3B y no declaró `evento`. */
  readonly eventoReportado: boolean;
}

/** Cuerpo propuesto para la Edge Function de activación. */
export interface PropuestaActivacionAlarma {
  readonly clave_idempotencia: string;
  readonly tipo: typeof TIPO_ALARMA_MANUAL;
  readonly evento: AlarmaIncidente;
  readonly origen: AlarmaOrigen;
  readonly titulo: typeof TITULO_ALARMA_MANUAL;
  readonly mensaje: typeof MENSAJE_ALARMA_MANUAL;
  readonly severidad: typeof SEVERIDAD_ALARMA_MANUAL;
}

export interface OpcionesPropuestaActivacion {
  readonly claveIdempotencia: string;
  readonly evento: AlarmaIncidente;
  readonly origen: AlarmaOrigen;
}

export interface OpcionesPropuestaHardware {
  readonly eventoId: string;
  readonly evento: AlarmaIncidente;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function esRegistro(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function esAlarmaIncidente(value: unknown): value is AlarmaIncidente {
  return typeof value === 'string' && (ALARM_INCIDENTES as readonly string[]).includes(value);
}

export function esAlarmaOrigen(value: unknown): value is AlarmaOrigen {
  return typeof value === 'string' && (ALARM_ORIGENES as readonly string[]).includes(value);
}

/**
 * MQTT.4 / C3: la clave del incidente pertenece a la alarma (UUID humano o
 * `evento_id` de ESP1). NO es la clave del comando MQTT publicado al ESP2.
 */
export function validarClaveIncidente(
  clave: unknown,
  origen: AlarmaOrigen,
): Extract<AlarmErrorCode, 'IDEMPOTENCIA_REQUERIDA' | 'IDEMPOTENCIA_NO_UUID' | 'EVENTO_ID_INVALIDO'> | null {
  if (typeof clave !== 'string' || clave.trim().length === 0) return 'IDEMPOTENCIA_REQUERIDA';
  if (origen === 'cliente') return UUID_PATTERN.test(clave) ? null : 'IDEMPOTENCIA_NO_UUID';
  return clave.length <= EVENTO_ID_MAX_LENGTH ? null : 'EVENTO_ID_INVALIDO';
}

export interface SolicitudRpcActivacionAlarma {
  readonly tipo: unknown;
  readonly evento: unknown;
  readonly origen: unknown;
  readonly titulo: unknown;
  readonly mensaje: unknown;
  readonly severidad: unknown;
  readonly activadoPor: unknown;
  readonly claveIdempotencia: unknown;
  /** Flag de despliegue C4; cuando es true deja de aceptar clientes antiguos. */
  readonly requiereEvento?: boolean;
}

export type ResultadoValidacionRpc =
  | { readonly valida: true }
  | { readonly valida: false; readonly code: AlarmErrorCode };

/**
 * MQTT.4 / C10: validación completa que debe repetir la RPC protegida antes de
 * insertar. No ejecuta SQL y no asume nombres de restricciones (C8).
 */
export function validarSolicitudRpcActivacion(solicitud: SolicitudRpcActivacionAlarma): ResultadoValidacionRpc {
  if (solicitud.tipo !== TIPO_ALARMA_MANUAL) return { valida: false, code: 'TIPO_NO_VALIDO' };
  if (
    solicitud.titulo !== TITULO_ALARMA_MANUAL ||
    solicitud.mensaje !== MENSAJE_ALARMA_MANUAL ||
    solicitud.severidad !== SEVERIDAD_ALARMA_MANUAL
  ) {
    return { valida: false, code: 'INVALID_BODY' };
  }
  if (!esAlarmaOrigen(solicitud.origen)) return { valida: false, code: 'ORIGEN_NO_VALIDO' };

  const eventoAusente = solicitud.evento === undefined || solicitud.evento === null;
  if (eventoAusente) {
    // Un hardware nunca tiene cliente legacy: su evento siempre es explícito.
    if (solicitud.requiereEvento === true || solicitud.origen === 'hardware') {
      return { valida: false, code: 'EVENTO_NO_SELECCIONADO' };
    }
  } else if (!esAlarmaIncidente(solicitud.evento)) {
    return { valida: false, code: 'EVENTO_NO_VALIDO' };
  }

  const claveError = validarClaveIncidente(solicitud.claveIdempotencia, solicitud.origen);
  if (claveError !== null) return { valida: false, code: claveError };

  if (solicitud.origen === 'cliente') {
    if (typeof solicitud.activadoPor !== 'string' || !UUID_PATTERN.test(solicitud.activadoPor)) {
      return { valida: false, code: 'USUARIO_REQUERIDO' };
    }
  } else if (solicitud.activadoPor !== undefined && solicitud.activadoPor !== null) {
    return { valida: false, code: 'IDENTIDAD_HARDWARE_INVALIDA' };
  }

  return { valida: true };
}

function construirPropuesta(
  claveIdempotencia: string,
  evento: AlarmaIncidente,
  origen: AlarmaOrigen,
): PropuestaActivacionAlarma {
  return {
    clave_idempotencia: claveIdempotencia,
    tipo: TIPO_ALARMA_MANUAL,
    evento,
    origen,
    titulo: TITULO_ALARMA_MANUAL,
    mensaje: MENSAJE_ALARMA_MANUAL,
    severidad: SEVERIDAD_ALARMA_MANUAL,
  };
}

/** Cliente humano: mantiene el requisito UUID de `activar-alarma-manual`. */
export function crearPropuestaActivacion(options: OpcionesPropuestaActivacion): PropuestaActivacionAlarma {
  if (!UUID_PATTERN.test(options.claveIdempotencia)) {
    throw new Error('IDEMPOTENCIA_NO_UUID');
  }
  if (!esAlarmaIncidente(options.evento)) {
    throw new Error('EVENTO_NO_VALIDO');
  }
  if (!esAlarmaOrigen(options.origen)) {
    throw new Error('ORIGEN_NO_VALIDO');
  }
  return construirPropuesta(options.claveIdempotencia, options.evento, options.origen);
}

/**
 * Hardware: la deduplicación usa el `evento_id` original de ESP1, no un UUID
 * humano. No se inventa ni se transforma una identidad de usuario.
 */
export function crearPropuestaActivacionHardware(options: OpcionesPropuestaHardware): PropuestaActivacionAlarma {
  if (
    typeof options.eventoId !== 'string' ||
    options.eventoId.trim().length === 0 ||
    options.eventoId.length > EVENTO_ID_MAX_LENGTH
  ) {
    throw new Error('EVENTO_ID_INVALIDO');
  }
  if (!esAlarmaIncidente(options.evento)) {
    throw new Error('EVENTO_NO_VALIDO');
  }
  return construirPropuesta(options.eventoId, options.evento, 'hardware');
}

/**
 * Normaliza una respuesta real (con o sin campos nuevos) sin mutarla.
 * Un `evento` ausente nunca se rellena con un valor inventado.
 */
export function normalizarIncidenteAlarma(value: unknown): IncidenteAlarma | null {
  if (!esRegistro(value)) return null;

  const id = value['id'];
  const tipo = value['tipo'];
  const titulo = value['titulo'];
  const mensaje = value['mensaje'];
  const severidad = value['severidad'];
  const fechaActivacion = value['fecha_activacion'];

  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    typeof tipo !== 'string' ||
    tipo.length === 0 ||
    typeof titulo !== 'string' ||
    typeof mensaje !== 'string' ||
    typeof severidad !== 'string' ||
    typeof fechaActivacion !== 'string' ||
    Number.isNaN(Date.parse(fechaActivacion))
  ) {
    return null;
  }

  const estado = value['estado'];
  const fechaFinalizacion = value['fecha_finalizacion'];
  const eventoCrudo = value['evento'];
  const origenCrudo = value['origen'];
  const eventoReportado = esAlarmaIncidente(eventoCrudo);

  return {
    id,
    tipo,
    titulo,
    mensaje,
    severidad,
    fecha_activacion: fechaActivacion,
    ...(estado === 'activa' || estado === 'finalizada' ? { estado } : {}),
    ...(typeof fechaFinalizacion === 'string' || fechaFinalizacion === null
      ? { fecha_finalizacion: fechaFinalizacion }
      : {}),
    evento: eventoReportado ? eventoCrudo : null,
    origen: esAlarmaOrigen(origenCrudo) ? origenCrudo : 'cliente',
    eventoReportado,
  };
}

/* -------------------------------------------------------------------------- */
/* MQTT.4 — Matriz definitiva del MVP.                                         */
/* Administrador e Instructor son idénticos SOLO en permisos sobre alarmas.    */
/* La administración de usuarios y demás funciones admin siguen siendo solo    */
/* del Administrador y se resuelven fuera de este contrato.                    */
/* -------------------------------------------------------------------------- */

export type ActorRol = 'administrador' | 'instructor' | 'aprendiz';
export const ACTORES: readonly ActorRol[] = ['administrador', 'instructor', 'aprendiz'];

/** Identidad de dispositivo: NUNCA se mapea a un rol humano. */
export const IDENTIDAD_DISPOSITIVO = 'dispositivo' as const;

/** Roles humanos autorizados a activar, finalizar y enviar comandos MQTT. */
export const ROLES_OPERADORES_ALARMA: readonly ActorRol[] = ['administrador', 'instructor'];

/** Los cinco eventos están disponibles para Admin e Instructor. */
export const EVENTOS_OPERADORES_ALARMA: readonly AlarmaIncidente[] = ALARM_INCIDENTES;

export function esRolOperadorAlarma(rol: ActorRol): boolean {
  return ROLES_OPERADORES_ALARMA.includes(rol);
}

export function eventosPermitidosParaRol(rol: ActorRol): readonly AlarmaIncidente[] {
  return esRolOperadorAlarma(rol) ? EVENTOS_OPERADORES_ALARMA : [];
}

export function puedeActivar(rol: ActorRol, evento: AlarmaIncidente): boolean {
  return esRolOperadorAlarma(rol) && esAlarmaIncidente(evento);
}

export function puedeFinalizar(rol: ActorRol, evento: AlarmaIncidente | null): boolean {
  return esRolOperadorAlarma(rol) && (evento === null || esAlarmaIncidente(evento));
}

/** Admin e Instructor envían comandos; Aprendiz solo consulta y recibe FCM. */
export function puedeEnviarComandoMqtt(rol: ActorRol): boolean {
  return esRolOperadorAlarma(rol);
}

/**
 * Recepción FCM: identidad y token válidos. La existencia del rol en la BD no
 * se asume; el backend debe verificarla antes de considerar autorizado al rol.
 */
export function puedeRecibirFcm(rol: ActorRol, identidadValida: boolean, tokenValido: boolean): boolean {
  return ACTORES.includes(rol) && identidadValida && tokenValido;
}

export function puedeConsultar(rol: ActorRol): boolean {
  return ACTORES.includes(rol);
}

export interface DecisionEventoHardware {
  readonly permitido: boolean;
  readonly origen: AlarmaOrigen;
  readonly identidad: typeof IDENTIDAD_DISPOSITIVO;
  readonly requiereUsuarioHumano: false;
  readonly code: 'EVENTO_HARDWARE_ACEPTADO' | 'EVENTO_NO_VALIDO';
}

/** Los eventos automáticos usan su propia identidad; no falsifican sesión humana. */
export function autorizarEventoHardware(evento: AlarmaIncidente): DecisionEventoHardware {
  const permitido = esAlarmaIncidente(evento);
  return {
    permitido,
    origen: 'hardware',
    identidad: IDENTIDAD_DISPOSITIVO,
    requiereUsuarioHumano: false,
    code: permitido ? 'EVENTO_HARDWARE_ACEPTADO' : 'EVENTO_NO_VALIDO',
  };
}
