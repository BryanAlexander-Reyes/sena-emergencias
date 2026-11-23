/**
 * Traduce el stream MQTT.2 en decisiones de alarma hardware sin tocar
 * ManualAlarmService ni el modal aprobado. La integración con esos módulos
 * requiere autorización explícita; aquí solo se produce la decisión auditada.
 */

import { computed, effect, inject, Injectable, signal } from '@angular/core';

import {
  crearDeduplicadorEventosHardware,
  decidirDesdeMensajeMqtt,
  PREFIJO_EVENTOS_ESP1,
  type DeduplicadorEventosHardware,
  type EvidenciaCierreSimulacro,
  type HardwareEventDecision,
} from '../data/hardware-event-core';
import type { MqttEventoMensaje } from '../data/mqtt-contracts';

import { TelemetryService } from './telemetry.service';

@Injectable({ providedIn: 'root' })
export class HardwareAlarmEventService {
  private readonly telemetry = inject(TelemetryService);
  private readonly deduplicador: DeduplicadorEventosHardware = crearDeduplicadorEventosHardware();
  private readonly decisionesState = signal<readonly HardwareEventDecision[]>([]);

  readonly decisiones = this.decisionesState.asReadonly();
  readonly ultimaDecision = computed<HardwareEventDecision | null>(() => {
    const lista = this.decisionesState();
    return lista.length === 0 ? null : (lista[lista.length - 1] ?? null);
  });

  constructor() {
    effect(() => {
      const payload = this.telemetry.stream();
      if (payload === null) return;

      const evento = payload.snapshot.placa1.ultimoEvento;
      if (evento === null) return;

      this.procesarMensaje(evento, payload.receivedAt);
    });
  }

  /** La UI puede suscribirse al stream MQTT.2 sin abrir otra conexión. */
  start(): void {
    this.telemetry.start();
  }

  stop(): void {
    this.telemetry.stop();
  }

  procesarMensaje(evento: MqttEventoMensaje, recibidoEn: string): HardwareEventDecision {
    // TelemetryService no expone el topic original; se reconstruye desde el
    // contrato canónico y la validación exige que nombre y evento coincidan.
    const topic = `${PREFIJO_EVENTOS_ESP1}${evento.evento}`;
    return this.registrar(decidirDesdeMensajeMqtt(this.deduplicador, topic, evento, recibidoEn));
  }

  /**
   * El receptor MQTT.2 es solo lectura y no suscribe el topic de comandos.
   * Esta evidencia debe ser aportada por un observador autorizado del backend;
   * sin ella, estado:false nunca cierra una alarma.
   */
  registrarCierreSimulacro(evidencia: EvidenciaCierreSimulacro): HardwareEventDecision {
    return this.registrar(this.deduplicador.registrarEvidenciaCierre(evidencia));
  }

  private registrar(decision: HardwareEventDecision): HardwareEventDecision {
    this.decisionesState.update((lista) => [...lista, decision]);
    return decision;
  }
}
