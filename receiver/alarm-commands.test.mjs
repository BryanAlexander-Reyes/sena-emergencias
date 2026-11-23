import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';

import {
  ALARM_COMMAND_TOPIC,
  ALARM_INCIDENTES,
  ESP2_ALARM_PATTERNS,
  crearComandoActivacion,
  crearComandoCierreSimulacro,
  crearComandoDesactivacion,
  serializarComandoAlarma,
  validarComandoAlarma,
} from '../src/app/core/data/alarm-command-core.ts';
import {
  VENTANA_CIERRE_SIMULACRO_MS,
  normalizarEventoHardware,
} from '../src/app/core/data/hardware-event-core.ts';
import { MQTT_QOS, MQTT_TOPICS } from '../src/app/core/data/mqtt-contracts.ts';

import { AlarmCommandGateway, FakeAlarmCommandPublisher } from './alarm-command-gateway.mjs';
import { HardwareAlarmObserver } from './hardware-alarm-observer.mjs';
import { MqttAlarmCommandPublisher, paqueteConnect, paquetePublish } from './alarm-command-publisher.mjs';

const PATRONES_ESPERADOS = {
  incendio: [150, 150],
  sismo: [400, 400],
  impacto: [100, 100],
  simulacro: [700, 700],
  emergencia: [250, 250],
};

function eventoEsp1(incidente, eventoId, estado = true, secuencia = 1) {
  const evidencia =
    incidente === 'incendio'
      ? { origen: 'temperatura_alta', temperatura_c: 42, umbral_c: 40, rearme_inferior_a_c: 37 }
      : incidente === 'sismo' || incidente === 'impacto'
        ? {
            pico_m_s2: 4.2,
            rms_m_s2: 1.3,
            actividad_porcentaje: 55,
            factor_cresta: 3.1,
            ventana_valida: true,
          }
        : { origen: 'touch_o_control_local' };

  return {
    version: 1,
    placa: 'placa1',
    sala: 'riesgo_bajo',
    sesion: 'sesion-prueba',
    secuencia,
    tipo: 'evento',
    tiempo_activo_ms: 1000,
    fecha: null,
    evento_id: eventoId,
    evento: incidente,
    estado,
    evidencia,
  };
}

function topicEvento(incidente) {
  return `sena/casanare/placa1/eventos/${incidente}`;
}

function evidenciaCierre(eventoId, recibidoEn) {
  return {
    eventoId,
    topic: ALARM_COMMAND_TOPIC,
    comando: { action: false, alcance: 'simulacro', motivo: 'falsa_alarma' },
    recibidoEn,
    placa: 'placa1',
  };
}

class SocketFalso extends EventEmitter {
  constructor() {
    super();
    this.escritos = [];
    this.destroyed = false;
  }

  write(buffer, callback) {
    this.escritos.push(Buffer.from(buffer));
    if (callback) callback();
    return true;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit('close');
  }
}

describe('MQTT.3 — comandos del topic original del ESP32 2', () => {
  it('construye los cinco comandos de activación con el patrón físico correcto', () => {
    assert.equal(ALARM_COMMAND_TOPIC, MQTT_TOPICS.ESP2_COMANDOS_ALARMA);
    assert.equal(MQTT_QOS.PUBLICACION_DEFAULT, 0);
    assert.deepEqual(ALARM_INCIDENTES, ['incendio', 'sismo', 'impacto', 'simulacro', 'emergencia']);

    for (const incidente of ALARM_INCIDENTES) {
      const draft = crearComandoActivacion(incidente, `act-${incidente}`, '2026-11-23T12:00:00.000Z');

      assert.equal(draft.topic, 'sena/casanare/placa2/comandos/alarma');
      assert.equal(draft.qos, 0);
      assert.equal(draft.retain, false);
      assert.deepEqual(draft.payload, { action: true, evento: incidente });
      assert.equal(serializarComandoAlarma(draft), JSON.stringify({ action: true, evento: incidente }));

      const patron = ESP2_ALARM_PATTERNS[incidente];
      assert.equal(patron.buzzerGpio, 16);
      assert.deepEqual(patron.ledsVerdes, [18, 19, 23]);
      assert.deepEqual([patron.encendidoMs, patron.apagadoMs], PATRONES_ESPERADOS[incidente]);
      assert.ok(patron.firmwareReferencias.length >= 2);
    }
  });

  it('construye apagado general y cierre de simulacro sin combos inválidos', () => {
    const general = crearComandoDesactivacion({ idempotencyKey: 'off-1' });
    assert.deepEqual(general.payload, { action: false, alcance: 'todas' });

    const simulacro = crearComandoCierreSimulacro('off-2', true);
    assert.deepEqual(simulacro.payload, { action: false, alcance: 'simulacro', motivo: 'falsa_alarma' });

    const simulacroSinMotivo = crearComandoCierreSimulacro('off-3', false);
    assert.deepEqual(simulacroSinMotivo.payload, { action: false, alcance: 'simulacro' });

    assert.throws(() => crearComandoDesactivacion({ idempotencyKey: 'x', motivo: 'falsa_alarma' }), /simulacro/);
    assert.throws(() => crearComandoActivacion('volcan', 'x'), /Incidente no reconocido/);
    assert.throws(() => crearComandoActivacion('incendio', ''), /idempotencia/);
  });

  it('valida comandos como el parser de ESP2', () => {
    assert.equal(validarComandoAlarma({ action: true, evento: 'incendio' }).valido, true);
    assert.equal(validarComandoAlarma({ action: true }).valido, false);
    assert.equal(validarComandoAlarma({ action: true, evento: 'volcan' }).valido, false);
    assert.equal(validarComandoAlarma({ action: false }).valido, true);
    assert.deepEqual(validarComandoAlarma({ action: false }).payload, { action: false, alcance: 'todas' });
    assert.equal(validarComandoAlarma({ action: false, alcance: 'otro' }).valido, false);
    assert.equal(validarComandoAlarma({ action: false, motivo: 'falsa_alarma' }).valido, false);
    assert.equal(
      validarComandoAlarma({ action: false, alcance: 'simulacro', motivo: 'falsa_alarma' }).valido,
      true,
    );
  });

  it('deduplica por idempotencyKey y registra auditoría', () => {
    const publisher = new FakeAlarmCommandPublisher();
    const registros = [];
    const gateway = new AlarmCommandGateway({ publisher, registrar: (entrada) => registros.push(entrada) });
    const draft = crearComandoActivacion('emergencia', 'idempotencia-unica');

    const primera = gateway.publicar(draft);
    return primera.then((resultadoUno) => {
      return gateway.publicar(draft).then((resultadoDos) => {
        assert.equal(resultadoUno.fase, 'publicado');
        assert.equal(resultadoDos.fase, 'publicado');
        assert.equal(resultadoDos.duplicado, true);
        assert.equal(publisher.publicaciones.length, 1);
        assert.equal(gateway.auditoria.length, 2);
        assert.equal(gateway.auditoria[1].resultado, 'duplicado_ignorado');
        assert.equal(registros.length, 2);
        assert.equal(resultadoUno.confirmacionFisica, 'no_disponible');
      });
    });
  });

  it('no publica cuando el transporte está caído y permite reintento con la misma clave', async () => {
    const publisher = new FakeAlarmCommandPublisher({ conectado: false });
    const gateway = new AlarmCommandGateway({ publisher });
    const draft = crearComandoActivacion('sismo', 'reintento-1');

    const fallido = await gateway.publicar(draft);
    assert.equal(fallido.fase, 'error');
    assert.equal(fallido.error, 'MQTT_NO_CONECTADO');
    assert.equal(publisher.publicaciones.length, 0);

    publisher.simularConexion();
    const exitoso = await gateway.publicar(draft);
    assert.equal(exitoso.fase, 'publicado');
    assert.equal(publisher.publicaciones.length, 1);
  });

  it('publica QoS 0 no retenido en el topic original mediante socket simulado', async () => {
    const socket = new SocketFalso();
    const publisher = new MqttAlarmCommandPublisher({
      host: 'broker.invalido.local',
      port: 8883,
      username: 'sin-secreto',
      password: 'sin-secreto',
      clientId: 'publisher-test',
      createSocket: () => socket,
      secure: false,
    });

    publisher.connect();
    socket.emit('connect');
    socket.emit('data', Buffer.from([0x20, 0x02, 0x00, 0x00]));

    assert.equal(publisher.connected, true);
    assert.deepEqual(socket.escritos[0], paqueteConnect({
      clientId: 'publisher-test',
      username: 'sin-secreto',
      password: 'sin-secreto',
      keepAliveSeconds: 30,
    }));

    const draft = crearComandoDesactivacion({ idempotencyKey: 'off-socket', alcance: 'simulacro' });
    const resultado = await publisher.publish(draft.topic, serializarComandoAlarma(draft));

    assert.deepEqual(resultado, { transporte: 'socket', qos: 0, retain: false });
    assert.deepEqual(socket.escritos[1], paquetePublish(ALARM_COMMAND_TOPIC, '{"action":false,"alcance":"simulacro"}'));
    assert.equal(socket.escritos[1][0], 0x30);

    socket.emit('close');
    assert.equal(publisher.connected, false);
    await assert.rejects(() => publisher.publish(ALARM_COMMAND_TOPIC, '{}'), /MQTT_NO_CONECTADO/);
    publisher.close();
  });

  it('admite dos clientes concurrentes con claves distintas sin duplicar cada publicación', async () => {
    const publisher = new FakeAlarmCommandPublisher();
    const clienteUno = new AlarmCommandGateway({ publisher });
    const clienteDos = new AlarmCommandGateway({ publisher });

    await Promise.all([
      clienteUno.publicar(crearComandoActivacion('incendio', 'cliente-1')),
      clienteDos.publicar(crearComandoActivacion('impacto', 'cliente-2')),
    ]);

    assert.equal(publisher.publicaciones.length, 2);
    assert.deepEqual(
      publisher.publicaciones.map((entrada) => JSON.parse(entrada.payload).evento),
      ['incendio', 'impacto'],
    );
    assert.equal(clienteUno.auditoria.length, 1);
    assert.equal(clienteDos.auditoria.length, 1);
  });
});

describe('MQTT.3 — eventos touch/incendio/sismo/impacto de ESP32 1', () => {
  it('normaliza y crea incidentes hardware para los cinco eventos', () => {
    const observer = new HardwareAlarmObserver();

    for (const [indice, incidente] of ALARM_INCIDENTES.entries()) {
      const decision = observer.ingest(
        topicEvento(incidente),
        eventoEsp1(incidente, `ev-${incidente}`, true, indice + 1),
        '2026-11-23T12:00:00.000Z',
      );

      assert.equal(decision.tipo, 'CREAR_INCIDENTE_HARDWARE');
      assert.equal(decision.origen, 'hardware');
      assert.equal(decision.idempotencia, `ev-${incidente}`);
      assert.equal(decision.evento.placa, 'placa1');
      assert.equal(decision.evento.mecanismo, incidente === 'incendio' ? 'sensor_temperatura' : incidente === 'sismo' || incidente === 'impacto' ? 'sensor_movimiento' : 'touch');
    }
  });

  it('ignora duplicados por evento_id', () => {
    const observer = new HardwareAlarmObserver();
    const evento = eventoEsp1('emergencia', 'ev-duplicada');

    assert.equal(observer.ingest(topicEvento('emergencia'), evento).tipo, 'CREAR_INCIDENTE_HARDWARE');
    const duplicado = observer.ingest(topicEvento('emergencia'), evento);
    assert.equal(duplicado.tipo, 'IGNORAR_DUPLICADO');
    assert.equal(duplicado.eventoId, 'ev-duplicada');
  });

  it('estado:false solo finaliza detección y nunca cierra emergencia real', () => {
    const observer = new HardwareAlarmObserver();
    observer.ingest(topicEvento('emergencia'), eventoEsp1('emergencia', 'ev-emergencia'));

    const decision = observer.ingest(
      topicEvento('emergencia'),
      eventoEsp1('emergencia', 'ev-emergencia', false, 2),
    );

    assert.equal(decision.tipo, 'IGNORAR_DUPLICADO');
  });

  it('un evento estado:false nuevo no cierra la alarma aunque exista detección previa', () => {
    const observer = new HardwareAlarmObserver();
    const decision = observer.ingest(
      topicEvento('emergencia'),
      eventoEsp1('emergencia', 'ev-fin-sin-activacion', false),
    );

    assert.equal(decision.tipo, 'FIN_DETECCION');
    assert.equal(decision.noFinalizaEmergenciaReal, true);
    assert.equal(decision.requiereEvidenciaCierre, false);
  });

  it('sincroniza cierre de simulacro solo con evidencia del comando action:false de ESP1', () => {
    const observer = new HardwareAlarmObserver();
    const inicio = '2026-11-23T12:00:00.000Z';
    const fin = '2026-11-23T12:00:03.000Z';

    observer.ingest(topicEvento('simulacro'), eventoEsp1('simulacro', 'ev-simulacro'), inicio);

    const cierre = observer.registrarCierreSimulacro(evidenciaCierre('ev-simulacro', fin));
    assert.equal(cierre.tipo, 'SINCRONIZAR_CIERRE_SIMULACRO');
    assert.equal(cierre.motivo, 'cierre_explicito_esp1');
    assert.equal(cierre.evidencia.comando.action, false);
    assert.equal(cierre.evidencia.comando.alcance, 'simulacro');

    const duplicado = observer.registrarCierreSimulacro(evidenciaCierre('ev-simulacro', fin));
    assert.equal(duplicado.tipo, 'IGNORAR_DUPLICADO');

    const finDeteccion = observer.ingest(
      topicEvento('simulacro'),
      eventoEsp1('simulacro', 'ev-simulacro', false, 2),
      fin,
    );
    assert.equal(finDeteccion.tipo, 'IGNORAR_DUPLICADO');
  });

  it('rechaza evidencia fuera de ventana, sin activación o con comando inválido', () => {
    const observer = new HardwareAlarmObserver();
    const inicio = '2026-11-23T12:00:00.000Z';
    observer.ingest(topicEvento('simulacro'), eventoEsp1('simulacro', 'ev-vieja'), inicio);

    const fueraDeVentana = observer.registrarCierreSimulacro(
      evidenciaCierre(
        'ev-vieja',
        new Date(Date.parse(inicio) + VENTANA_CIERRE_SIMULACRO_MS + 1).toISOString(),
      ),
    );
    assert.equal(fueraDeVentana.tipo, 'EVIDENCIA_RECHAZADA');
    assert.equal(fueraDeVentana.code, 'EVIDENCIA_FUERA_DE_VENTANA');

    const sinActivacion = observer.registrarCierreSimulacro(evidenciaCierre('ev-inexistente', inicio));
    assert.equal(sinActivacion.code, 'EVIDENCIA_SIN_ACTIVACION');

    const comandoInvalido = observer.registrarCierreSimulacro({
      ...evidenciaCierre('ev-vieja', inicio),
      comando: { action: false, alcance: 'todas' },
    });
    assert.equal(comandoInvalido.code, 'EVIDENCIA_COMANDO_INVALIDO');
  });

  it('rechaza topic que no coincide con el evento y mensajes inválidos', () => {
    const observer = new HardwareAlarmObserver();
    const invalido = observer.ingest(
      topicEvento('incendio'),
      eventoEsp1('sismo', 'ev-incoherente'),
    );
    assert.equal(invalido.tipo, 'IGNORAR_INVALIDO');
    assert.equal(invalido.code, 'CONTRATO_FIRMWARE_INVALIDO');

    const normalizado = normalizarEventoHardware(
      topicEvento('sismo'),
      eventoEsp1('sismo', 'ev-valido'),
      '2026-11-23T12:00:00.000Z',
    );
    assert.equal(normalizado.valido, true);
  });
});
