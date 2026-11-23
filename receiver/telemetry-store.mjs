/** Estado en memoria del receptor. Sin persistencia, sin Supabase. */

import {
  applyTelemetryEnvelope,
  emptySnapshot,
  TELEMETRY_MAX_PAYLOAD_BYTES,
} from '../src/app/core/data/telemetry-core.ts';

export class TelemetryStore {
  #snapshot = emptySnapshot();
  #listeners = new Set();
  #demo;

  constructor({ demo = false } = {}) {
    this.#demo = demo;
  }

  get demo() {
    return this.#demo;
  }

  get snapshot() {
    return this.#snapshot;
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  payload() {
    return {
      snapshot: this.#snapshot,
      demo: this.#demo,
      receivedAt: new Date().toISOString(),
    };
  }

  setBridge(connected, error = null) {
    const bridge = this.#snapshot.bridge;
    if (bridge.connected === connected && bridge.lastError === error) return;

    this.#snapshot = {
      ...this.#snapshot,
      bridge: { connected, lastError: error, updatedAt: new Date().toISOString() },
    };
    this.#emit();
  }

  ingest(topic, payload) {
    const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');

    if (bytes.length === 0) {
      this.#rechazar('Payload MQTT vacío.');
      return false;
    }

    if (bytes.length > TELEMETRY_MAX_PAYLOAD_BYTES) {
      this.#rechazar('Payload MQTT demasiado grande.');
      return false;
    }

    let parsed;
    try {
      parsed = JSON.parse(bytes.toString('utf8'));
    } catch {
      this.#rechazar('JSON MQTT inválido.');
      return false;
    }

    const resultado = applyTelemetryEnvelope(this.#snapshot, topic, parsed, new Date().toISOString());
    if (!resultado.accepted) {
      this.#rechazar(resultado.reason);
      return false;
    }

    this.#snapshot = resultado.snapshot;
    this.#emit();
    return true;
  }

  #rechazar(motivo) {
    this.setBridge(this.#snapshot.bridge.connected, motivo.slice(0, 200));
  }

  #emit() {
    const payload = this.payload();
    for (const listener of this.#listeners) listener(payload);
  }
}
