import assert from 'node:assert/strict';
import http from 'node:http';
import { describe, it } from 'node:test';

import { ALARM_COMMAND_TOPIC } from '../src/app/core/data/alarm-command-core.ts';
import { fixtureEventoEsp1, TOPIC_EVENTO_ESP1_SISMO } from '../src/app/core/data/telemetry-fixtures.ts';

import { createTelemetryServer, leerConfiguracion } from './server.mjs';

const USUARIO_ID = '33333333-3333-4333-8333-333333333333';
const ALARMA_ID = '44444444-4444-4444-8444-444444444444';
const CLAVE = '11111111-1111-4111-8111-111111111111';

function conectarSse(url) {
  return new Promise((resolve, reject) => {
    const peticion = http.get(url, (respuesta) => {
      let acumulado = '';
      const esperar = (texto, timeoutMs = 3000) =>
        new Promise((res, rej) => {
          const inicio = Date.now();
          const revisar = () => {
            if (acumulado.includes(texto)) return res(acumulado);
            if (Date.now() - inicio > timeoutMs) return rej(new Error(`SSE sin "${texto}".`));
            setTimeout(revisar, 10);
          };
          revisar();
        });

      respuesta.on('data', (parte) => {
        acumulado += parte.toString('utf8');
      });

      resolve({ respuesta, esperar });
    });
    peticion.on('error', reject);
  });
}

describe('receptor HTTPS/SSE sin hardware (Fase MQTT.2)', () => {
  it('sirve snapshot, difunde a dos clientes y marca los datos como prueba', async () => {
    // Entorno explícito: la prueba no debe depender del .env local (que puede
    // tener TLS del receptor LAN activado) ni conectarse a ningún broker.
    const instancia = await createTelemetryServer({
      demo: true,
      env: { TELEMETRY_PORT: '0', TELEMETRY_TLS_PFX: '', TELEMETRY_TLS_CERT: '', TELEMETRY_TLS_KEY: '' },
    });
    const direccion = await instancia.start(0);

    try {
      const base = `http://127.0.0.1:${direccion.port}`;
      const respuesta = await fetch(`${base}/api/telemetry/snapshot`);
      const cargamento = await respuesta.json();

      assert.equal(respuesta.status, 200);
      assert.equal(cargamento.demo, true);
      assert.equal(cargamento.snapshot.placa1.metricas.temperatura.valor_c, 27.4);
      assert.equal(cargamento.snapshot.placa2.metricas.ir.detecciones_salida, 9);
      assert.equal(cargamento.snapshot.bridge.connected, true);

      const cliente1 = await conectarSse(`${base}/api/telemetry/stream`);
      const cliente2 = await conectarSse(`${base}/api/telemetry/stream`);

      const [datos1, datos2] = await Promise.all([
        cliente1.esperar('event: snapshot'),
        cliente2.esperar('event: snapshot'),
      ]);

      assert.match(datos1, /"demo":true/);
      assert.match(datos2, /"demo":true/);
      assert.equal(instancia.hub.size, 2);

      instancia.store.ingest(
        'sena/casanare/placa1/eventos/sismo',
        Buffer.from(JSON.stringify(fixtureEventoEsp1('sismo'))),
      );

      await Promise.all([cliente1.esperar('"evento":"sismo"'), cliente2.esperar('"evento":"sismo"')]);

      assert.equal(instancia.store.ingest(TOPIC_EVENTO_ESP1_SISMO, 'no-es-json'), false);
      assert.match(instancia.store.snapshot.bridge.lastError ?? '', /JSON MQTT inválido/);

      const noEncontrada = await fetch(`${base}/ruta-inexistente`);
      assert.equal(noEncontrada.status, 404);

      const salud = await (await fetch(`${base}/health`)).json();
      assert.equal(salud.demo, true);
      assert.equal(salud.clients, 2);
    } finally {
      await instancia.stop();
    }
  });

  it('no intenta conexión MQTT cuando faltan credenciales', async () => {
    const instancia = await createTelemetryServer({
      demo: false,
      env: { TELEMETRY_PORT: '3101', MQTT_HOST: '', MQTT_USER: '', MQTT_PASSWORD: '' },
    });

    try {
      assert.equal(instancia.iniciarMqtt(), null);
      assert.equal(instancia.store.demo, false);
      assert.equal(instancia.store.snapshot.placa1.metricas, null);
      assert.match(instancia.store.snapshot.bridge.lastError ?? '', /Credenciales MQTT no configuradas/);
    } finally {
      await instancia.stop();
    }
  });
});

describe('receptor — endpoint autenticado de comandos MQTT', () => {
  const alarma = {
    id: ALARMA_ID,
    tipo: 'alarma_manual',
    titulo: '⚠️ PRECAUCIÓN',
    mensaje: 'Diríjase con calma a la zona segura y siga las indicaciones del personal autorizado.',
    severidad: 'critical',
    fecha_activacion: '2026-11-23T12:00:00.000Z',
    estado: 'activa',
    evento: 'simulacro',
    origen: 'cliente',
    eventoReportado: true,
  };

  const cuerpo = {
    idempotency_key: CLAVE,
    topic: ALARM_COMMAND_TOPIC,
    qos: 0,
    retain: false,
    origen: 'cliente',
    evento: 'simulacro',
    comando: { action: true, evento: 'simulacro' },
    incidente: {
      clave_idempotencia: CLAVE,
      evento: 'simulacro',
      origen: 'cliente',
    },
  };

  function crearServidor(publicaciones) {
    return createTelemetryServer({
      demo: true,
      env: { TELEMETRY_PORT: '0', TELEMETRY_ALLOWED_ORIGIN: 'http://localhost:8100' },
      dependenciasComandos: {
        versionedOnly: false, // Contrato legacy aislado; nunca configuración real.
        validarJwt: async (jwt) =>
          jwt === 'jwt-valido' ? { activo: true, rol: 'instructor', id: USUARIO_ID } : null,
        publicar: async (mensaje) => {
          publicaciones.push(mensaje);
          return { ok: true };
        },
        activar: async () => ({ ok: true, alarma }),
        finalizar: async () => ({ ok: true, alarma: { ...alarma, estado: 'finalizada' } }),
        transporteConectado: () => true,
      },
    });
  }

  it('acepta POST con JWT, aplica CORS y publica solo después de persistir', async () => {
    const publicaciones = [];
    const instancia = await crearServidor(publicaciones);
    const direccion = await instancia.start(0);
    const base = `http://127.0.0.1:${direccion.port}`;

    try {
      const respuesta = await fetch(`${base}/api/alarm/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer jwt-valido',
          Origin: 'http://localhost:8100',
        },
        body: JSON.stringify(cuerpo),
      });
      const datos = await respuesta.json();

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.headers.get('access-control-allow-origin'), 'http://localhost:8100');
      assert.equal(datos.status, 'PUBLISHED');
      assert.equal(datos.confirmacion_fisica, 'no_disponible');
      assert.equal(datos.alarma.id, ALARMA_ID);
      assert.equal(publicaciones.length, 1);
      assert.deepEqual(JSON.parse(publicaciones[0].payload), { action: true, evento: 'simulacro' });

      const preflight = await fetch(`${base}/api/alarm/command`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:8100',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type',
        },
      });
      assert.equal(preflight.status, 204);
      assert.match(preflight.headers.get('access-control-allow-methods') ?? '', /POST/);
      assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /Authorization/i);

      const salud = await (await fetch(`${base}/health`)).json();
      assert.equal(salud.commandPublisherConnected, false);
    } finally {
      await instancia.stop();
    }
  });

  it('rechaza JSON inválido, JWT ausente y GET sin publicar', async () => {
    const publicaciones = [];
    const instancia = await crearServidor(publicaciones);
    const direccion = await instancia.start(0);
    const base = `http://127.0.0.1:${direccion.port}`;

    try {
      const invalido = await fetch(`${base}/api/alarm/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-valido' },
        body: '{no-es-json',
      });
      assert.equal(invalido.status, 400);
      assert.deepEqual(await invalido.json(), { error: 'INVALID_BODY' });

      const sinJwt = await fetch(`${base}/api/alarm/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      assert.equal(sinJwt.status, 401);
      assert.deepEqual(await sinJwt.json(), { error: 'UNAUTHENTICATED' });

      const get = await fetch(`${base}/api/alarm/command`);
      assert.equal(get.status, 405);
      assert.equal(publicaciones.length, 0);
    } finally {
      await instancia.stop();
    }
  });

  it('falla cerrado sin configuración de Supabase ni transporte de publicación', async () => {
    const instancia = await createTelemetryServer({
      demo: true,
      env: { TELEMETRY_PORT: '0' },
    });
    const direccion = await instancia.start(0);

    try {
      const respuesta = await fetch(`http://127.0.0.1:${direccion.port}/api/alarm/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-cualquiera' },
        body: JSON.stringify(cuerpo),
      });
      assert.equal(respuesta.status, 401);
      assert.deepEqual(await respuesta.json(), { error: 'UNAUTHENTICATED' });
      assert.equal(instancia.iniciarComandos(), null);
    } finally {
      await instancia.stop();
    }
  });

  it('escucha solo en loopback por defecto y en la LAN únicamente con TELEMETRY_HOST explícito', async () => {
    assert.equal(leerConfiguracion({}).host, '127.0.0.1');
    assert.equal(leerConfiguracion({ TELEMETRY_HOST: '0.0.0.0' }).host, '0.0.0.0');

    const instancia = await createTelemetryServer({
      demo: true,
      env: { TELEMETRY_PORT: '0', TELEMETRY_HOST: '127.0.0.1' },
    });
    const direccion = await instancia.start(0);

    try {
      assert.equal(direccion.address, '127.0.0.1');
      const salud = await (await fetch(`http://127.0.0.1:${direccion.port}/health`)).json();
      assert.equal(salud.ok, true);
    } finally {
      await instancia.stop();
    }
  });

  it('lee la configuración TLS PFX del receptor sin valores por defecto inseguros', () => {
    const sinTls = leerConfiguracion({});
    assert.equal(sinTls.tlsPfx, '');
    assert.equal(sinTls.tlsPassphrase, '');
    assert.equal(sinTls.tlsCert, '');
    assert.equal(sinTls.tlsKey, '');

    const conPfx = leerConfiguracion({
      TELEMETRY_TLS_PFX: 'receiver/tls/receptor.pfx',
      TELEMETRY_TLS_PASSPHRASE: 'clave-local-de-prueba',
    });
    assert.equal(conPfx.tlsPfx, 'receiver/tls/receptor.pfx');
    assert.equal(conPfx.tlsPassphrase, 'clave-local-de-prueba');
  });
});
