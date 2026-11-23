/**
 * Receptor EMQX -> HTTPS/SSE para SENA Crowd Intelligence (Fase MQTT.2).
 *
 * - Mantiene un único suscriptor MQTT/TLS con reconexión automática.
 * - Valida y guarda el último estado en memoria (nunca en Supabase).
 * - Expone snapshot inicial + stream SSE para web y APK.
 * - Sin credenciales en el frontend: se leen SOLO de variables de entorno.
 * - No conecta al broker salvo que se configuren host/usuario/clave.
 */

import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { pathToFileURL } from 'node:url';

import { TELEMETRY_SUBSCRIPTIONS } from '../src/app/core/data/telemetry-core.ts';

import { crearEndpointComandosAlarma } from './alarm-command-endpoint.mjs';
import { MqttAlarmCommandPublisher } from './alarm-command-publisher.mjs';
import { cargarEntornoLocal } from './entorno-local.mjs';
import { MqttSubscriberClient } from './mqtt-client.mjs';
import { crearPersistenciaSupabase } from './supabase-persistence.mjs';
import { crearValidadorIdentidadSupabase } from './supabase-identity.mjs';
import { crearDispatcherVersionado } from './versioned-sound-dispatcher.mjs';
import { SseHub } from './sse-hub.mjs';
import { TelemetryStore } from './telemetry-store.mjs';

const HEARTBEAT_MS = 20_000;
const MAX_BODY_BYTES = 16 * 1024;

function entero(valor, porDefecto) {
  const numero = Number.parseInt(valor ?? '', 10);
  return Number.isFinite(numero) && numero > 0 ? numero : porDefecto;
}

export function leerConfiguracion(env = process.env) {
  return {
    puerto: entero(env.TELEMETRY_PORT, 3000),
    // 127.0.0.1 por defecto: solo el mismo equipo. Para prueba con teléfono en
    // la LAN se define TELEMETRY_HOST=0.0.0.0 explícitamente en el receptor.
    host: env.TELEMETRY_HOST || '127.0.0.1',
    corsOrigin: env.TELEMETRY_ALLOWED_ORIGIN || '*',
    tlsCert: env.TELEMETRY_TLS_CERT || '',
    tlsKey: env.TELEMETRY_TLS_KEY || '',
    // Alternativa PEM: un PFX exportado (p. ej. New-SelfSignedCertificate en
    // Windows) con su contraseña. Solo para el receptor; nunca en Ionic.
    tlsPfx: env.TELEMETRY_TLS_PFX || '',
    tlsPassphrase: env.TELEMETRY_TLS_PASSPHRASE || '',
    mqtt: {
      host: env.MQTT_HOST || '',
      port: entero(env.MQTT_PORT, 8883),
      username: env.MQTT_USER || '',
      password: env.MQTT_PASSWORD || '',
      caFile: env.MQTT_CA_FILE || '',
      clientId: env.MQTT_CLIENT_ID || `sena-receptor-${process.pid}`,
    },
    supabase: {
      url: env.SUPABASE_URL || '',
      publishableKey: env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '',
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
    },
    // Credenciales de PUBLICACIÓN separadas del usuario de solo lectura.
    comandos: {
      host: env.MQTT_HOST || '',
      port: entero(env.MQTT_PORT, 8883),
      username: env.MQTT_COMMAND_USER || '',
      password: env.MQTT_COMMAND_PASSWORD || '',
      caFile: env.MQTT_CA_FILE || '',
      clientId: env.MQTT_COMMAND_CLIENT_ID || `sena-comandos-${process.pid}`,
    },
    requireEvento: env.ALARM_REQUIRE_EVENTO === 'true',
  };
}

async function leerCuerpoJson(request) {
  const partes = [];
  let total = 0;

  for await (const parte of request) {
    total += parte.length;
    if (total > MAX_BODY_BYTES) {
      request.destroy();
      return null;
    }
    partes.push(parte);
  }

  try {
    const texto = Buffer.concat(partes).toString('utf8').trim();
    if (texto.length === 0) return null;
    const cuerpo = JSON.parse(texto);
    return cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? cuerpo : null;
  } catch {
    return null;
  }
}

function responderJson(response, status, cuerpo, corsOrigin) {
  const datos = JSON.stringify(cuerpo);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(datos),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': corsOrigin,
  });
  response.end(datos);
}

export async function createTelemetryServer({ demo = false, env = process.env, dependenciasComandos = {}, dependenciasSonido = {} } = {}) {
  if (env === process.env) cargarEntornoLocal('.env', env);

  const config = leerConfiguracion(env);
  const store = new TelemetryStore({ demo });
  const cabecerasCors = {
    'Access-Control-Allow-Origin': config.corsOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  const hub = new SseHub(cabecerasCors);
  const unsubscribe = store.subscribe((payload) => hub.broadcast(payload));

  if (demo) {
    const fixtures = await import('../src/app/core/data/telemetry-fixtures.ts');
    for (const mensaje of fixtures.fixtureMensajes()) {
      store.ingest(mensaje.topic, Buffer.from(JSON.stringify(mensaje.payload), 'utf8'));
    }
    store.setBridge(true, null);
  }

  const persistencia = crearPersistenciaSupabase({
    url: config.supabase.url,
    publishableKey: config.supabase.publishableKey,
    serviceRoleKey: config.supabase.serviceRoleKey,
    notificationWorkerSecret: env.NOTIFICATION_WORKER_SECRET || '',
  });

  let publicadorComandos = null;
  const versionedMode = env.ALARM_VERSIONED_MODE === 'true';
  const versionedReady = versionedMode && env.ALARM_VERSIONED_DEVICE_CONFIRMED === 'true' && typeof dependenciasSonido.send === 'function';
  const soundDispatcher = crearDispatcherVersionado({
    latest: dependenciasSonido.latest ?? persistencia.latestSoundCommand,
    send: dependenciasSonido.send ?? (async () => { throw new Error('SOUND_ACK_TRANSPORT_UNAVAILABLE'); }),
    versionedDeviceConfirmed: versionedReady,
  });
  let soundError = !versionedMode || versionedReady ? null : 'VERSIONED_DEVICE_NOT_CONFIRMED';
  const drainSound = async () => {
    try { await soundDispatcher.drain(); soundError = null; }
    catch (error) { soundError = error.message; throw error; }
  };
  const soundTimer = versionedReady ? setInterval(() => { void drainSound().catch(() => {}); }, 2000) : null;

  const endpointComandos = crearEndpointComandosAlarma({
    validarJwt:
      dependenciasComandos.validarJwt ??
      crearValidadorIdentidadSupabase({
        url: config.supabase.url,
        publishableKey: config.supabase.publishableKey,
        serviceRoleKey: config.supabase.serviceRoleKey,
      }),
    publicar:
      dependenciasComandos.publicar ??
      (async (mensaje) => {
        if (publicadorComandos === null || !publicadorComandos.connected) {
          return { ok: false, error: 'MQTT_NO_CONECTADO' };
        }
        try {
          await publicadorComandos.publish(mensaje.topic, mensaje.payload);
          return { ok: true };
        } catch {
          return { ok: false, error: 'MQTT_NO_DISPONIBLE' };
        }
      }),
    activar: dependenciasComandos.activar ?? persistencia.activar,
    finalizar: dependenciasComandos.finalizar ?? persistencia.finalizar,
    verificarActivacion: dependenciasComandos.verificarActivacion ?? persistencia.verificarActivacion,
    requireEvento: config.requireEvento,
    // Una sola alarma usa el contrato original. El modo versionado es opcional.
    versionedOnly: dependenciasComandos.versionedOnly ?? versionedMode,
    solicitarSonido: drainSound,
    transporteConectado:
      dependenciasComandos.transporteConectado ?? (() => publicadorComandos !== null && publicadorComandos.connected),
  });

  const manejar = async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (request.method === 'OPTIONS') {
      response.writeHead(204, cabecerasCors);
      response.end();
      return;
    }

    if (url.pathname === '/api/alarm/command') {
      if (request.method !== 'POST') {
        responderJson(response, 405, { error: 'METHOD_NOT_ALLOWED' }, config.corsOrigin);
        return;
      }

      const cuerpo = await leerCuerpoJson(request);
      if (cuerpo === null) {
        responderJson(response, 400, { error: 'INVALID_BODY' }, config.corsOrigin);
        return;
      }

      try {
        const resultado = await endpointComandos({
          method: request.method,
          headers: request.headers,
          body: cuerpo,
        });
        responderJson(response, resultado.status, resultado.body, config.corsOrigin);
      } catch {
        responderJson(response, 503, { error: 'FALLO_TRANSPORTE' }, config.corsOrigin);
      }
      return;
    }

    if (request.method !== 'GET') {
      responderJson(response, 405, { error: 'Método no permitido.' }, config.corsOrigin);
      return;
    }

    if (url.pathname === '/health') {
      responderJson(
        response,
        200,
        {
          ok: true,
          demo: store.demo,
          mqttConnected: store.snapshot.bridge.connected,
          commandPublisherConnected: publicadorComandos?.connected === true,
          soundProtocolReady: versionedReady,
          alarmMode: versionedMode ? 'versioned' : 'single',
          soundError,
          clients: hub.size,
        },
        config.corsOrigin,
      );
      return;
    }

    if (url.pathname === '/api/telemetry/snapshot') {
      responderJson(response, 200, store.payload(), config.corsOrigin);
      return;
    }

    if (url.pathname === '/api/telemetry/stream') {
      hub.add(response, store.payload());
      return;
    }

    responderJson(response, 404, { error: 'Ruta no encontrada.' }, config.corsOrigin);
  };

  const opcionesTls = config.tlsPfx
    ? { pfx: readFileSync(config.tlsPfx), passphrase: config.tlsPassphrase }
    : config.tlsCert && config.tlsKey
      ? { cert: readFileSync(config.tlsCert), key: readFileSync(config.tlsKey) }
      : null;

  const servidor = opcionesTls ? https.createServer(opcionesTls, manejar) : http.createServer(manejar);

  const latido = setInterval(() => hub.heartbeat(), HEARTBEAT_MS);
  latido.unref?.();

  let clienteMqtt = null;
  let detenido = false;

  function iniciarMqtt() {
    if (detenido) return null;

    if (demo) {
      console.warn('[RECEPTOR] Modo fixtures activo: NO se conecta a EMQX. Datos de prueba identificados.');
      return null;
    }

    const { host, port, username, password, caFile, clientId } = config.mqtt;
    if (!host || !username || !password) {
      store.setBridge(false, 'Credenciales MQTT no configuradas en el receptor; modo solo HTTP.');
      console.warn('[RECEPTOR] MQTT_HOST/MQTT_USER/MQTT_PASSWORD incompletos: sin conexión al broker.');
      return null;
    }

    clienteMqtt = new MqttSubscriberClient({
      host,
      port,
      username,
      password,
      caFile,
      clientId,
      subscriptions: TELEMETRY_SUBSCRIPTIONS,
    });

    clienteMqtt.on('connect', () => {
      store.setBridge(true, null);
      console.log(`[RECEPTOR] Suscrito a ${TELEMETRY_SUBSCRIPTIONS.length} topics en ${host}:${port}`);
    });

    clienteMqtt.on('message', (topic, payload) => store.ingest(topic, payload));

    clienteMqtt.on('error', (error) => {
      console.error(`[RECEPTOR] MQTT: ${error.message}`);
      store.setBridge(clienteMqtt.connected, `MQTT: ${error.message}`);
    });

    clienteMqtt.on('close', () => {
      store.setBridge(false, 'Broker desconectado; reintentando conexión.');
    });

    clienteMqtt.on('reconnecting', ({ delayMs, intento }) => {
      console.warn(`[RECEPTOR] Reconexión en ${delayMs} ms (intento ${intento}).`);
    });

    clienteMqtt.connect();
    return clienteMqtt;
  }

  /**
   * Habilita explícitamente el transporte de publicación. No se llama en el
   * arranque normal: publicar requiere autorización y credenciales de ACL.
   */
  function iniciarComandos() {
    if (detenido) return null;
    if (publicadorComandos !== null) return publicadorComandos;

    const { host, port, username, password, caFile, clientId } = config.comandos;
    if (!host || !username || !password) {
      console.warn('[RECEPTOR] Publicación MQTT sin credenciales: el endpoint responde pero no envía comandos.');
      return null;
    }

    publicadorComandos = new MqttAlarmCommandPublisher({ host, port, username, password, caFile, clientId });
    publicadorComandos.on('error', (error) => {
      console.error(`[RECEPTOR] Comandos MQTT: ${error.message}`);
    });
    publicadorComandos.connect();
    return publicadorComandos;
  }

  return {
    store,
    hub,
    servidor,
    iniciarMqtt,
    iniciarComandos,
    drainSound,
    endpointComandos,
    start(puerto = config.puerto, host = config.host) {
      return new Promise((resolve, reject) => {
        servidor.once('error', reject);
        servidor.listen(puerto, host, () => {
          servidor.off('error', reject);
          resolve(servidor.address());
        });
      });
    },
    async stop() {
      detenido = true;
      if (soundTimer) clearInterval(soundTimer);
      clearInterval(latido);
      if (clienteMqtt) clienteMqtt.close();
      if (publicadorComandos) publicadorComandos.close();
      unsubscribe();
      hub.closeAll();
      await new Promise((resolve) => servidor.close(resolve));
    },
  };
}

const ejecutadoDirectamente = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (ejecutadoDirectamente) {
  cargarEntornoLocal('.env', process.env);
  const demo = process.argv.includes('--demo');
  const puertoArg = process.argv.find((argumento) => argumento.startsWith('--port='));
  const entorno = puertoArg ? { ...process.env, TELEMETRY_PORT: puertoArg.slice('--port='.length) } : process.env;

  createTelemetryServer({ demo, env: entorno })
    .then(async (instancia) => {
      const direccion = await instancia.start();
      const esquema = instancia.servidor instanceof https.Server ? 'https' : 'http';
      console.log(
        `[RECEPTOR] Escuchando en ${esquema}://${direccion.address}:${direccion.port} ` +
          `(demo=${demo}, tls=${Boolean(instancia.servidor instanceof https.Server)})`,
      );
      instancia.iniciarMqtt();

      if (process.argv.includes('--comandos')) {
        instancia.iniciarComandos();
      } else {
        console.log('[RECEPTOR] Publicación de comandos desactivada (use --comandos solo con autorización).');
      }

      const cerrar = async () => {
        await instancia.stop();
        process.exit(0);
      };
      process.once('SIGINT', cerrar);
      process.once('SIGTERM', cerrar);
    })
    .catch((error) => {
      console.error('[RECEPTOR] No se pudo iniciar:', error.message);
      process.exitCode = 1;
    });
}
