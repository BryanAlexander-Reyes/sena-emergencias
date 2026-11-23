import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { crearPersistenciaSupabase } from './supabase-persistence.mjs';

const USUARIO_ID = '33333333-3333-4333-8333-333333333333';
const CLAVE = '11111111-1111-4111-8111-111111111111';
const ALARMA_ID = '44444444-4444-4444-8444-444444444444';
const URL = 'https://proyecto.supabase.co';
const JWT = 'jwt-sintetico-no-secreto';

const solicitud = {
  tipo: 'alarma_manual',
  evento: 'simulacro',
  origen: 'cliente',
  titulo: '⚠️ PRECAUCIÓN',
  mensaje: 'Diríjase con calma a la zona segura y siga las indicaciones del personal autorizado.',
  severidad: 'critical',
  activadoPor: USUARIO_ID,
  claveIdempotencia: CLAVE,
};

function crearFabrica(respuesta = { data: { alarma: { id: ALARMA_ID } }, error: null }) {
  const llamadas = [];
  return {
    llamadas,
    clientFactory: (url, clave) => ({
      from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }),
      rpc: async (nombre, parametros) => {
        llamadas.push({ url, clave, nombre, parametros });
        return respuesta;
      },
    }),
  };
}

function crearPersistencia(fabrica, overrides = {}) {
  return crearPersistenciaSupabase({
    url: URL,
    publishableKey: 'publishable-key',
    serviceRoleKey: 'service-role',
    clientFactory: fabrica.clientFactory,
    ...overrides,
  });
}

describe('receptor — persistencia atómica Supabase', () => {
  it('solo confirma para el buzzer una alarma existente, activa y compatible', async () => {
    let row = { id: ALARMA_ID, tipo: 'alarma_manual', estado: 'activa', evento: 'simulacro' };
    const persistence = crearPersistenciaSupabase({ url: URL, serviceRoleKey: 'server-test',
      clientFactory: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) }),
    });
    assert.equal((await persistence.verificarActivacion({ alarmaId: ALARMA_ID, evento: 'simulacro' })).ok, true);
    assert.equal((await persistence.verificarActivacion({ alarmaId: ALARMA_ID, evento: 'incendio' })).ok, false);
    row = { ...row, estado: 'finalizada' };
    assert.equal((await persistence.verificarActivacion({ alarmaId: ALARMA_ID, evento: 'simulacro' })).ok, false);
    row = null;
    assert.equal((await persistence.verificarActivacion({ alarmaId: ALARMA_ID, evento: 'simulacro' })).ok, false);
  });
  it('usa RPC atómica con tipo, evento, origen e idempotencia del incidente', async () => {
    const fabrica = crearFabrica();
    const persistencia = crearPersistencia(fabrica);
    const resultado = await persistencia.activar(solicitud);

    assert.equal(resultado.ok, true);
    assert.equal(persistencia.persistenciaAtomicaDisponible, true);
    assert.equal(fabrica.llamadas.length, 1);
    assert.equal(fabrica.llamadas[0].nombre, 'crear_incidente_con_notificacion');
    assert.equal(fabrica.llamadas[0].clave, 'service-role');
    assert.deepEqual(fabrica.llamadas[0].parametros, {
      p_tipo: 'alarma_manual',
      p_evento: 'simulacro',
      p_origen: 'cliente',
      p_titulo: solicitud.titulo,
      p_mensaje: solicitud.mensaje,
      p_severidad: 'critical',
      p_activado_por: USUARIO_ID,
      p_clave_idempotencia: CLAVE,
    });
    assert.equal(resultado.alarma.id, ALARMA_ID);
    assert.equal(resultado.alarma.evento, 'simulacro');
    assert.equal(resultado.alarma.origen, 'cliente');
    assert.equal(resultado.alarma.eventoReportado, true);
  });

  it('falla cerrado sin clave de servicio: no hay RPC ni alarma', async () => {
    const fabrica = crearFabrica();
    const persistencia = crearPersistencia(fabrica, { serviceRoleKey: '' });
    const resultado = await persistencia.activar(solicitud);

    assert.equal(persistencia.persistenciaAtomicaDisponible, false);
    assert.equal(resultado.ok, false);
    assert.equal(resultado.error, 'RPC_NO_DISPONIBLE');
    assert.equal(fabrica.llamadas.length, 0);
  });

  it('traduce idempotencia duplicada y propaga rechazos de la RPC', async () => {
    const duplicada = crearPersistencia(crearFabrica({ data: null, error: { code: '23505' } }));
    const resultado = await duplicada.activar(solicitud);
    assert.equal(resultado.ok, false);
    assert.equal(resultado.error, 'IDEMPOTENCY_CONFLICT');
    assert.equal(resultado.status, 409);

    const rechazada = crearPersistencia(crearFabrica({ data: { ok: false, error: 'TIPO_NO_VALIDO' }, error: null }));
    const otro = await rechazada.activar(solicitud);
    assert.equal(otro.ok, false);
    assert.equal(otro.error, 'TIPO_NO_VALIDO');
  });

  it('finaliza mediante Edge Function con el JWT del usuario', async () => {
    const llamadas = [];
    const fetchImpl = async (url, init) => {
      llamadas.push({ url, init });
      return new Response(JSON.stringify({ status: 'FINALIZED', alarma: { id: ALARMA_ID } }), { status: 200 });
    };
    const persistencia = crearPersistencia(crearFabrica(), { fetchImpl, url: `${URL}/rest/v1/` });

    const resultado = await persistencia.finalizar({ alarmaId: ALARMA_ID, jwt: JWT });

    assert.equal(resultado.ok, true);
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].url, `${URL}/functions/v1/finalizar-alarma-manual`);
    assert.equal(llamadas[0].init.headers.Authorization, `Bearer ${JWT}`);
    assert.equal(llamadas[0].init.headers.apikey, 'publishable-key');
    assert.deepEqual(JSON.parse(llamadas[0].init.body), { alarma_id: ALARMA_ID });
  });

  it('no finaliza sin JWT ni cuando la Edge Function rechaza la solicitud', async () => {
    let llamadas = 0;
    const fetchImpl = async () => {
      llamadas += 1;
      return new Response(JSON.stringify({ error: 'FORBIDDEN' }), { status: 403 });
    };
    const persistencia = crearPersistencia(crearFabrica(), { fetchImpl });

    const sinJwt = await persistencia.finalizar({ alarmaId: ALARMA_ID, jwt: '' });
    assert.equal(sinJwt.ok, false);
    assert.equal(llamadas, 0);

    const rechazada = await persistencia.finalizar({ alarmaId: ALARMA_ID, jwt: JWT });
    assert.equal(rechazada.ok, false);
    assert.equal(rechazada.error, 'RPC_NO_DISPONIBLE');
    assert.equal(llamadas, 1);
  });
});
