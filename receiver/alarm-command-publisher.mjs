/**
 * Publicador MQTT 3.1.1 de comandos de alarma, SEPARADO del receptor MQTT.2.
 *
 * - No reutiliza MqttSubscriberClient (ese módulo no expone publish()).
 * - Solo escribe en `sena/casanare/placa2/comandos/alarma` con QoS 0 y retain=false.
 * - No contiene credenciales: se inyectan desde el entorno del proceso.
 * - Ninguna prueba de este repositorio conecta con EMQX real.
 */

import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import tls from 'node:tls';

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

export function paqueteConnect({ clientId, username, password, keepAliveSeconds = 30 }) {
  const nombre = encodeString('MQTT');
  const cabecera = Buffer.from([0x04, 0xc2, keepAliveSeconds >> 8, keepAliveSeconds & 0xff]);
  const carga = Buffer.concat([encodeString(clientId), encodeString(username), encodeString(password)]);
  const contenido = Buffer.concat([nombre, cabecera, carga]);
  return Buffer.concat([Buffer.from([0x10]), encodeLength(contenido.length), contenido]);
}

/** QoS 0, retain=false: fixed header 0x30, sin packet identifier. */
export function paquetePublish(topic, payload) {
  const contenido = Buffer.concat([encodeString(topic), Buffer.from(payload, 'utf8')]);
  return Buffer.concat([Buffer.from([0x30]), encodeLength(contenido.length), contenido]);
}

export class MqttAlarmCommandPublisher extends EventEmitter {
  #socket = null;
  #buffer = Buffer.alloc(0);
  #keepAliveTimer = null;
  #conectado = false;
  #cerrado = false;

  constructor({
    host,
    port,
    username,
    password,
    clientId,
    caFile,
    createSocket,
    secure = true,
    keepAliveSeconds = 30,
  }) {
    super();

    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;
    this.clientId = clientId;
    this.keepAliveSeconds = keepAliveSeconds;
    this.secure = secure;
    this.ca = caFile ? readFileSync(caFile) : undefined;
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
    return this.#conectado;
  }

  connect() {
    if (this.#socket || this.#cerrado) return;
    this.#buffer = Buffer.alloc(0);

    const socket = this.createSocket();
    this.#socket = socket;

    let abierto = false;
    const alAbrir = () => {
      if (abierto) return;
      abierto = true;
      socket.write(
        paqueteConnect({
          clientId: this.clientId,
          username: this.username,
          password: this.password,
          keepAliveSeconds: this.keepAliveSeconds,
        }),
      );
    };

    socket.once(this.secure ? 'secureConnect' : 'connect', alAbrir);
    socket.on('data', (chunk) => this.#onData(chunk));
    socket.on('error', (error) => this.emit('error', error));
    socket.once('close', () => this.#onClose());
  }

  close() {
    this.#cerrado = true;
    this.#limpiar();
    if (this.#socket) this.#socket.destroy();
  }

  async publish(topic, payload) {
    if (!this.#conectado || this.#socket === null || this.#socket.destroyed) {
      throw new Error('MQTT_NO_CONECTADO');
    }

    const datos = paquetePublish(topic, payload);
    await new Promise((resolve, reject) => {
      this.#socket.write(datos, (error) => (error ? reject(error) : resolve()));
    });

    // QoS 0 no tiene PUBACK: esto significa "entregado al socket TLS",
    // no confirmación del broker y mucho menos activación física del buzzer.
    return { transporte: 'socket', qos: 0, retain: false };
  }

  #limpiar() {
    this.#conectado = false;
    if (this.#keepAliveTimer) clearInterval(this.#keepAliveTimer);
    this.#keepAliveTimer = null;
    this.#buffer = Buffer.alloc(0);
  }

  #onClose() {
    this.#limpiar();
    this.#socket = null;
    this.emit('close');
  }

  #onData(chunk) {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);

    while (this.#buffer.length >= 2) {
      const tipo = this.#buffer[0] >> 4;
      let multiplicador = 1;
      let longitud = 0;
      let posicion = 1;
      let byte;

      do {
        if (posicion >= this.#buffer.length) return;
        byte = this.#buffer[posicion++];
        longitud += (byte & 0x7f) * multiplicador;
        multiplicador *= 128;
      } while ((byte & 0x80) !== 0);

      const total = posicion + longitud;
      if (this.#buffer.length < total) return;
      const cuerpo = this.#buffer.subarray(posicion, total);
      this.#buffer = this.#buffer.subarray(total);

      if (tipo === 2) {
        if (cuerpo.length < 2 || cuerpo[1] !== 0) {
          this.emit('error', new Error(`CONNACK rechazado (código ${cuerpo[1] ?? 'desconocido'}).`));
          if (this.#socket) this.#socket.destroy();
          return;
        }

        this.#conectado = true;
        this.#keepAliveTimer = setInterval(() => {
          if (this.#socket && !this.#socket.destroyed) this.#socket.write(Buffer.from([0xc0, 0x00]));
        }, 15_000);
        this.emit('connect');
      }
      // PINGRESP y PUBACK (QoS>0, no usado) se ignoran.
    }
  }
}
