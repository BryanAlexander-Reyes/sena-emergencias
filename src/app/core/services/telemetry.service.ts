/**
 * Servicio central de telemetría MQTT (Fase MQTT.2).
 *
 * Consume el stream SSE del receptor. No abre conexión MQTT desde Ionic, no
 * guarda métricas en Supabase y nunca sustituye datos ausentes por simulaciones.
 * Un único EventSource se comparte entre todas las pantallas suscritas.
 */

import { computed, Injectable, signal } from '@angular/core';

import { TELEMETRY_BASE_URL } from '../../../environments/telemetry.config';
import type { MqttTelemetriaSnapshot } from '../data/mqtt-contracts';
import {
  emptySnapshot,
  isStale,
  isTelemetryStreamPayload,
  latestUpdateAt,
  type TelemetryStreamPayload,
} from '../data/telemetry-core';

export type TelemetryConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

const SNAPSHOT_VACIO: MqttTelemetriaSnapshot = emptySnapshot();
const INTERVALO_FRESCURA_MS = 15_000;

@Injectable({ providedIn: 'root' })
export class TelemetryService {
  private readonly estadoStream = signal<TelemetryStreamPayload | null>(null);
  private readonly estadoConexion = signal<TelemetryConnectionStatus>('idle');
  private readonly mensajeError = signal<string | null>(null);
  private readonly ahora = signal(Date.now());

  private eventSource: EventSource | null = null;
  private relojFrescura: ReturnType<typeof setInterval> | null = null;
  private consumidores = 0;

  /** Último sobre recibido, con la marca `demo` del receptor. */
  readonly stream = this.estadoStream.asReadonly();
  /** Estado en memoria; vacío hasta que llegue el primer snapshot. */
  readonly snapshot = computed<MqttTelemetriaSnapshot>(() => this.estadoStream()?.snapshot ?? SNAPSHOT_VACIO);
  readonly connectionStatus = this.estadoConexion.asReadonly();
  readonly error = this.mensajeError.asReadonly();
  readonly now = this.ahora.asReadonly();
  readonly isDemo = computed(() => this.estadoStream()?.demo === true);
  readonly lastUpdate = computed(() => latestUpdateAt(this.snapshot()));
  readonly isStale = computed(() => {
    const payload = this.estadoStream();
    return payload === null ? false : isStale(latestUpdateAt(payload.snapshot), this.ahora());
  });

  /** Registra un consumidor. Llamadas repetidas no crean conexiones duplicadas. */
  start(): void {
    this.consumidores += 1;

    if (this.consumidores > 1 || this.eventSource) return;
    this.abrir();
  }

  /** Libera un consumidor. La conexión se cierra cuando no queda ninguno. */
  stop(): void {
    this.consumidores = Math.max(0, this.consumidores - 1);

    if (this.consumidores === 0) this.cerrar();
  }

  /** Fuerza una nueva conexión SSE sin tocar el último estado conocido. */
  reconnect(): void {
    if (this.consumidores === 0) return;

    this.cerrar();
    this.abrir();
  }

  /** Actualiza el reloj usado para detectar datos obsoletos. */
  refreshFreshness(): void {
    this.ahora.set(Date.now());
  }

  private abrir(): void {
    if (typeof EventSource === 'undefined') {
      this.estadoConexion.set('error');
      this.mensajeError.set('Este entorno no admite Server-Sent Events.');
      return;
    }

    const url = `${TELEMETRY_BASE_URL.replace(/\/$/, '')}/api/telemetry/stream`;

    try {
      const source = new EventSource(url);
      this.eventSource = source;
      this.estadoConexion.set('connecting');
      this.mensajeError.set(null);

      source.onopen = () => {
        this.estadoConexion.set('connected');
        this.mensajeError.set(null);
      };

      source.onerror = () => {
        // EventSource reintenta automáticamente; se conserva el último estado.
        this.estadoConexion.set('disconnected');
        this.mensajeError.set('El receptor de telemetría no responde. Reintentando conexión…');
      };

      source.addEventListener('snapshot', (evento) => {
        this.aplicarSnapshot((evento as MessageEvent<string>).data);
      });
    } catch {
      this.eventSource = null;
      this.estadoConexion.set('error');
      this.mensajeError.set('No se pudo crear la conexión con el receptor de telemetría.');
      return;
    }

    if (!this.relojFrescura) {
      this.relojFrescura = setInterval(() => this.ahora.set(Date.now()), INTERVALO_FRESCURA_MS);
    }
  }

  private cerrar(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.relojFrescura) {
      clearInterval(this.relojFrescura);
      this.relojFrescura = null;
    }

    this.estadoConexion.set('idle');
    this.mensajeError.set(null);
  }

  private aplicarSnapshot(datos: string): void {
    let crudo: unknown;

    try {
      crudo = JSON.parse(datos);
    } catch {
      this.mensajeError.set('Se recibió un snapshot con JSON inválido.');
      return;
    }

    if (!isTelemetryStreamPayload(crudo)) {
      this.mensajeError.set('Se recibió un snapshot incompleto.');
      return;
    }

    this.estadoStream.set(crudo);
    this.estadoConexion.set('connected');
    this.mensajeError.set(crudo.snapshot.bridge.lastError);
    this.ahora.set(Date.now());
  }
}
