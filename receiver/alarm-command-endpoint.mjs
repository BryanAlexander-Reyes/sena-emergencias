/**
 * MQTT.4 — Endpoint Node de comandos de alarma (SOLO CONTRATO / PRUEBAS LOCALES).
 *
 * - No conecta a EMQX: `publicar` se inyecta y en pruebas es un fake en memoria.
 * - Reutiliza `AlarmCommandGateway` y el publicador MQTT.3 existente.
 * - Valida JWT/rol en servidor (inyectado), aplica la matriz MQTT.4 y códigos C2.
 * - Separa idempotencia de comando MQTT de idempotencia de incidente (C3).
 * - Registra métrica de activaciones sin evento (C5) sin guardar secretos.
 */

import { createHash } from 'node:crypto';

import {
  ALARM_COMMAND_TOPIC,
  crearComandoActivacion,
  crearComandoDesactivacion,
  validarComandoAlarma,
} from '../src/app/core/data/alarm-command-core.ts';
import {
  ACTORES,
  esAlarmaIncidente,
  esAlarmaOrigen,
  esCodigoErrorAlarma,
  esRolOperadorAlarma,
  MENSAJE_ALARMA_MANUAL,
  SEVERIDAD_ALARMA_MANUAL,
  TIPO_ALARMA_MANUAL,
  TITULO_ALARMA_MANUAL,
  validarClaveIncidente,
} from '../src/app/core/data/alarm-incident-contract.ts';

import { AlarmCommandGateway } from './alarm-command-gateway.mjs';

const ESTADOS_HTTP = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  ROL_NO_AUTORIZADO: 403,
  METHOD_NOT_ALLOWED: 405,
  INVALID_BODY: 400,
  EVENTO_NO_SELECCIONADO: 400,
  EVENTO_NO_VALIDO: 400,
  ORIGEN_NO_VALIDO: 400,
  IDEMPOTENCIA_REQUERIDA: 400,
  IDEMPOTENCIA_NO_UUID: 400,
  EVENTO_ID_INVALIDO: 400,
  INVALID_ALARM_ID: 400,
  TOPICO_NO_PERMITIDO: 400,
  OPCIONES_MQTT_INVALIDAS: 400,
  PAYLOAD_NO_VALIDO: 400,
  IDEMPOTENCY_CONFLICT: 409,
  ACTIVE_ALARM_EXISTS: 409,
  RPC_NO_DISPONIBLE: 503,
  MQTT_NO_CONECTADO: 503,
  MQTT_NO_DISPONIBLE: 503,
  SIN_TRANSPORTE: 503,
  FALLO_TRANSPORTE: 503,
};

function estadoHttp(code) {
  return ESTADOS_HTTP[code] ?? 400;
}

function huella(valor) {
  return createHash('sha256').update(JSON.stringify(valor ?? null)).digest('hex').slice(0, 16);
}

export function extraerBearer(header) {
  if (typeof header !== 'string') return null;
  const coincidencia = /^Bearer\s+(.+)$/i.exec(header.trim());
  return coincidencia?.[1]?.trim() || null;
}

/** Dedupe en memoria: suficiente para pruebas, NO duradero en producción. */
export function crearDedupeEnMemoria() {
  const registros = new Map();

  return {
    conflicto(clave, firma) {
      const previo = registros.get(clave);
      return previo !== undefined && previo.firma !== firma;
    },
    yaPublicado(clave) {
      return registros.has(clave);
    },
    registrar(clave, firma, en) {
      registros.set(clave, { firma, en });
    },
    tamano() {
      return registros.size;
    },
  };
}

/** Métricas locales sin secretos; C5. */
export function crearMetricasMqtt4() {
  const contadores = new Map();

  return {
    registrar(code, contexto = {}) {
      const llave = esCodigoErrorAlarma(code) ? code : 'INVALID_BODY';
      const entrada = { code: llave, contexto, total: (contadores.get(llave)?.total ?? 0) + 1 };
      contadores.set(llave, entrada);
      return entrada;
    },
    conteo(code) {
      return contadores.get(code)?.total ?? 0;
    },
    instantanea() {
      return Object.fromEntries([...contadores].map(([code, entrada]) => [code, { ...entrada }]));
    },
  };
}

/**
 * @param {{
 *   validarJwt: (jwt: string) => Promise<{activo: boolean, rol: string, id?: string, modulo?: string}|null>|object|null,
 *   publicar: (mensaje: {topic: string, payload: string, qos: 0, retain: false}) => Promise<{ok: boolean}|void>,
 *   activar?: (solicitud: object) => Promise<{ok: boolean, status?: number, error?: string, alarma?: object}>,
 *   finalizar?: (solicitud: object) => Promise<{ok: boolean, status?: number, error?: string, alarma?: object}>,
 *   dedupe?: object,
 *   metricas?: object,
 *   registrar?: (entrada: object) => void,
 *   ahora?: () => string,
 *   requireEvento?: boolean,
 *   transporteConectado?: () => boolean,
 * }} opciones
 */
export function crearEndpointComandosAlarma({
  validarJwt,
  publicar,
  activar = null,
  finalizar = null,
  verificarActivacion = null,
  dedupe = crearDedupeEnMemoria(),
  metricas = crearMetricasMqtt4(),
  registrar = () => {},
  ahora = () => new Date().toISOString(),
  requireEvento = false,
  transporteConectado = () => true,
  versionedOnly = false,
  solicitarSonido = async () => {},
} = {}) {
  if (typeof validarJwt !== 'function' || typeof publicar !== 'function') {
    throw new TypeError('validarJwt y publicar son dependencias obligatorias.');
  }

  let consecutivo = 0;
  const auditar = (entrada) => {
    consecutivo += 1;
    registrar({ id: `mqtt4-${consecutivo}`, en: ahora(), ...entrada });
  };
  const responderError = (code, contexto = {}, extra = {}) => {
    const status = estadoHttp(code);
    metricas.registrar(code, contexto);
    auditar({ resultado: 'rechazado', status, code, ...contexto });
    return { status, body: { error: code, ...extra } };
  };

  // El gateway existente valida topic/QoS/retain, dedupe local y publica.
  // Su auditoría interna no se expone: aquí solo se conserva una huella.
  const publicador = {
    get connected() {
      return transporteConectado() === true;
    },
    async publish(topic, payload) {
      const resultado = await publicar({ topic, payload, qos: 0, retain: false });
      if (resultado && resultado.ok === false) {
        throw new Error(esCodigoErrorAlarma(resultado.error) ? resultado.error : 'MQTT_NO_DISPONIBLE');
      }
      return { transporte: 'inyectado', qos: 0, retain: false };
    },
  };
  const gateway = new AlarmCommandGateway({
    publisher: publicador,
    ahora,
    registrar: (entrada) => {
      auditar({
        resultado: entrada.resultado,
        code: entrada.code,
        idempotency_hash: huella(entrada.idempotencyKey),
        comando_hash: huella(entrada.comando),
      });
    },
  });

  return async function endpoint(request = {}) {
    if (request.method !== 'POST') {
      return responderError('METHOD_NOT_ALLOWED');
    }

    const jwt = extraerBearer(request.headers?.authorization);
    if (jwt === null) return responderError('UNAUTHENTICATED');

    let identidad;
    try {
      identidad = await validarJwt(jwt);
    } catch {
      return responderError('UNAUTHENTICATED');
    }
    if (identidad === null || identidad === undefined) return responderError('UNAUTHENTICATED');
    if (identidad.activo !== true || !ACTORES.includes(identidad.rol)) {
      return responderError('FORBIDDEN', { rol: identidad.rol ?? null });
    }

    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return responderError('INVALID_BODY');
    }

    const claveComando = body.idempotency_key;
    if (typeof claveComando !== 'string' || claveComando.trim().length === 0) {
      return responderError('IDEMPOTENCIA_REQUERIDA');
    }
    if (body.topic !== ALARM_COMMAND_TOPIC) return responderError('TOPICO_NO_PERMITIDO');
    if (body.qos !== 0 || body.retain !== false) return responderError('OPCIONES_MQTT_INVALIDAS');
    if (!esAlarmaOrigen(body.origen)) return responderError('ORIGEN_NO_VALIDO');

    // Un JWT humano nunca puede presentarse como hardware (D3/C10).
    if (body.origen !== 'cliente') return responderError('ORIGEN_NO_VALIDO');
    if (!esRolOperadorAlarma(identidad.rol)) return responderError('ROL_NO_AUTORIZADO', { rol: identidad.rol });

    if (body.finalizacion !== undefined) {
      if (!body.finalizacion || typeof body.finalizacion !== 'object' || Array.isArray(body.finalizacion)) {
        return responderError('INVALID_BODY');
      }
      const idError = validarClaveIncidente(body.finalizacion.alarma_id, 'cliente');
      if (idError !== null) return responderError('INVALID_ALARM_ID');
    }

    const validacionPayload = validarComandoAlarma(body.comando);
    if (!validacionPayload.valido) return responderError(validacionPayload.code ?? 'PAYLOAD_NO_VALIDO');
    const payload = validacionPayload.payload;

    const activacion = payload.action === true;
    if (body.activacion !== undefined) {
      if (!activacion || body.incidente !== undefined || body.finalizacion !== undefined ||
          !body.activacion || typeof body.activacion !== 'object' ||
          validarClaveIncidente(body.activacion.alarma_id, 'cliente') !== null) {
        return responderError('INVALID_ALARM_ID');
      }
    }
    if (versionedOnly && !activacion && body.finalizacion === undefined) return responderError('INVALID_ALARM_ID');
    const eventoDeclarado = body.evento;

    if (activacion && (eventoDeclarado === undefined || eventoDeclarado === null)) {
      // C5: cliente antiguo. El comando MQTT conserva su evento, pero el
      // incidente no puede inventarlo; se cuenta y se marca en la auditoría.
      metricas.registrar('EVENTO_NO_SELECCIONADO', { rol: identidad.rol });
      auditar({ resultado: 'cliente_legacy', code: 'EVENTO_NO_SELECCIONADO', rol: identidad.rol });
      if (requireEvento) return responderError('EVENTO_NO_SELECCIONADO');
    }

    const eventoEfectivo = activacion ? payload.evento : (eventoDeclarado ?? null);
    if (eventoEfectivo !== null && !esAlarmaIncidente(eventoEfectivo)) {
      return responderError('EVENTO_NO_VALIDO');
    }
    if (activacion && esAlarmaIncidente(eventoDeclarado) && eventoDeclarado !== payload.evento) {
      return responderError('EVENTO_NO_VALIDO');
    }
    if (!activacion && eventoDeclarado !== undefined && eventoDeclarado !== null) {
      const incoherente = !(payload.alcance === 'simulacro' && eventoDeclarado === 'simulacro');
      if (incoherente) return responderError('EVENTO_NO_VALIDO');
    }

    // C3: el incidente (si el llamador lo aporta) usa su propia clave.
    if (body.incidente !== undefined) {
      if (!body.incidente || typeof body.incidente !== 'object' || Array.isArray(body.incidente)) {
        return responderError('INVALID_BODY');
      }
      const incidente = body.incidente;
      if (incidente.origen !== 'cliente') return responderError('ORIGEN_NO_VALIDO');
      const claveIncidente = validarClaveIncidente(incidente.clave_idempotencia, 'cliente');
      if (claveIncidente !== null) return responderError(claveIncidente);
      if (incidente.evento !== null && incidente.evento !== undefined && !esAlarmaIncidente(incidente.evento)) {
        return responderError('EVENTO_NO_VALIDO');
      }
      if (activacion && incidente.evento !== eventoEfectivo && incidente.evento != null) {
        return responderError('EVENTO_NO_VALIDO');
      }
    }

    const firma = JSON.stringify({
      topic: body.topic,
      qos: body.qos,
      retain: body.retain,
      comando: payload,
      origen: body.origen,
      evento: eventoEfectivo,
      alarma_id: body.activacion?.alarma_id ?? body.finalizacion?.alarma_id ?? null,
    });
    if (dedupe.conflicto(claveComando, firma)) return responderError('IDEMPOTENCY_CONFLICT');
    if (dedupe.yaPublicado(claveComando)) {
      auditar({ resultado: 'duplicado_ignorado', idempotency_hash: huella(claveComando) });
      return {
        status: 200,
        body: {
          status: 'PUBLISHED',
          fase: 'publicado',
          idempotency_key: claveComando,
          duplicado: true,
          confirmacion_fisica: 'no_disponible',
        },
      };
    }

    // Fail-closed: no se crea el incidente si no existe transporte MQTT.
    if (!versionedOnly && !publicador.connected) return responderError('MQTT_NO_CONECTADO');

    let alarmaPersistida = null;
    let comandoReconciliado = null;

    if (activacion && body.activacion !== undefined) {
      if (typeof verificarActivacion !== 'function') return responderError('RPC_NO_DISPONIBLE');
      try {
        const response = await verificarActivacion({ alarmaId: body.activacion.alarma_id, evento: eventoEfectivo });
        if (!response?.ok) return responderError('INVALID_ALARM_ID');
        alarmaPersistida = response.alarma;
      } catch { return responderError('RPC_NO_DISPONIBLE'); }
    } else if (activacion) {
      if (typeof activar !== 'function') return responderError('RPC_NO_DISPONIBLE');
      const incidente = body.incidente ?? {};
      try {
        const respuesta = await activar({
          tipo: TIPO_ALARMA_MANUAL,
          claveIdempotencia: incidente.clave_idempotencia ?? claveComando,
          // El incidente nunca inventa el evento: los clientes legacy que no
          // declaran `evento` conservan null en el registro histórico.
          evento: eventoDeclarado ?? null,
          origen: body.origen,
          titulo: incidente.titulo ?? TITULO_ALARMA_MANUAL,
          mensaje: incidente.mensaje ?? MENSAJE_ALARMA_MANUAL,
          severidad: incidente.severidad ?? SEVERIDAD_ALARMA_MANUAL,
          activadoPor: identidad.id ?? null,
          jwt,
          requireEvento,
        });
        if (!respuesta || respuesta.ok !== true) {
          return responderError(esCodigoErrorAlarma(respuesta?.error) ? respuesta.error : 'RPC_NO_DISPONIBLE');
        }
        alarmaPersistida = respuesta.alarma ?? null;
      } catch {
        return responderError('RPC_NO_DISPONIBLE');
      }
    } else if (body.finalizacion !== undefined) {
      if (typeof finalizar !== 'function') return responderError('RPC_NO_DISPONIBLE');
      try {
        const respuesta = await finalizar({
          alarmaId: body.finalizacion.alarma_id,
          activadoPor: identidad.id ?? null,
          rol: identidad.rol,
          evento: eventoEfectivo,
          jwt,
        });
        if (!respuesta || respuesta.ok !== true) {
          return responderError(esCodigoErrorAlarma(respuesta?.error) ? respuesta.error : 'RPC_NO_DISPONIBLE');
        }
        alarmaPersistida = respuesta.alarma ?? null;
        comandoReconciliado = respuesta.comandoReconciliado ?? null;
        if (!versionedOnly && respuesta.requiereDispatcherVersionado === true) {
          // No usar consulta+publish como sustituto de atomicidad. La alarma
          // puede estar finalizada, pero el transporte queda explícito pendiente.
          return responderError('MQTT_NO_DISPONIBLE', {}, { alarma: alarmaPersistida });
        }
      } catch {
        return responderError('RPC_NO_DISPONIBLE');
      }
    }

    if (versionedOnly) {
      try { await solicitarSonido(); } catch { /* Sin ACK no hay éxito físico. */ }
      return responderError('MQTT_NO_DISPONIBLE', {}, { alarma: alarmaPersistida });
    }
    // La finalización puede mantener sonido de otro incidente, nunca apagarlo.
    const draft = comandoReconciliado?.action === true
      ? crearComandoActivacion(comandoReconciliado.evento, claveComando, ahora())
      : activacion
      ? crearComandoActivacion(payload.evento, claveComando, ahora())
      : crearComandoDesactivacion({
          idempotencyKey: claveComando,
          alcance: comandoReconciliado?.alcance ?? payload.alcance,
          ...(payload.motivo === undefined ? {} : { motivo: payload.motivo }),
          createdAt: ahora(),
        });

    const resultado = await gateway.publicar(draft);
    if (resultado.fase === 'error') {
      const code = esCodigoErrorAlarma(resultado.error) ? resultado.error : 'MQTT_NO_DISPONIBLE';
      // La alarma ya fue persistida: devolverla permite al cliente marcar el
      // comando como pendiente sin reintentar la creación (C3).
      return responderError(code, {}, alarmaPersistida === null ? {} : { alarma: alarmaPersistida });
    }

    dedupe.registrar(claveComando, firma, ahora());
    return {
      status: 200,
      body: {
        status: 'PUBLISHED',
        fase: 'publicado',
        idempotency_key: claveComando,
        publicado_en: ahora(),
        confirmacion_fisica: 'no_disponible',
        ...(alarmaPersistida === null ? {} : { alarma: alarmaPersistida }),
      },
    };
  };
}
