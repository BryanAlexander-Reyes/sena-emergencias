/**
 * Cliente MQTT 3.1.1 mínimo sobre TLS (Node nativo, sin dependencias).
 *
 * Solo soporta lo que necesita un SUSCRIPTOR: CONNECT, SUBSCRIBE, PUBLISH
 * (QoS 0/1), PINGREQ/PUBACK. No expone publish(): en esta fase no se envían
 * comandos al broker ni a los ESP32.
 */

import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import tls from 'node:tls';

import { TELEMETRY_MAX_PAYLOAD_BYTES } from '../src/app/core/data/telemetry-core.ts';

const PINGREQ = Buffer.from([0xc0, 0x00]);

function encodeLength(length) {
  const bytes = [];
  let restante = length;

  do {
    let byte = restante % 128;
    restante = Math.floor(restante / 128);
    if (restante > 0) byte |= 0x80;
    bytes.push(byte);
  } while (restante > 0);

  return Buffer.from(bytes);
}

function encodeString(texto) {
  const contenido = Buffer.from(texto, 'utf8');
  const longitud = Buffer.alloc(2);
  longitud.writeUInt16BE(contenido.length, 0);
  return Buffer.concat([longitud, contenido]);
}

function connectPacket({ clientId, username, password, keepAliveSeconds }) {
  const nombre = encodeString('MQTT');
  const cabecera = Buffer.from([0x04, 0xc2, keepAliveSeconds >> 8, keepAliveSeconds & 0xff]);
  const payload = Buffer.concat([encodeString(clientId), encodeString(username), encodeString(password)]);
  const contenido = Buffer.concat([nombre, cabecera, payload]);
  return Buffer.concat([Buffer.from([0x10]), encodeLength(contenido.length), contenido]);
}

function subscribePacket(subscriptions, packetId = 1) {
  const partes = [Buffer.alloc(2)];
  partes[0].writeUInt16BE(packetId, 0);

  for (const { topic, qos } of subscriptions) {
    partes.push(encodeString(topic), Buffer.from([qos]));
  }

  const contenido = Buffer.concat(partes);
  return Buffer.concat([Buffer.from([0x82]), encodeLength(contenido.length), contenido]);
}

function acknowledgePacket(packetId) {
  const contenido = Buffer.alloc(2);
  contenido.writeUInt16BE(packetId, 0);
  return Buffer.concat([Buffer.from([0x40]), encodeLength(2), contenido]);
}

export class MqttSubscriberClient extends EventEmitter {
  #socket = null;
  #buffer = Buffer.alloc(0);
  #keepAliveTimer = null;
  #reconnectTimer = null;
  #closed = false;
  #connected = false;
  #intentos = 0;

  constructor({
    host,
    port,
    username,
    password,
    clientId,
    caFile,
    subscriptions,
    createSocket,
    secure = true,
    autoReconnect = true,
    maxReconnectMs = 30_000,
    reconnectBaseMs = 1000,
  }) {
    super();

    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;
    this.clientId = clientId;
    this.ca = caFile ? readFileSync(caFile) : undefined;
    this.subscriptions = subscriptions;
    this.secure = secure;
    this.autoReconnect = autoReconnect;
    this.maxReconnectMs = maxReconnectMs;
    this.reconnectBaseMs = reconnectBaseMs;
    this.keepAliveSeconds = 30;
    this.createSocket =
      createSocket ??
      (() =>
        tls.connect({
          host: this.host,
          port: this.port,
          servername: this.host,
          rejectUnauthorized: true,
          ...(this.ca ? { ca: this.ca } : {}),
        }));
  }

  get connected() {
    return this.#connected;
  }

  connect() {
    if (this.#socket || this.#closed) return;

    this.#buffer = Buffer.alloc(0);

    const socket = this.createSocket();
    this.#socket = socket;

    let abierto = false;
    const alAbrir = () => {
      if (abierto) return;
      abierto = true;
      this.#onOpen();
    };

    socket.once(this.secure ? 'secureConnect' : 'connect', alAbrir);
    socket.on('data', (chunk) => this.#onData(chunk));
    socket.on('error', (error) => this.emit('error', error));
    socket.once('close', () => this.#onClose());
  }

  close() {
    this.#closed = true;
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    this.#limpiar();
    if (this.#socket) this.#socket.destroy();
  }

  #onOpen() {
    this.#socket.write(
      connectPacket({
        clientId: this.clientId,
        username: this.username,
        password: this.password,
        keepAliveSeconds: this.keepAliveSeconds,
      }),
    );
  }

  #limpiar() {
    this.#connected = false;
    if (this.#keepAliveTimer) clearInterval(this.#keepAliveTimer);
    this.#keepAliveTimer = null;
    this.#buffer = Buffer.alloc(0);
  }

  #onClose() {
    this.#limpiar();
    this.#socket = null;
    this.emit('close');

    if (this.#closed || !this.autoReconnect) return;

    this.#intentos += 1;
    const espera = Math.min(this.reconnectBaseMs * 2 ** Math.min(this.#intentos - 1, 5), this.maxReconnectMs);
    this.emit('reconnecting', { delayMs: espera, intento: this.#intentos });
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.connect();
    }, espera);
    this.#reconnectTimer.unref?.();
  }

  #fallar(mensaje) {
    this.emit('error', new Error(mensaje));
    if (this.#socket) this.#socket.destroy();
  }

  #onData(chunk) {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);

    while (this.#buffer.length >= 2) {
      const primerByte = this.#buffer[0];
      let multiplicador = 1;
      let longitud = 0;
      let posicion = 1;
      let byte;

      do {
        if (posicion >= this.#buffer.length) return;
        byte = this.#buffer[posicion++];
        longitud += (byte & 0x7f) * multiplicador;
        multiplicador *= 128;
        if (multiplicador > 128 * 128 * 128) {
          this.#fallar('Longitud restante MQTT inválida.');
          return;
        }
      } while ((byte & 0x80) !== 0);

      const total = posicion + longitud;
      if (this.#buffer.length < total) return;

      const cuerpo = this.#buffer.subarray(posicion, total);
      this.#buffer = this.#buffer.subarray(total);
      this.#onPacket(primerByte, cuerpo);
    }
  }

  #onPacket(primerByte, cuerpo) {
    const tipo = primerByte >> 4;

    if (tipo === 2) {
      if (cuerpo.length < 2 || cuerpo[1] !== 0) {
        this.#fallar(`CONNACK rechazado (código ${cuerpo[1] ?? 'desconocido'}).`);
        return;
      }

      this.#connected = true;
      this.#intentos = 0;
      this.#socket.write(subscribePacket(this.subscriptions));
      this.#keepAliveTimer = setInterval(() => {
        if (this.#socket && !this.#socket.destroyed) this.#socket.write(PINGREQ);
      }, 15_000);
      this.emit('connect');
      return;
    }

    if (tipo === 9) {
      const rechazos = Array.from(cuerpo.slice(1)).filter((codigo) => codigo === 0x80).length;
      if (rechazos > 0) this.#fallar('El broker rechazó alguna suscripción.');
      return;
    }

    if (tipo === 3) {
      const qos = (primerByte >> 1) & 0x03;
      if (cuerpo.length < 2) return;

      const longitudTopic = cuerpo.readUInt16BE(0);
      let posicion = 2 + longitudTopic;
      if (posicion > cuerpo.length) return;

      const topic = cuerpo.subarray(2, posicion).toString('utf8');
      let packetId = 0;

      if (qos > 0) {
        if (posicion + 2 > cuerpo.length) return;
        packetId = cuerpo.readUInt16BE(posicion);
        posicion += 2;
      }

      const payload = cuerpo.subarray(posicion);
      if (payload.length > TELEMETRY_MAX_PAYLOAD_BYTES) {
        this.emit('error', new Error(`Payload MQTT demasiado grande en ${topic}.`));
        return;
      }

      if (qos === 1) this.#socket.write(acknowledgePacket(packetId));
      this.emit('message', topic, payload, qos);
      return;
    }

    // 4 PUBACK, 13 PINGRESP: confirmaciones sin acción requerida.
    // 14 DISCONNECT: el cierre del socket dispara la reconexión.
  }
}
