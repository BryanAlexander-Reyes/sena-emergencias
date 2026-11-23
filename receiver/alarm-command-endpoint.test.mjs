import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ALARM_COMMAND_TOPIC } from '../src/app/core/data/alarm-command-core.ts';
import { TITULO_ALARMA_MANUAL, MENSAJE_ALARMA_MANUAL } from '../src/app/core/data/alarm-incident-contract.ts';

import {
  crearDedupeEnMemoria,
  crearEndpointComandosAlarma,
  crearMetricasMqtt4,
} from './alarm-command-endpoint.mjs';
import { crearActivacionAtomica } from './mqtt4-activacion-atomica.mjs';

const CLAVE = '11111111-1111-4111-8111-111111111111';
const CLAVE_INCIDENTE = '22222222-2222-4222-8222-222222222222';
const USUARIO_ID = '33333333-3333-4333-8333-333333333333';
const ALARMA_ID = '44444444-4444-4444-8444-444444444444';
const JWT = 'jwt-de-prueba-no-secreto';

function crearContexto({
  rol = 'administrador',
  requireEvento = false,
  publicar,
  activar,
  finalizar,
  transporteConectado = () => true,
  versionedOnly = false,
  verificarActivacion = null,
} = {}) {
  const publicaciones = [];
  const auditorias = [];
  const activarLlamadas = [];
  const finalizarLlamadas = [];
  const metricas = crearMetricasMqtt4();
  const dedupe = crearDedupeEnMemoria();

  const activarAtomico = crearActivacionAtomica({
    rpc: async (parametros) => ({
      ok: true,
      alarma: {
        id: ALARMA_ID,
        tipo: 'alarma_manual',
        titulo: parametros.p_titulo,
        mensaje: parametros.p_mensaje,
        severidad: parametros.p_severidad,
        fecha_activacion: '2026-11-23T12:00:00.000Z',
        estado: 'activa',
      },
    }),
  });

  const finalizarManual = async (solicitud) => ({
    ok: true,
    alarma: {
      id: solicitud.alarmaId,
      tipo: 'alarma_manual',
      titulo: TITULO_ALARMA_MANUAL,
      mensaje: MENSAJE_ALARMA_MANUAL,
      severidad: 'critical',
      fecha_activacion: '2026-11-23T12:00:00.000Z',
      estado: 'finalizada',
      evento: solicitud.evento ?? null,
      origen: 'cliente',
      eventoReportado: solicitud.evento != null,
    },
  });

  const endpoint = crearEndpointComandosAlarma({
    validarJwt: async (token) => {
      assert.equal(token, JWT);
      return { activo: true, rol, id: USUARIO_ID };
    },
    publicar:
      publicar ??
      (async (mensaje) => {
        publicaciones.push(mensaje);
        return { ok: true };
      }),
    activar: async (solicitud) => {
      activarLlamadas.push({ ...solicitud, jwt: '[oculto]' });
      return activar ? activar(solicitud) : activarAtomico(solicitud);
    },
    finalizar: async (solicitud) => {
      finalizarLlamadas.push({ ...solicitud, jwt: '[oculto]' });
      return finalizar ? finalizar(solicitud) : finalizarManual(solicitud);
    },
    dedupe,
    metricas,
    registrar: (entrada) => auditorias.push(entrada),
    ahora: () => '2026-11-23T12:00:00.000Z',
    requireEvento,
    transporteConectado,
    versionedOnly,
    verificarActivacion,
  });

  return { endpoint, publicaciones, auditorias, metricas, dedupe, activarLlamadas, finalizarLlamadas };
}

function request(body, overrides = {}) {
  return {
    method: 'POST',
    headers: { authorization: `Bearer ${JWT}` },
    body: {
      idempotency_key: CLAVE,
      topic: ALARM_COMMAND_TOPIC,
      qos: 0,
      retain: false,
      origen: 'cliente',
      ...body,
    },
    ...overrides,
  };
}

describe('MQTT.4 — endpoint Node de comandos', () => {
  it('enciende una alarma existente sin volver a crear incidente ni notificación', async () => {
    const context = crearContexto({ verificarActivacion: async ({ alarmaId }) => ({ ok: true, alarma: { id: alarmaId } }) });
    const body = { comando: { action: true, evento: 'simulacro' }, evento: 'simulacro', activacion: { alarma_id: ALARMA_ID } };
    const response = await context.endpoint(request(body));
    assert.equal(response.status, 200);
    assert.equal(context.activarLlamadas.length, 0);
    assert.deepEqual(JSON.parse(context.publicaciones[0].payload), { action: true, evento: 'simulacro' });
    await context.endpoint(request(body));
    assert.equal(context.publicaciones.length, 1);
  });
  it('no enciende un ID no confirmado o con metadatos contradictorios', async () => {
    const context = crearContexto({ verificarActivacion: async () => ({ ok: false }) });
    const response = await context.endpoint(request({ comando: { action: true, evento: 'incendio' }, evento: 'incendio', activacion: { alarma_id: ALARMA_ID } }));
    assert.equal(response.status, 400);
    assert.equal(context.publicaciones.length, 0);
    assert.equal(context.activarLlamadas.length, 0);
  });
  it('el modo real registra sin MQTT pero nunca publica al protocolo antiguo', async () => {
    const context = crearContexto({ versionedOnly: true, transporteConectado: () => false });
    const response = await context.endpoint(request({ comando: { action: true, evento: 'sismo' }, evento: 'sismo' }));
    assert.equal(response.status, 503);
    assert.equal(response.body.alarma.id, ALARMA_ID);
    assert.equal(context.activarLlamadas.length, 1);
    assert.equal(context.publicaciones.length, 0);
    const off = await context.endpoint(request({ comando: { action: false, alcance: 'todas' } }));
    assert.equal(off.status, 400);
    assert.equal(context.publicaciones.length, 0);
  });
  it('Admin e Instructor publican; Aprendiz no publica', async () => {
    for (const rol of ['administrador', 'instructor']) {
      const { endpoint, publicaciones, activarLlamadas } = crearContexto({ rol });
      const respuesta = await endpoint(request({ comando: { action: true, evento: 'incendio' }, evento: 'incendio' }));
      assert.equal(respuesta.status, 200, rol);
      assert.deepEqual(JSON.parse(publicaciones[0].payload), { action: true, evento: 'incendio' });
      assert.equal(respuesta.body.confirmacion_fisica, 'no_disponible');
      assert.equal(respuesta.body.alarma.id, ALARMA_ID);
      assert.equal(activarLlamadas[0].activadoPor, USUARIO_ID);
      assert.equal(activarLlamadas[0].jwt, '[oculto]');
    }

    const aprendiz = crearContexto({ rol: 'aprendiz' });
    const rechazo = await aprendiz.endpoint(
      request({ comando: { action: true, evento: 'incendio' }, evento: 'incendio' }),
    );
    assert.equal(rechazo.status, 403);
    assert.deepEqual(rechazo.body, { error: 'ROL_NO_AUTORIZADO' });
    assert.equal(aprendiz.publicaciones.length, 0);
    assert.equal(aprendiz.activarLlamadas.length, 0);
  });

  it('publica los cinco eventos con claves distintas y respeta QoS/retain del firmware', async () => {
    const { endpoint, publicaciones } = crearContexto();
    for (const [indice, evento] of ['incendio', 'sismo', 'impacto', 'emergencia', 'simulacro'].entries()) {
      const clave = `11111111-1111-4111-8111-${String(indice).padStart(12, '0')}`;
      const respuesta = await endpoint({
        method: 'POST',
        headers: { authorization: `Bearer ${JWT}` },
        body: {
          idempotency_key: clave,
          topic: ALARM_COMMAND_TOPIC,
          qos: 0,
          retain: false,
          origen: 'cliente',
          evento,
          comando: { action: true, evento },
        },
      });
      assert.equal(respuesta.status, 200);
      assert.equal(publicaciones.at(-1).topic, ALARM_COMMAND_TOPIC);
      assert.equal(publicaciones.at(-1).qos, 0);
      assert.equal(publicaciones.at(-1).retain, false);
    }
    assert.deepEqual(
      publicaciones.map((entrada) => JSON.parse(entrada.payload).evento),
      ['incendio', 'sismo', 'impacto', 'emergencia', 'simulacro'],
    );
  });

  it('cuenta las activaciones legacy sin evento y no permite habilitar REQUIRE_EVENTO sin error', async () => {
    const legacy = request({ comando: { action: true, evento: 'incendio' } });
    const compatible = crearContexto();
    const respuesta = await compatible.endpoint(legacy);
    assert.equal(respuesta.status, 200);
    assert.equal(compatible.metricas.conteo('EVENTO_NO_SELECCIONADO'), 1);
    assert.deepEqual(JSON.parse(compatible.publicaciones[0].payload), { action: true, evento: 'incendio' });
    // Cliente legacy: el comando MQTT conserva su evento, pero el incidente
    // histórico no lo inventa y se registra con evento null.
    assert.equal(compatible.activarLlamadas[0].evento, null);

    const estricto = crearContexto({ requireEvento: true });
    const rechazo = await estricto.endpoint(request({ comando: { action: true, evento: 'sismo' } }));
    assert.equal(rechazo.status, 400);
    assert.deepEqual(rechazo.body, { error: 'EVENTO_NO_SELECCIONADO' });
    assert.equal(estricto.publicaciones.length, 0);
    assert.equal(estricto.activarLlamadas.length, 0);
  });

  it('retiene comandos exactos de desactivación y rechaza motivo inválido', async () => {
    const { endpoint, publicaciones, finalizarLlamadas } = crearContexto();
    await endpoint(request({ comando: { action: false, alcance: 'todas' } }));
    assert.deepEqual(JSON.parse(publicaciones[0].payload), { action: false, alcance: 'todas' });
    assert.equal(finalizarLlamadas.length, 0);

    const cierre = crearContexto();
    await cierre.endpoint(request({ comando: { action: false, alcance: 'simulacro', motivo: 'falsa_alarma' } }));
    assert.deepEqual(JSON.parse(cierre.publicaciones[0].payload), {
      action: false,
      alcance: 'simulacro',
      motivo: 'falsa_alarma',
    });

    const invalido = crearContexto();
    const rechazo = await invalido.endpoint(request({ comando: { action: false, motivo: 'falsa_alarma' } }));
    assert.equal(rechazo.status, 400);
    assert.equal(rechazo.body.error, 'MOTIVO_NO_VALIDO');
    assert.equal(invalido.publicaciones.length, 0);
  });

  it('deduplica por clave de comando y detecta conflicto con otro cuerpo', async () => {
    const { endpoint, publicaciones } = crearContexto();
    const bod = { comando: { action: true, evento: 'impacto' }, evento: 'impacto' };
    const primera = await endpoint(request(bod));
    const duplicada = await endpoint(request(bod));

    assert.equal(primera.body.duplicado, undefined);
    assert.equal(duplicada.body.duplicado, true);
    assert.equal(publicaciones.length, 1);

    const conflicto = await endpoint(
      request({ comando: { action: true, evento: 'sismo' }, evento: 'sismo' }),
    );
    assert.equal(conflicto.status, 409);
    assert.deepEqual(conflicto.body, { error: 'IDEMPOTENCY_CONFLICT' });
    assert.equal(publicaciones.length, 1);
  });

  it('mantiene separadas la clave del incidente y la clave del comando MQTT', async () => {
    const { endpoint, publicaciones, activarLlamadas } = crearContexto();
    const respuesta = await endpoint(
      request({
        comando: { action: true, evento: 'emergencia' },
        evento: 'emergencia',
        incidente: {
          clave_idempotencia: CLAVE_INCIDENTE,
          evento: 'emergencia',
          origen: 'cliente',
          titulo: TITULO_ALARMA_MANUAL,
          mensaje: MENSAJE_ALARMA_MANUAL,
        },
      }),
    );
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.idempotency_key, CLAVE);
    assert.equal(publicaciones.length, 1);
    assert.equal(activarLlamadas[0].claveIdempotencia, CLAVE_INCIDENTE);

    const sinIncidenteValido = crearContexto();
    const rechazo = await sinIncidenteValido.endpoint(
      request({
        comando: { action: true, evento: 'emergencia' },
        evento: 'emergencia',
        incidente: { clave_idempotencia: 'ev-hardware', origen: 'hardware' },
      }),
    );
    assert.equal(rechazo.status, 400);
    assert.equal(rechazo.body.error, 'ORIGEN_NO_VALIDO');
  });

  it('rechaza solicitudes no autorizadas y bodies inválidos con códigos canónicos', async () => {
    const { endpoint, publicaciones } = crearContexto();
    const casos = [
      [{ ...request({}), method: 'GET' }, 'METHOD_NOT_ALLOWED'],
      [{ ...request({}), headers: {} }, 'UNAUTHENTICATED'],
      [{ ...request({ comando: { action: true, evento: 'incendio' }, evento: 'incendio' }), body: null }, 'INVALID_BODY'],
      [request({ origen: 'hardware', comando: { action: true, evento: 'incendio' } }), 'ORIGEN_NO_VALIDO'],
      [request({ topic: 'otro/topic', comando: { action: true, evento: 'incendio' } }), 'TOPICO_NO_PERMITIDO'],
      [request({ qos: 1, comando: { action: true, evento: 'incendio' } }), 'OPCIONES_MQTT_INVALIDAS'],
      [request({ comando: { action: true, evento: 'volcan' }, evento: 'volcan' }), 'INCIDENTE_NO_VALIDO'],
      [request({ comando: { action: true, evento: 'incendio' }, evento: 'sismo' }), 'EVENTO_NO_VALIDO'],
      [request({ comando: { action: true } }), 'EVENTO_REQUERIDO'],
    ];

    for (const [solicitud, code] of casos) {
      const respuesta = await endpoint(solicitud);
      assert.equal(respuesta.body.error, code, String(code));
    }
    assert.equal(publicaciones.length, 0);
  });

  it('no registra secretos y permite reintento cuando el transporte falla', async () => {
    let fallar = true;
    const { endpoint, publicaciones, auditorias } = crearContexto({
      publicar: async (mensaje) => {
        if (fallar) return { ok: false, error: 'MQTT_NO_DISPONIBLE' };
        publicaciones.push(mensaje);
        return { ok: true };
      },
    });
    const bod = { comando: { action: true, evento: 'sismo' }, evento: 'sismo' };

    const fallido = await endpoint(request(bod));
    assert.equal(fallido.status, 503);
    assert.equal(fallido.body.error, 'MQTT_NO_DISPONIBLE');
    assert.equal(fallido.body.alarma.id, ALARMA_ID);
    fallar = false;
    const exitoso = await endpoint(request(bod));
    assert.equal(exitoso.status, 200);
    assert.equal(publicaciones.length, 1);

    const texto = JSON.stringify(auditorias);
    assert.equal(texto.includes(JWT), false);
    assert.equal(texto.includes(CLAVE), false);
    assert.equal(texto.includes('authorization'), false);
  });

  it('rechaza JWT inactivo o de rol desconocido con 403', async () => {
    const endpoint = crearEndpointComandosAlarma({
      validarJwt: async () => ({ activo: false, rol: 'administrador' }),
      publicar: async () => ({ ok: true }),
    });
    const respuesta = await endpoint(request({ comando: { action: true, evento: 'incendio' } }));
    assert.equal(respuesta.status, 403);
    assert.deepEqual(respuesta.body, { error: 'FORBIDDEN' });
  });

  it('no publica ni informa éxito si falla la persistencia atómica', async () => {
    const { endpoint, publicaciones, activarLlamadas } = crearContexto({
      activar: async () => ({ ok: false, error: 'RPC_NO_DISPONIBLE' }),
    });
    const respuesta = await endpoint(request({ comando: { action: true, evento: 'simulacro' }, evento: 'simulacro' }));

    assert.equal(respuesta.status, 503);
    assert.deepEqual(respuesta.body, { error: 'RPC_NO_DISPONIBLE' });
    assert.equal(publicaciones.length, 0);
    assert.equal(activarLlamadas.length, 1);
  });

  it('falla cerrado si no existe hook de persistencia', async () => {
    const endpoint = crearEndpointComandosAlarma({
      validarJwt: async () => ({ activo: true, rol: 'administrador', id: USUARIO_ID }),
      publicar: async () => {
        throw new Error('NO_DEBE_PUBLICAR');
      },
    });
    const respuesta = await endpoint(request({ comando: { action: true, evento: 'simulacro' }, evento: 'simulacro' }));

    assert.equal(respuesta.status, 503);
    assert.deepEqual(respuesta.body, { error: 'RPC_NO_DISPONIBLE' });
  });

  it('no crea el incidente cuando el transporte MQTT no está conectado', async () => {
    const { endpoint, publicaciones, activarLlamadas } = crearContexto({ transporteConectado: () => false });
    const respuesta = await endpoint(request({ comando: { action: true, evento: 'simulacro' }, evento: 'simulacro' }));

    assert.equal(respuesta.status, 503);
    assert.deepEqual(respuesta.body, { error: 'MQTT_NO_CONECTADO' });
    assert.equal(publicaciones.length, 0);
    assert.equal(activarLlamadas.length, 0);
  });

  it('finaliza manualmente con alcance simulacro sin cerrar alarmas desde hardware', async () => {
    const { endpoint, publicaciones, finalizarLlamadas } = crearContexto();
    const respuesta = await endpoint(
      request({
        comando: { action: false, alcance: 'simulacro' },
        evento: 'simulacro',
        finalizacion: { alarma_id: ALARMA_ID },
      }),
    );

    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.alarma.id, ALARMA_ID);
    assert.equal(respuesta.body.alarma.estado, 'finalizada');
    assert.equal(respuesta.body.confirmacion_fisica, 'no_disponible');
    assert.deepEqual(JSON.parse(publicaciones[0].payload), { action: false, alcance: 'simulacro' });
    assert.equal(finalizarLlamadas.length, 1);
    assert.equal(finalizarLlamadas[0].alarmaId, ALARMA_ID);
    assert.equal(finalizarLlamadas[0].jwt, '[oculto]');

    const hardware = crearContexto();
    await hardware.endpoint(request({ comando: { action: false, alcance: 'todas' } }));
    assert.equal(hardware.finalizarLlamadas.length, 0);
  });

  it('rechaza una finalización con id de alarma inválido', async () => {
    const { endpoint, publicaciones, finalizarLlamadas } = crearContexto();
    const respuesta = await endpoint(
      request({
        comando: { action: false, alcance: 'simulacro' },
        evento: 'simulacro',
        finalizacion: { alarma_id: 'no-es-uuid' },
      }),
    );

    assert.equal(respuesta.status, 400);
    assert.equal(respuesta.body.error, 'INVALID_ALARM_ID');
    assert.equal(publicaciones.length, 0);
    assert.equal(finalizarLlamadas.length, 0);
  });
});
