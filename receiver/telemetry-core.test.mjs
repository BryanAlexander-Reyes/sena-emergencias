import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyTelemetryEnvelope,
  emptySnapshot,
  isStale,
  isTelemetryStreamPayload,
  latestUpdateAt,
  TELEMETRY_STALE_MS,
} from '../src/app/core/data/telemetry-core.ts';
import {
  FIXTURE_RECEIVED_AT,
  fixtureEventoEsp1,
  fixtureEventoEsp2,
  fixtureInvalidas,
  fixtureMetricasEsp1,
  fixtureMetricasEsp2,
  fixtureMensajes,
  fixtureStreamPayload,
  TOPIC_CONEXION_ESP1,
  TOPIC_EVENTO_ESP1_INCENDIO,
  TOPIC_EVENTO_ESP2_INCENDIO,
  TOPIC_METRICAS,
} from '../src/app/core/data/telemetry-fixtures.ts';

function aplicarTodo() {
  let snapshot = emptySnapshot();

  for (const mensaje of fixtureMensajes()) {
    const resultado = applyTelemetryEnvelope(snapshot, mensaje.topic, mensaje.payload, FIXTURE_RECEIVED_AT);
    assert.equal(resultado.accepted, true, `debió aceptar ${mensaje.topic}`);
    snapshot = resultado.snapshot;
  }

  return snapshot;
}

describe('núcleo de telemetría (Fase MQTT.2)', () => {
  it('interpreta los mensajes de los firmware y separa placa1 de placa2', () => {
    const snapshot = aplicarTodo();

    assert.equal(snapshot.placa1.metricas?.placa, 'placa1');
    assert.equal(snapshot.placa1.metricas?.sala, 'riesgo_bajo');
    assert.equal(snapshot.placa1.metricas?.temperatura.valor_c, 27.4);
    assert.equal(snapshot.placa1.metricas?.temperatura.humedad_porcentaje, 61.2);
    assert.equal(snapshot.placa1.metricas?.ultrasonico.distancia_cm, 84.5);
    assert.equal(snapshot.placa1.metricas?.touch.activo, false);
    assert.equal(snapshot.placa1.metricas?.acelerometro.condicion, 'sin_evento');
    assert.equal(snapshot.placa1.conexion?.online, true);

    assert.equal(snapshot.placa2.metricas?.placa, 'placa2');
    assert.equal(snapshot.placa2.metricas?.sala, 'riesgo_alto');
    assert.equal(snapshot.placa2.metricas?.temperatura.valor_c, 38.6);
    assert.equal(snapshot.placa2.metricas?.ir.detecciones_entrada, 12);
    assert.equal(snapshot.placa2.metricas?.ir.detecciones_salida, 9);
    assert.equal(snapshot.placa2.conexion?.online, true);

    assert.equal(snapshot.placa1.ultimoEvento?.evento, 'incendio');
    assert.equal(snapshot.placa2.ultimoEvento?.evento, 'incendio');
    assert.equal(snapshot.placa1.ultimoEvento?.placa, 'placa1');
    assert.equal(snapshot.placa2.ultimoEvento?.placa, 'placa2');
  });

  it('no mezcla métricas: una métrica de placa2 no altera placa1', () => {
    const inicial = emptySnapshot();
    const conPlaca1 = applyTelemetryEnvelope(
      inicial,
      TOPIC_METRICAS,
      fixtureMetricasEsp1(),
      FIXTURE_RECEIVED_AT,
    ).snapshot;

    const conPlaca2 = applyTelemetryEnvelope(
      conPlaca1,
      TOPIC_METRICAS,
      fixtureMetricasEsp2(),
      FIXTURE_RECEIVED_AT,
    ).snapshot;

    assert.equal(conPlaca2.placa1.metricas?.placa, 'placa1');
    assert.equal(conPlaca2.placa2.metricas?.placa, 'placa2');
    assert.equal(inicial.placa1.metricas, null);
  });

  it('rechaza mensajes inválidos sin mutar el estado', () => {
    const inicial = aplicarTodo();
    const original = structuredClone(inicial);

    for (const invalida of fixtureInvalidas) {
      const resultado = applyTelemetryEnvelope(inicial, invalida.topic, invalida.payload, FIXTURE_RECEIVED_AT);
      assert.equal(resultado.accepted, false, `debió rechazar: ${invalida.motivo}`);
      assert.ok(resultado.reason.length > 0);
    }

    assert.deepEqual(inicial, original);
  });

  it('acepta eventos por wildcard de placa1 y valida la coincidencia topic/evento', () => {
    let snapshot = emptySnapshot();
    const sismo = applyTelemetryEnvelope(
      snapshot,
      'sena/casanare/placa1/eventos/sismo',
      fixtureEventoEsp1('sismo', true),
      FIXTURE_RECEIVED_AT,
    );
    assert.equal(sismo.accepted, true);
    snapshot = sismo.snapshot;
    assert.equal(snapshot.placa1.ultimoEvento?.evento, 'sismo');
    assert.equal(snapshot.placa2.ultimoEvento, null);

    const incendio = applyTelemetryEnvelope(
      snapshot,
      TOPIC_EVENTO_ESP2_INCENDIO,
      fixtureEventoEsp2(false),
      FIXTURE_RECEIVED_AT,
    );
    assert.equal(incendio.accepted, true);
    assert.equal(incendio.snapshot.placa2.ultimoEvento?.estado, false);
    assert.equal(
      applyTelemetryEnvelope(
        snapshot,
        'sena/casanare/placa1/eventos/incendio',
        fixtureEventoEsp1('sismo'),
        FIXTURE_RECEIVED_AT,
      ).accepted,
      false,
    );
    assert.equal(
      applyTelemetryEnvelope(snapshot, 'sena/casanare/placa1/eventos/+', fixtureEventoEsp1(), FIXTURE_RECEIVED_AT)
        .accepted,
      false,
    );
  });

  it('acepta el LWT {"online":false} sin cabecera de firmware', () => {
    const sinConexion = applyTelemetryEnvelope(
      emptySnapshot(),
      TOPIC_CONEXION_ESP1,
      { online: false },
      FIXTURE_RECEIVED_AT,
    );

    assert.equal(sinConexion.accepted, true);
    assert.equal(sinConexion.snapshot.placa1.conexion?.online, false);
  });

  it('detecta datos ausentes y obsoletos', () => {
    const ahora = Date.parse(FIXTURE_RECEIVED_AT);

    assert.equal(isStale(null, ahora), true);
    assert.equal(isStale(FIXTURE_RECEIVED_AT, ahora), false);
    assert.equal(isStale(FIXTURE_RECEIVED_AT, ahora + TELEMETRY_STALE_MS + 1), true);
    assert.equal(isStale('fecha-invalida', ahora), true);
  });

  it('expone la última actualización y valida el sobre SSE', () => {
    const snapshot = aplicarTodo();

    assert.equal(latestUpdateAt(emptySnapshot()), null);
    assert.equal(latestUpdateAt(snapshot), FIXTURE_RECEIVED_AT);
    assert.equal(isTelemetryStreamPayload(fixtureStreamPayload()), true);
    assert.equal(isTelemetryStreamPayload({ demo: true, receivedAt: FIXTURE_RECEIVED_AT }), false);
    assert.equal(isTelemetryStreamPayload({ ...fixtureStreamPayload(), demo: 'true' }), false);
  });

  it('conserva valores null del firmware sin inventar humedad ni buzzer', () => {
    const sinDatos = structuredClone(fixtureMetricasEsp1());
    sinDatos.temperatura.valor_c = null;
    sinDatos.temperatura.humedad_porcentaje = null;

    const resultado = applyTelemetryEnvelope(emptySnapshot(), TOPIC_METRICAS, sinDatos, FIXTURE_RECEIVED_AT);

    assert.equal(resultado.accepted, true);
    assert.equal(resultado.snapshot.placa1.metricas?.temperatura.valor_c, null);
    assert.equal(resultado.snapshot.placa1.metricas?.temperatura.humedad_porcentaje, null);
    assert.equal('buzzer' in (resultado.snapshot.placa2.metricas ?? {}), false);
    assert.equal(TOPIC_EVENTO_ESP1_INCENDIO.startsWith('sena/casanare/placa1/eventos/'), true);
  });
});
