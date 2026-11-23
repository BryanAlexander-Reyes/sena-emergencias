/**
 * Gateway de comandos de alarma para Node/backend.
 * Valida, deduplica por idempotencyKey, publica QoS 0 no retenido y audita.
 * Nunca afirma activación física.
 */

import { ALARM_COMMAND_TOPIC, validarComandoAlarma } from '../src/app/core/data/alarm-command-core.ts';

export class AlarmCommandGateway {
  #publisher;
  #ahora;
  #registrar;
  #publicados = new Map();
  #auditoria = [];

  constructor({ publisher, ahora = () => new Date().toISOString(), registrar = () => {} } = {}) {
    this.#publisher = publisher;
    this.#ahora = ahora;
    this.#registrar = registrar;
  }

  get auditoria() {
    return this.#auditoria.map((entrada) => ({ ...entrada }));
  }

  async publicar(draft) {
    const validacion = this.#validarDraft(draft);
    if (!validacion.valido) {
      return this.#auditarYDevolver(draft, 'error', validacion.motivo, validacion.code);
    }

    const previo = this.#publicados.get(draft.idempotencyKey);
    if (previo !== undefined) {
      const entrada = this.#auditar(draft, 'duplicado_ignorado', 'IDEMPOTENCIA_DUPLICADA');
      return { ...previo, duplicado: true, auditoria: entrada.id };
    }

    if (!this.#publisher || !this.#publisher.connected) {
      return this.#auditarYDevolver(draft, 'error', 'MQTT_NO_CONECTADO', 'SIN_TRANSPORTE');
    }

    try {
      await this.#publisher.publish(draft.topic, JSON.stringify(draft.payload));
      const resultado = {
        fase: 'publicado',
        publicadoEn: this.#ahora(),
        confirmacionFisica: 'no_disponible',
        duplicado: false,
      };
      this.#publicados.set(draft.idempotencyKey, resultado);
      this.#auditar(draft, 'publicado', null);
      return resultado;
    } catch (error) {
      return this.#auditarYDevolver(
        draft,
        'error',
        error instanceof Error ? error.message : 'ERROR_PUBLICACION',
        'FALLO_TRANSPORTE',
      );
    }
  }

  #validarDraft(draft) {
    if (!draft || typeof draft !== 'object') {
      return { valido: false, motivo: 'Draft inexistente.', code: 'DRAFT_INVALIDO' };
    }
    if (typeof draft.idempotencyKey !== 'string' || draft.idempotencyKey.length === 0) {
      return { valido: false, motivo: 'Falta idempotencyKey.', code: 'IDEMPOTENCIA_REQUERIDA' };
    }
    if (draft.topic !== ALARM_COMMAND_TOPIC) {
      return { valido: false, motivo: 'Topic de comando no original.', code: 'TOPICO_NO_PERMITIDO' };
    }
    if (draft.qos !== 0 || draft.retain !== false) {
      return { valido: false, motivo: 'El comando debe ser QoS 0 y no retenido.', code: 'QOS_RETAIN_INVALIDOS' };
    }

    const comando = validarComandoAlarma(draft.payload);
    if (!comando.valido) {
      return { valido: false, motivo: comando.reason, code: comando.code ?? 'COMANDO_INVALIDO' };
    }

    return { valido: true, motivo: '', code: null };
  }

  #auditarYDevolver(draft, fase, error, code) {
    const entrada = this.#auditar(draft, fase, error, code);
    return {
      fase,
      publicadoEn: fase === 'publicado' ? this.#ahora() : null,
      error,
      code,
      confirmacionFisica: 'no_disponible',
      duplicado: false,
      auditoria: entrada.id,
    };
  }

  #auditar(draft, resultado, error, code = null) {
    const entrada = {
      id: `cmd-${this.#auditoria.length + 1}`,
      idempotencyKey: draft?.idempotencyKey ?? null,
      topic: draft?.topic ?? null,
      comando: draft?.payload ?? null,
      resultado,
      error,
      code,
      en: this.#ahora(),
    };
    this.#auditoria.push(entrada);
    this.#registrar(entrada);
    return entrada;
  }
}

/** Publicador sintético para pruebas; nunca abre sockets. */
export class FakeAlarmCommandPublisher {
  #conectado;

  constructor({ conectado = true } = {}) {
    this.#conectado = conectado;
    this.publicaciones = [];
  }

  get connected() {
    return this.#conectado;
  }

  simularDesconexion() {
    this.#conectado = false;
  }

  simularConexion() {
    this.#conectado = true;
  }

  async publish(topic, payload) {
    if (!this.#conectado) throw new Error('MQTT_NO_CONECTADO');
    this.publicaciones.push({ topic, payload, qos: 0, retain: false });
    return { transporte: 'memoria', qos: 0, retain: false };
  }
}
