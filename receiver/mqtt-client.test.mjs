import assert from 'node:assert/strict';
import net from 'node:net';
import { after, describe, it } from 'node:test';

import { TELEMETRY_SUBSCRIPTIONS, TELEMETRY_TOPICS } from '../src/app/core/data/telemetry-core.ts';
import { fixtureMetricasEsp2 } from '../src/app/core/data/telemetry-fixtures.ts';

import { MqttSubscriberClient } from './mqtt-client.mjs';

function codificarLongitud(longitud) {
  const bytes = [];
  let restante = longitud;
  do {
    let byte = restante % 128;
    restante = Math.floor(restante / 128);
    if (restante > 0) byte |= 0x80;
    bytes.push(byte);
  } while (restante > 0);
  return Buffer.from(bytes);
}

function paquetePublicar(topic, payload) {
  const contenidoTopic = Buffer.from(topic, 'utf8');
  const contenido = Buffer.from(JSON.stringify(payload), 'utf8');
  const longitudTopic = Buffer.alloc(2);
  longitudTopic.writeUInt16BE(contenidoTopic.length, 0);
  const cuerpo = Buffer.concat([longitudTopic, contenidoTopic, contenido]);
  return Buffer.concat([Buffer.from([0x30]), codificarLongitud(cuerpo.length), cuerpo]);
}

function leerPaquetes(bufferRef) {
  const paquetes = [];
  let buffer = bufferRef.actual;

  while (buffer.length >= 2) {
    let multiplicador = 1;
    let longitud = 0;
    let posicion = 1;
    let byte;
    do {
      if (posicion >= buffer.length) break;
      byte = buffer[posicion++];
      longitud += (byte & 0x7f) * multiplicador;
      multiplicador *= 128;
    } while ((byte & 0x80) !== 0);

    if ((byte & 0x80) !== 0) break;
    const total = posicion + longitud;
    if (buffer.length < total) break;

    paquetes.push({ tipo: buffer[0] >> 4, cuerpo: buffer.subarray(posicion, total) });
    buffer = buffer.subarray(total);
  }

  bufferRef.actual = buffer;
  return paquetes;
}

function esperar(predicado, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const inicio = Date.now();
    const revisar = () => {
      if (predicado()) return resolve();
      if (Date.now() - inicio > timeoutMs) return reject(new Error('Tiempo de espera agotado.'));
      setTimeout(revisar, 10);
    };
    revisar();
  });
}

describe('cliente MQTT suscriptor (Fase MQTT.2)', () => {
  const sockets = [];
  let broker;
  let cliente;

  after(async () => {
    if (cliente) cliente.close();
    for (const socket of sockets) socket.destroy();
    if (broker) await new Promise((resolve) => broker.close(resolve));
  });

  it('se conecta por TCP simulado, suscribe los 5 topics, recibe PUBLISH y se reconecta', async () => {
    let conexiones = 0;
    const suscripcionesVistas = [];

    broker = net.createServer((socket) => {
      sockets.push(socket);
      conexiones += 1;
      const bufferRef = { actual: Buffer.alloc(0) };
      let conectado = false;
      let suscrito = false;

      socket.on('data', (chunk) => {
        bufferRef.actual = Buffer.concat([bufferRef.actual, chunk]);

        for (const paquete of leerPaquetes(bufferRef)) {
          if (paquete.tipo === 1 && !conectado) {
            conectado = true;
            socket.write(Buffer.from([0x20, 0x02, 0x00, 0x00]));
            continue;
          }

          if (paquete.tipo === 8 && !suscrito) {
            suscrito = true;
            // SUBACK: id 1, cinco QoS concedidos.
            socket.write(Buffer.from([0x90, 0x07, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]));
            suscripcionesVistas.push(paquete.cuerpo.toString('hex'));

            if (conexiones === 1) {
              socket.write(paquetePublicar(TELEMETRY_TOPICS.METRICAS, fixtureMetricasEsp2()));
              setTimeout(() => socket.destroy(), 30);
            }
          }
        }
      });
    });

    await new Promise((resolve) => broker.listen(0, '127.0.0.1', resolve));
    const puerto = broker.address().port;

    const mensajes = [];
    const reconexiones = [];
    const errores = [];

    cliente = new MqttSubscriberClient({
      host: '127.0.0.1',
      port: puerto,
      username: 'usuario-prueba',
      password: 'clave-prueba',
      clientId: 'receptor-test',
      subscriptions: TELEMETRY_SUBSCRIPTIONS,
      createSocket: () => net.connect({ host: '127.0.0.1', port: puerto }),
      secure: false,
      autoReconnect: true,
      reconnectBaseMs: 20,
      maxReconnectMs: 100,
    });

    cliente.on('message', (topic, payload, qos) => mensajes.push({ topic, payload, qos }));
    cliente.on('reconnecting', (detalle) => reconexiones.push(detalle));
    cliente.on('error', (error) => errores.push(error.message));

    cliente.connect();
    await esperar(() => mensajes.length === 1);
    await esperar(() => conexiones >= 2);

    assert.equal(mensajes[0].topic, TELEMETRY_TOPICS.METRICAS);
    assert.equal(mensajes[0].qos, 0);
    assert.equal(JSON.parse(mensajes[0].payload.toString('utf8')).placa, 'placa2');
    assert.equal(suscripcionesVistas.length, 2);
    assert.ok(reconexiones.length >= 1);
    assert.equal(reconexiones[0].intento, 1);
    assert.deepEqual(errores, []);
    assert.equal(cliente.connected, true);
  });
});
