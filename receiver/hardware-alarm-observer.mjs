/** Adaptador Node para eventos hardware sintéticos; sin Supabase y sin red. */

import {
  crearDeduplicadorEventosHardware,
  decidirDesdeMensajeMqtt,
} from '../src/app/core/data/hardware-event-core.ts';

export class HardwareAlarmObserver {
  #deduplicador;
  #decisiones = [];

  constructor({ limite = 16 } = {}) {
    this.#deduplicador = crearDeduplicadorEventosHardware(limite);
  }

  get decisiones() {
    return this.#decisiones.map((decision) => ({ ...decision }));
  }

  ingest(topic, payload, recibidoEn = new Date().toISOString()) {
    const decision = decidirDesdeMensajeMqtt(this.#deduplicador, topic, payload, recibidoEn);
    this.#decisiones.push(decision);
    return decision;
  }

  registrarCierreSimulacro(evidencia) {
    const decision = this.#deduplicador.registrarEvidenciaCierre(evidencia);
    this.#decisiones.push(decision);
    return decision;
  }
}
