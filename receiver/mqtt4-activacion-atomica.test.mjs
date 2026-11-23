import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MENSAJE_ALARMA_MANUAL,
  TITULO_ALARMA_MANUAL,
  TIPO_ALARMA_MANUAL,
} from '../src/app/core/data/alarm-incident-contract.ts';

import { crearActivacionAtomica } from './mqtt4-activacion-atomica.mjs';
import { crearMetricasMqtt4 } from './alarm-command-endpoint.mjs';

const UUID = '11111111-1111-4111-8111-111111111111';

function solicitudBase() {
  return {
    tipo: TIPO_ALARMA_MANUAL,
    evento: 'incendio',
    origen: 'cliente',
    titulo: TITULO_ALARMA_MANUAL,
    mensaje: MENSAJE_ALARMA_MANUAL,
    severidad: 'critical',
    activadoPor: UUID,
    claveIdempotencia: UUID,
  };
}

describe('MQTT.4 — activación atómica fail-closed', () => {
  it('exige RPC inyectada: no existe camino que cree alarma sin outbox', () => {
    assert.throws(() => crearActivacionAtomica(), /RPC atómica/);
  });

  it('crea alarma y notificación solo mediante la RPC y normaliza la respuesta', async () => {
    const llamadas = [];
    const metricas = crearMetricasMqtt4();
    const activar = crearActivacionAtomica({
      rpc: async (parametros) => {
        llamadas.push(parametros);
        return { ok: true, alarma: { id: 'alarma-1', tipo: 'alarma_manual' } };
      },
      metricas,
    });

    const resultado = await activar(solicitudBase());
    assert.equal(resultado.ok, true);
    assert.equal(resultado.status, 201);
    assert.deepEqual(resultado.alarma, {
      id: 'alarma-1',
      tipo: 'alarma_manual',
      evento: 'incendio',
      origen: 'cliente',
      eventoReportado: true,
    });
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].p_evento, 'incendio');
    assert.equal(llamadas[0].p_activado_por, UUID);
  });

  it('falla cerrado si la RPC lanza o responde error, sin reintentos de inserción', async () => {
    const activar = crearActivacionAtomica({
      rpc: async () => {
        throw new Error('RPC_AUSENTE');
      },
    });
    const fallido = await activar(solicitudBase());
    assert.deepEqual(fallido, { ok: false, status: 503, error: 'RPC_NO_DISPONIBLE' });

    const rechazado = crearActivacionAtomica({
      rpc: async () => ({ ok: false, error: 'IDEMPOTENCY_CONFLICT' }),
    });
    assert.deepEqual(await rechazado(solicitudBase()), {
      ok: false,
      status: 409,
      error: 'IDEMPOTENCY_CONFLICT',
    });
  });

  it('cuenta activaciones sin evento pero conserva el valor null histórico (C4/C5)', async () => {
    const metricas = crearMetricasMqtt4();
    const activar = crearActivacionAtomica({
      rpc: async (parametros) => {
        assert.equal(parametros.p_evento, null);
        return { ok: true, alarma: { id: 'alarma-legacy', tipo: 'alarma_manual' } };
      },
      metricas,
    });
    const resultado = await activar({ ...solicitudBase(), evento: null });
    assert.equal(resultado.ok, true);
    assert.equal(resultado.alarma.evento, null);
    assert.equal(resultado.alarma.eventoReportado, false);
    assert.equal(metricas.conteo('EVENTO_NO_SELECCIONADO'), 1);
  });

  it('aplica C10: rechaza hardware con usuario, humano sin usuario y tipos inválidos', async () => {
    const llamadas = [];
    const activar = crearActivacionAtomica({
      rpc: async (parametros) => {
        llamadas.push(parametros);
        return { ok: true, alarma: { id: 'ok', origen: 'hardware', evento: 'sismo' } };
      },
    });

    const hardware = {
      ...solicitudBase(),
      origen: 'hardware',
      activadoPor: null,
      claveIdempotencia: 'ev-123',
      evento: 'sismo',
    };
    assert.equal((await activar(hardware)).ok, true);
    assert.equal((await activar({ ...hardware, activadoPor: UUID })).error, 'IDENTIDAD_HARDWARE_INVALIDA');
    assert.equal((await activar({ ...solicitudBase(), activadoPor: null })).error, 'USUARIO_REQUERIDO');
    assert.equal((await activar({ ...solicitudBase(), tipo: 'otro' })).error, 'TIPO_NO_VALIDO');
    assert.equal((await activar({ ...solicitudBase(), evento: 'volcan' })).error, 'EVENTO_NO_VALIDO');
    assert.equal(llamadas.length, 1);
  });

  it('no escribe claves ni identidades en la auditoría', async () => {
    const entradas = [];
    const activar = crearActivacionAtomica({
      rpc: async () => ({ ok: true, alarma: { id: 'alarma-2' } }),
      registrar: (entrada) => entradas.push(entrada),
      ahora: () => '2026-11-23T12:00:00.000Z',
    });
    await activar(solicitudBase());
    const texto = JSON.stringify(entradas);
    assert.equal(texto.includes(UUID), false);
    assert.ok(texto.includes('clave_hash'));
  });
});
