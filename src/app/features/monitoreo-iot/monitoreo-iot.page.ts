/**
 * Pantalla de telemetría MQTT real (Fase MQTT.2).
 *
 * Muestra el estado del receptor, las dos placas por separado y sus eventos.
 * No sustituye valores ausentes por simulaciones: todo lo que aparece aquí
 * procede del snapshot validado por el receptor, salvo que esté marcado demo.
 */

import { Component, computed, inject, type OnDestroy, type OnInit } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  checkmarkCircleOutline,
  closeCircleOutline,
  radioOutline,
  refreshOutline,
  timeOutline,
  warningOutline,
} from 'ionicons/icons';

import type { TelemetryStreamPayload } from '../../core/data/telemetry-core';
import { buildTelemetryViews, type TelemetryPlacaVista } from '../../core/data/telemetry-view';
import { TelemetryService, type TelemetryConnectionStatus } from '../../core/services/telemetry.service';
import { SecondaryPageComponent } from '../../shared/secondary-page/secondary-page.component';

const ESTADOS_CONEXION: Readonly<Record<TelemetryConnectionStatus, string>> = {
  idle: 'Sin conexión',
  connecting: 'Conectando…',
  connected: 'Conectado al receptor',
  disconnected: 'Desconectado — reintentando',
  error: 'Error de conexión',
};

function fechaLegible(iso: string | null): string {
  if (!iso) return 'Sin datos';

  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime())
    ? 'Fecha no válida'
    : `${fecha.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

@Component({
  selector: 'app-monitoreo-iot',
  templateUrl: './monitoreo-iot.page.html',
  styleUrls: ['./monitoreo-iot.page.scss'],
  imports: [IonButton, IonIcon, SecondaryPageComponent],
})
export class MonitoreoIotPage implements OnInit, OnDestroy {
  private readonly telemetry = inject(TelemetryService);

  private readonly payload = computed<TelemetryStreamPayload>(
    () =>
      this.telemetry.stream() ?? {
        snapshot: this.telemetry.snapshot(),
        demo: false,
        receivedAt: '',
      },
  );

  readonly vistas = computed(() => buildTelemetryViews(this.payload(), this.telemetry.now()));
  readonly placas = computed<readonly TelemetryPlacaVista[]>(() => [this.vistas().placa1, this.vistas().placa2]);

  readonly estado = this.telemetry.connectionStatus;
  readonly estadoTexto = computed(() => ESTADOS_CONEXION[this.estado()]);
  readonly error = this.telemetry.error;
  readonly isDemo = this.telemetry.isDemo;
  readonly isStale = this.telemetry.isStale;
  readonly ultimaActualizacion = computed(() => fechaLegible(this.telemetry.lastUpdate()));
  readonly sinDatos = computed(() => this.telemetry.stream() === null);

  constructor() {
    addIcons({ checkmarkCircleOutline, closeCircleOutline, radioOutline, refreshOutline, timeOutline, warningOutline });
  }

  ngOnInit(): void {
    this.telemetry.start();
  }

  ngOnDestroy(): void {
    this.telemetry.stop();
  }

  recargar(): void {
    this.telemetry.refreshFreshness();
    this.telemetry.reconnect();
  }
}
