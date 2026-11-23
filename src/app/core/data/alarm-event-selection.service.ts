/**
 * MQTT.4 — Selector local de evento de alarma.
 *
 * No modifica ManualAlarmService ni Inicio. Guarda SOLO la selección explícita
 * del usuario: no elige un evento por defecto y no publica nada. Admin e
 * Instructor ven los cinco eventos; Aprendiz no tiene opciones de activación.
 */

import { computed, Injectable, signal } from '@angular/core';

import {
  ALARM_INCIDENTES,
  eventosPermitidosParaRol,
  esAlarmaIncidente,
  esRolOperadorAlarma,
  type ActorRol,
  type AlarmaIncidente,
} from './alarm-incident-contract';

export const OPCIONES_SELECTOR_ALARMA: readonly AlarmaIncidente[] = ALARM_INCIDENTES;

@Injectable({ providedIn: 'root' })
export class AlarmEventSelectionService {
  private readonly eventoState = signal<AlarmaIncidente | null>(null);

  /** Ningún evento queda preseleccionado al crear el servicio. */
  readonly evento = this.eventoState.asReadonly();
  readonly seleccionado = computed(() => this.evento() !== null);

  /** Opciones visibles para Admin e Instructor. */
  readonly opciones = computed<readonly AlarmaIncidente[]>(() => OPCIONES_SELECTOR_ALARMA);

  eventosPara(rol: ActorRol): readonly AlarmaIncidente[] {
    return eventosPermitidosParaRol(rol);
  }

  /**
   * Registra una selección explícita. Si se aporta el rol, se rechaza cualquier
   * intento de selección de un rol sin permisos de alarma.
   */
  seleccionar(evento: unknown, rol?: ActorRol): boolean {
    if (!esAlarmaIncidente(evento)) return false;
    if (rol !== undefined && !esRolOperadorAlarma(rol)) return false;
    if (rol !== undefined && !this.eventosPara(rol).includes(evento)) return false;
    this.eventoState.set(evento);
    return true;
  }

  /** Se limpia tras activar, cancelar o cambiar de identidad validada. */
  limpiar(): void {
    this.eventoState.set(null);
  }
}
