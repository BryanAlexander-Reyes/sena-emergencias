import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ALARM_COMMAND_TOPIC, crearComandoActivacion } from '../src/app/core/data/alarm-command-core.ts';
import {
  ALARM_INCIDENTES,
  ALARM_ORIGENES,
  IDENTIDAD_DISPOSITIVO,
  TIPO_ALARMA_MANUAL,
  crearPropuestaActivacion,
  crearPropuestaActivacionHardware,
  normalizarIncidenteAlarma,
  puedeActivar,
  puedeFinalizar,
  puedeConsultar,
} from '../src/app/core/data/alarm-incident-contract.ts';
import { crearDeduplicadorEventosHardware, decidirDesdeMensajeMqtt } from '../src/app/core/data/hardware-event-core.ts';
import { MQTT_QOS, MQTT_TOPICS } from '../src/app/core/data/mqtt-contracts.ts';

import { AlarmCommandGateway, FakeAlarmCommandPublisher } from './alarm-command-gateway.mjs';

const UUID = '123e4567-e89b-42d3-a456-426614174000';
const FECHA = '2026-11-23T12:00:00.000Z';

function eventoEsp1(incidente, eventoId, estado = true) {
  return {
    version: 1,
    placa: 'placa1',
    sala: 'riesgo_bajo',
    sesion: 'sesion-prueba',
    secuencia: 1,
    tipo: 'evento',
    tiempo_activo_ms: 1000,
    fecha: null,
    evento_id: eventoId,
    evento: incidente,
    estado,
    evidencia: { origen: 'touch_o_control_local' },
  };
}

describe('MQTT.3B — contrato ampliado del incidente', () => {
  it('conserva los cinco eventos originales y agrega origen sin cambiar tipo', () => {
    assert.deepEqual(ALARM_INCIDENTES, ['incendio', 'sismo', 'impacto', 'simulacro', 'emergencia']);
    assert.deepEqual(ALARM_ORIGENES, ['cliente', 'hardware']);
    assert.equal(ALARM_COMMAND_TOPIC, MQTT_TOPICS.ESP2_COMANDOS_ALARMA);
    assert.equal(MQTT_QOS.PUBLICACION_DEFAULT, 0);

    const propuesta = crearPropuestaActivacion({ claveIdempotencia: UUID, evento: 'incendio', origen: 'cliente' });
    assert.equal(propuesta.tipo, TIPO_ALARMA_MANUAL);
    assert.equal(propuesta.evento, 'incendio');
    assert.equal(propuesta.origen, 'cliente');
    assert.equal(propuesta.titulo, '⚠️ PRECAUCIÓN');
    assert.equal(propuesta.severidad, 'critical');
  });

  it('no inventa evento para registros históricos', () => {
    const historico = {
      id: 'registro-1',
      tipo: TIPO_ALARMA_MANUAL,
      titulo: '⚠️ PRECAUCIÓN',
      mensaje: 'mensaje aprobado',
      severidad: 'critical',
      fecha_activacion: FECHA,
    };
    const normalizado = normalizarIncidenteAlarma(historico);

    assert.equal(normalizado.evento, null);
    assert.equal(normalizado.origen, 'cliente');
    assert.equal(normalizado.eventoReportado, false);
    assert.equal(normalizado.tipo, TIPO_ALARMA_MANUAL);
  });

  it('aplica la matriz MQTT.4 con identidad de dispositivo separada', () => {
    for (const evento of ALARM_INCIDENTES) {
      assert.equal(puedeActivar('administrador', evento), true);
      assert.equal(puedeActivar('aprendiz', evento), false);
      assert.equal(puedeActivar('instructor', evento), true);
      assert.equal(puedeFinalizar('administrador', evento), true);
      assert.equal(puedeFinalizar('instructor', evento), true);
      assert.equal(puedeFinalizar('aprendiz', evento), false);
      assert.equal(puedeConsultar('aprendiz'), true);
    }
    assert.equal(puedeFinalizar('instructor', null), true);
    assert.equal(IDENTIDAD_DISPOSITIVO, 'dispositivo');

    const propuestaHardware = crearPropuestaActivacionHardware({ eventoId: 'ev-hw-1', evento: 'sismo' });
    assert.equal(propuestaHardware.clave_idempotencia, 'ev-hw-1');
    assert.equal(propuestaHardware.origen, 'hardware');
  });
});

describe('MQTT.3B — publicación y deduplicación sin red', () => {
  it('el payload MQTT conserva solo action/evento/alcance/motivo', async () => {
    const publisher = new FakeAlarmCommandPublisher();
    const gateway = new AlarmCommandGateway({ publisher, ahora: () => FECHA });
    const draft = crearComandoActivacion('emergencia', 'mqtt3b-1', FECHA);

    const resultado = await gateway.publicar(draft);

    assert.equal(resultado.fase, 'publicado');
    assert.equal(resultado.confirmacionFisica, 'no_disponible');
    assert.equal(publisher.publicaciones.length, 1);
    assert.deepEqual(JSON.parse(publisher.publicaciones[0].payload), { action: true, evento: 'emergencia' });
    assert.equal(publisher.publicaciones[0].topic, ALARM_COMMAND_TOPIC);
    assert.equal(publisher.publicaciones[0].qos, 0);
    assert.equal(publisher.publicaciones[0].retain, false);
    assert.equal(gateway.auditoria[0].comando.evento, 'emergencia');
  });

  it('el evento hardware produce una propuesta deduplicada por evento_id', () => {
    const deduplicador = crearDeduplicadorEventosHardware();
    const mensaje = eventoEsp1('sismo', 'ev-sismo-1');
    const topic = `${MQTT_TOPICS.ESP1_EVENTOS_WILDCARD.replace('+', 'sismo')}`;

    const primera = decidirDesdeMensajeMqtt(deduplicador, topic, mensaje, FECHA);
    assert.equal(primera.tipo, 'CREAR_INCIDENTE_HARDWARE');
    assert.equal(primera.origen, 'hardware');
    assert.equal(primera.identidad, IDENTIDAD_DISPOSITIVO);
    assert.equal(primera.requiereUsuarioHumano, false);
    assert.equal(primera.propuesta.tipo, TIPO_ALARMA_MANUAL);
    assert.equal(primera.propuesta.evento, 'sismo');
    assert.equal(primera.propuesta.origen, 'hardware');
    assert.equal(primera.propuesta.clave_idempotencia, 'ev-sismo-1');
    assert.deepEqual(
      primera.propuesta,
      crearPropuestaActivacionHardware({ eventoId: 'ev-sismo-1', evento: 'sismo' }),
      'los literales del núcleo hardware deben coincidir con el contrato canónico',
    );

    const duplicado = decidirDesdeMensajeMqtt(deduplicador, topic, mensaje, FECHA);
    assert.equal(duplicado.tipo, 'IGNORAR_DUPLICADO');
  });

  it('simula la outbox FCM con una sola fila por alarma sin contactar FCM', () => {
    const outbox = new Map();
    const propuesta = crearPropuestaActivacionHardware({ eventoId: 'ev-fcm-1', evento: 'incendio' });

    const registrar = (alarmaId) => {
      if (outbox.has(alarmaId)) return { insertado: false };
      outbox.set(alarmaId, {
        alarma_id: alarmaId,
        tipo: propuesta.tipo,
        titulo: propuesta.titulo,
        mensaje: propuesta.mensaje,
      });
      return { insertado: true };
    };

    assert.equal(registrar(propuesta.clave_idempotencia).insertado, true);
    assert.equal(registrar(propuesta.clave_idempotencia).insertado, false);
    assert.equal(outbox.size, 1);
    assert.deepEqual([...outbox.values()][0], {
      alarma_id: 'ev-fcm-1',
      tipo: TIPO_ALARMA_MANUAL,
      titulo: '⚠️ PRECAUCIÓN',
      mensaje: 'Diríjase con calma a la zona segura y siga las indicaciones del personal autorizado.',
    });
  });
});
