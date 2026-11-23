/** Servicio local de comandos de alarma. No modifica el flujo de alarma manual. */

import { computed, inject, Injectable, signal } from '@angular/core';

import {
  AlarmCommandError,
  crearComandoActivacion,
  crearComandoCierreSimulacro,
  crearComandoDesactivacion,
  estadoError,
  estadoPendiente,
  estadoPublicado,
  vistaComandoAlarma,
  type AlarmCommandDraft,
  type AlarmCommandState,
  type AlarmCommandView,
  type AlarmConfirmacionFisica,
  type AlarmIncidente,
} from '../data/alarm-command-core';
import { ALARM_COMMAND_GATEWAY, NoopAlarmCommandGateway } from '../data/alarm-command.gateway';
import { puedeActivar, puedeFinalizar } from '../data/alarm-incident-contract';

export type AlarmActorRole = 'administrador' | 'instructor' | 'aprendiz';

function nuevaClaveIdempotencia(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `mqtt3-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

@Injectable({ providedIn: 'root' })
export class AlarmCommandService {
  private readonly gateway = inject(ALARM_COMMAND_GATEWAY, { optional: true }) ?? new NoopAlarmCommandGateway();
  private readonly estados = signal<ReadonlyMap<string, AlarmCommandState>>(new Map());

  readonly historial = computed<readonly AlarmCommandState[]>(() => Array.from(this.estados().values()));

  estado(idempotencyKey: string): AlarmCommandState | null {
    return this.estados().get(idempotencyKey) ?? null;
  }

  vista(idempotencyKey: string, ahora?: string): AlarmCommandView | null {
    const estado = this.estado(idempotencyKey);
    return estado === null ? null : vistaComandoAlarma(estado, ahora);
  }

  async activar(
    incidente: AlarmIncidente,
    role: AlarmActorRole,
    idempotencyKey: string = nuevaClaveIdempotencia(),
  ): Promise<AlarmCommandState> {
    let draft: AlarmCommandDraft;
    try {
      draft = crearComandoActivacion(incidente, idempotencyKey);
    } catch (error) {
      return this.estadoInvalido(idempotencyKey, error);
    }
    return this.ejecutar(draft, role);
  }

  async desactivar(
    role: AlarmActorRole,
    opciones: {
      readonly idempotencyKey?: string;
      readonly alcance?: 'simulacro' | 'todas';
      readonly motivo?: 'falsa_alarma';
    } = {},
  ): Promise<AlarmCommandState> {
    const idempotencyKey = opciones.idempotencyKey ?? nuevaClaveIdempotencia();

    let draft: AlarmCommandDraft;
    try {
      draft = crearComandoDesactivacion({
        idempotencyKey,
        ...(opciones.alcance === undefined ? {} : { alcance: opciones.alcance }),
        ...(opciones.motivo === undefined ? {} : { motivo: opciones.motivo }),
      });
    } catch (error) {
      return this.estadoInvalido(idempotencyKey, error);
    }

    return this.ejecutar(draft, role);
  }

  /** Cierre de simulacro ya soportado por el firmware y por el gesto de ESP1. */
  async cerrarSimulacro(
    role: AlarmActorRole,
    falsaAlarma = true,
    idempotencyKey: string = nuevaClaveIdempotencia(),
  ): Promise<AlarmCommandState> {
    let draft: AlarmCommandDraft;
    try {
      draft = crearComandoCierreSimulacro(idempotencyKey, falsaAlarma);
    } catch (error) {
      return this.estadoInvalido(idempotencyKey, error);
    }
    return this.ejecutar(draft, role);
  }

  private async ejecutar(draft: AlarmCommandDraft, role: AlarmActorRole): Promise<AlarmCommandState> {
    const previo = this.estados().get(draft.idempotencyKey);
    if (previo !== undefined) return previo;

    if (!this.autorizado(draft, role)) {
      return this.guardar(estadoError(draft, 'ROL_NO_AUTORIZADO'));
    }

    this.guardar(estadoPendiente(draft));

    try {
      const resultado = await this.gateway.publicar(draft);
      if (resultado.fase === 'error') {
        return this.guardar(estadoError(draft, resultado.error ?? 'ERROR_DESCONOCIDO'));
      }
      return this.guardar(estadoPublicado(draft, resultado.publicadoEn ?? new Date().toISOString()));
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'ERROR_DE_TRANSPORTE';
      return this.guardar(estadoError(draft, mensaje));
    }
  }

  /**
   * Matriz MQTT.4 aplicada localmente: Admin e Instructor son idénticos para
   * los cinco eventos y para finalizar; Aprendiz no activa ni finaliza. El
   * backend repite la matriz con el rol real de `usuarios`; esta comprobación
   * no sustituye la autorización remota.
   */
  private autorizado(draft: AlarmCommandDraft, role: AlarmActorRole): boolean {
    if (draft.kind === 'activacion') {
      return draft.incidente !== null && puedeActivar(role, draft.incidente);
    }
    return puedeFinalizar(role, draft.incidente ?? null);
  }

  private estadoInvalido(idempotencyKey: string, error: unknown): AlarmCommandState {
    const mensaje = error instanceof AlarmCommandError ? error.code : 'COMANDO_INVALIDO';
    const draft: AlarmCommandDraft = {
      idempotencyKey,
      kind: 'activacion',
      incidente: null,
      topic: '',
      qos: 0,
      retain: false,
      payload: { action: true, evento: 'emergencia' },
      createdAt: new Date().toISOString(),
    };
    return this.guardar(estadoError(draft, mensaje));
  }

  private guardar(state: AlarmCommandState): AlarmCommandState {
    this.estados.update((mapa) => {
      const siguiente = new Map(mapa);
      siguiente.set(state.draft.idempotencyKey, state);
      return siguiente;
    });
    return state;
  }
}

export const ALARM_CONFIRMACION_FISICA_LABEL: AlarmConfirmacionFisica = 'no_disponible';
