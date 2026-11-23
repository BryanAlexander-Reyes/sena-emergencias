import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AlertController, IonButton, IonContent, IonIcon, IonSelect, IonSelectOption } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  alarmOutline,
  arrowForwardOutline,
  gridOutline,
  informationCircleOutline,
  notificationsOutline,
  peopleOutline,
  scanOutline,
  shieldCheckmarkOutline,
  timeOutline,
  warningOutline,
} from 'ionicons/icons';

import { DemoPermissionsService } from '../../core/auth/demo-permissions.service';
import { AlarmEventSelectionService } from '../../core/data/alarm-event-selection.service';
import { createManualAlarmNotification } from '../../core/data/notification.models';
import { AlertsStateService } from '../../core/services/alerts-state.service';
import { DemoAlarmNoticeService } from '../../core/services/demo-alarm-notice.service';
import {
  DemoAlarmStateService,
  type DemoAlarmAction,
  type DemoAlarmStatus,
} from '../../core/services/demo-alarm-state.service';
import { ManualAlarmSyncService } from '../../core/services/manual-alarm-sync.service';
import {
  AlarmCommandPendingError,
  ManualAlarmService,
  type ManualAlarmOperationResult,
  type ManualAlarmRecord,
} from '../../core/services/manual-alarm.service';
import { MonitoringStateService } from '../../core/services/monitoring-state.service';
import { NotificationStoreService } from '../../core/services/notification-store.service';
import { MetricCardComponent, type MetricAccent } from '../../shared/metric-card/metric-card.component';
import { ZoneConfigStatusComponent } from '../../shared/zone-config-status/zone-config-status.component';

interface DashboardMetric {
  readonly title: string;
  readonly value: number;
  readonly icon: string;
  readonly accent: MetricAccent;
  readonly description: string;
}

@Component({
  selector: 'app-inicio',
  templateUrl: 'inicio.page.html',
  styleUrls: ['inicio.page.scss'],
  imports: [
    IonButton,
    IonContent,
    IonIcon,
    IonSelect,
    IonSelectOption,
    RouterLink,
    MetricCardComponent,
    ZoneConfigStatusComponent,
  ],
})
export class InicioPage {
  private readonly monitoring = inject(MonitoringStateService);
  private readonly alertsState = inject(AlertsStateService);
  private readonly permissions = inject(DemoPermissionsService);
  private readonly alarmController = inject(AlertController);
  private readonly alarmState = inject(DemoAlarmStateService);
  private readonly alarmNoticeService = inject(DemoAlarmNoticeService);
  private readonly notificationStore = inject(NotificationStoreService);
  private readonly manualAlarmService = inject(ManualAlarmService);
  private readonly manualAlarmSync = inject(ManualAlarmSyncService);
  private readonly seleccionAlarma = inject(AlarmEventSelectionService);

  readonly confirmingAlarm = signal(false);
  readonly activatingAlarm = signal(false);
  readonly finalizingAlarm = signal(false);
  private pendingAlarmIdempotencyKey: string | null = null;
  readonly activeManualAlarmId = signal<string | null>(null);
  readonly comandoMqtt = signal<
    ManualAlarmOperationResult['comandoMqtt'] | { readonly fase: 'pendiente'; readonly mensaje: string } | null
  >(null);
  private lastKnownManualAlarmId: string | null = null;

  readonly zoneConfigMode = this.monitoring.zoneConfigMode;
  readonly zoneConfigStatus = this.monitoring.zoneConfigStatus;
  readonly zoneConfigError = this.monitoring.zoneConfigError;

  readonly alarm = this.alarmState;
  readonly notice = this.alarmNoticeService.notice;
  readonly ledInstruction = this.alarmNoticeService.ledInstruction;
  readonly canControlAlarm = computed(() => this.permissions.can('alarm:control'));
  readonly eventosAlarma = this.seleccionAlarma.opciones;
  readonly eventoAlarma = this.seleccionAlarma.evento;
  readonly notificationUnreadCount = this.notificationStore.unreadCount;

  readonly zones = this.monitoring.zones;
  readonly lastUpdate = this.monitoring.lastUpdate;
  readonly totalPeople = this.monitoring.totalPeople;
  readonly monitoredZones = this.monitoring.monitoredZones;
  readonly safeZone = this.monitoring.safeZone;
  readonly safeZonePeople = this.monitoring.safeZonePeople;
  readonly activeAlerts = this.alertsState.activeAlerts;
  readonly activeAlert = this.alertsState.activeCriticalAlert;
  readonly criticalZone = computed(() => {
    const alert = this.activeAlert();

    return alert ? this.monitoring.zoneById(alert.zoneId) : undefined;
  });

  readonly metrics = computed<readonly DashboardMetric[]>(() => [
    {
      title: 'Personas estimadas',
      value: this.totalPeople(),
      icon: 'people-outline',
      accent: 'cyan',
      description: 'En zonas monitoreadas',
    },
    {
      title: 'Zonas monitoreadas',
      value: this.monitoredZones(),
      icon: 'grid-outline',
      accent: 'blue',
      description: 'Incluye punto seguro',
    },
    {
      title: 'Alertas activas',
      value: this.activeAlerts(),
      icon: 'warning-outline',
      accent: 'yellow',
      description: 'Requiere atención',
    },
    {
      title: 'Zona segura',
      value: this.safeZonePeople(),
      icon: 'shield-checkmark-outline',
      accent: 'green',
      description: 'Personas contabilizadas',
    },
  ]);

  retryZoneConfigs(): void {
    void this.monitoring.retryZoneConfigs();
  }

  constructor() {
    void this.monitoring.ensureZoneConfigs();
    addIcons({
      alarmOutline,
      arrowForwardOutline,
      gridOutline,
      informationCircleOutline,
      notificationsOutline,
      peopleOutline,
      scanOutline,
      shieldCheckmarkOutline,
      timeOutline,
      warningOutline,
    });

    effect(() => {
      const status = this.manualAlarmSync.syncStatus();
      const activeAlarm = this.manualAlarmSync.activeAlarm();

      if (status !== 'ready') {
        return;
      }

      if (this.activatingAlarm() || this.finalizingAlarm()) {
        return;
      }

      const nextId = activeAlarm?.id ?? null;
      const previousId = this.lastKnownManualAlarmId;
      this.lastKnownManualAlarmId = nextId;

      if (nextId) {
        this.activeManualAlarmId.set(nextId);
        return;
      }

      this.activeManualAlarmId.set(null);

      if (previousId !== null && this.alarm.isOn()) {
        this.alarmState.turnOff(this.alarm.status());
      }
    });
  }

  confirmTurnOn(): Promise<void> {
    return this.confirmAlarmChange('turn-on');
  }

  confirmTurnOff(): Promise<void> {
    return this.confirmAlarmChange('turn-off');
  }

  seleccionarEventoAlarma(evento: unknown): void {
    if (!this.canControlAlarm() || this.alarm.isOn() || this.activeManualAlarmId()) {
      this.seleccionAlarma.limpiar();
      return;
    }
    if (!this.seleccionAlarma.seleccionar(evento)) {
      this.seleccionAlarma.limpiar();
    }
  }

  /**
   * Un único flujo de confirmación evita acciones duplicadas por pulsaciones
   * rápidas. El permiso se revalúa dentro del servicio al ejecutar la acción.
   */
  private async confirmAlarmChange(action: DemoAlarmAction): Promise<void> {
    if (!this.canControlAlarm()) {
      this.seleccionAlarma.limpiar();
      return;
    }
    if (this.confirmingAlarm() || this.activatingAlarm() || this.finalizingAlarm()) {
      return;
    }

    const turningOn = action === 'turn-on';
    if (turningOn && (this.alarm.isOn() || this.activeManualAlarmId())) return;
    if (turningOn && this.eventoAlarma() === null) {
      await this.presentAlarmMessage(
        'Selecciona el tipo de alarma',
        'Debes elegir incendio, sismo, impacto, emergencia o simulacro antes de activar.',
      );
      return;
    }

    this.confirmingAlarm.set(true);
    const expectedStatus = this.alarm.status();

    try {
      const confirmation = await this.alarmController.create({
        header: turningOn ? 'Encender alarma' : 'Apagar alarma',
        message: turningOn
          ? '¿Deseas activar la alarma de demostración?'
          : '¿Deseas desactivar la alarma de demostración?',
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          {
            text: turningOn ? 'Encender alarma' : 'Apagar alarma',
            handler: () => {
              if (turningOn) {
                void this.handleManualAlarmActivation(expectedStatus);
              } else {
                void this.handleManualAlarmFinalization(expectedStatus);
              }
            },
          },
        ],
      });

      await confirmation.present();
      await confirmation.onDidDismiss();
    } finally {
      this.confirmingAlarm.set(false);
    }
  }

  private async handleManualAlarmActivation(expectedStatus: DemoAlarmStatus): Promise<void> {
    if (!this.canControlAlarm()) {
      this.seleccionAlarma.limpiar();
      return;
    }
    if (this.activatingAlarm() || this.finalizingAlarm()) {
      return;
    }

    this.activatingAlarm.set(true);

    try {
      const activeAlarmsResult = await this.getActiveManualAlarms();
      if (!activeAlarmsResult.ok) {
        await this.presentAlarmMessage(
          'No se pudo activar la alarma',
          this.getManualAlarmErrorMessage(activeAlarmsResult.error, 'activate'),
        );
        return;
      }


      if (activeAlarmsResult.alarms.length > 0) {
        this.activeManualAlarmId.set(activeAlarmsResult.alarms[0].id);
        await this.presentAlarmMessage('Emergencia ya activa', 'Finaliza la emergencia actual antes de activar otra.');
        void this.manualAlarmSync.refresh();
        return;
      }
      const evento = this.eventoAlarma();
      if (evento === null) {
        await this.presentAlarmMessage(
          'Selecciona el tipo de alarma',
          'Debes elegir incendio, sismo, impacto, emergencia o simulacro antes de activar.',
        );
        return;
      }

      const idempotencyKey = this.pendingAlarmIdempotencyKey ?? globalThis.crypto.randomUUID();
      this.pendingAlarmIdempotencyKey = idempotencyKey;

      const alarma = await this.manualAlarmService.activate(idempotencyKey, evento);
      this.pendingAlarmIdempotencyKey = null;
      this.seleccionAlarma.limpiar();
      this.activeManualAlarmId.set(alarma.id);
      this.comandoMqtt.set(alarma.comandoMqtt);

      const activated = this.alarmState.turnOn(expectedStatus);
      if (activated) {
        const notification = createManualAlarmNotification(alarma.id, new Date(alarma.fecha_activacion));
        this.notificationStore.addNotification(notification);
      }
      void this.manualAlarmSync.refresh();
    } catch (error: unknown) {
      if (error instanceof AlarmCommandPendingError) {
        // Se conserva la clave del incidente: un reintento con la misma clave
        // reutiliza la alarma ya persistida en lugar de crear otra.
        this.seleccionAlarma.limpiar();
        this.activeManualAlarmId.set(error.alarma.id);
        this.comandoMqtt.set({
          fase: 'pendiente',
          mensaje: `La alarma quedó registrada, pero el comando MQTT no se publicó (${error.detalle}). No se puede afirmar que el buzzer haya sonado.`,
        });
        await this.presentAlarmMessage(
          'Comando MQTT pendiente',
          'La alarma quedó registrada, pero no se confirmó el envío al ESP32. No se puede afirmar que el buzzer haya sonado.',
        );
        return;
      }

      console.error('No se pudo confirmar la activación de alarma', error);
      await this.presentAlarmMessage(
        'No se pudo activar la alarma',
        this.getManualAlarmErrorMessage(error, 'activate'),
      );
    } finally {
      this.activatingAlarm.set(false);
      // La alarma existe aunque el buzzer quede pendiente: recuperar el modal.
      void this.manualAlarmSync.refresh();
    }
  }

  private async handleManualAlarmFinalization(expectedStatus: DemoAlarmStatus): Promise<void> {
    if (this.activatingAlarm() || this.finalizingAlarm() || !this.canControlAlarm()) {
      return;
    }

    this.finalizingAlarm.set(true);

    try {
      const activeAlarmsResult = await this.getActiveManualAlarms();
      if (!activeAlarmsResult.ok) {
        await this.presentAlarmMessage(
          'No se pudo finalizar la alarma',
          this.getManualAlarmErrorMessage(activeAlarmsResult.error, 'finalize'),
        );
        return;
      }


      if (activeAlarmsResult.alarms.length === 0) {
        this.activeManualAlarmId.set(null);
        await this.presentAlarmMessage(
          'No hay emergencia activa',
          'No existe una emergencia manual activa para finalizar.',
        );
        return;
      }

      const activeAlarm = activeAlarmsResult.alarms.find(alarm => alarm.id === this.activeManualAlarmId())
        ?? activeAlarmsResult.alarms[0];
      this.activeManualAlarmId.set(activeAlarm.id);

      let finalizada: ManualAlarmOperationResult;
      try {
        finalizada = await this.manualAlarmService.finalize(activeAlarm.id, activeAlarm.evento);
      } catch (error: unknown) {
        await this.handleFinalizeError(error, activeAlarm.id);
        return;
      }

      this.comandoMqtt.set(finalizada.comandoMqtt);
      this.activeManualAlarmId.set(null);
      if (this.alarm.isOn()) {
        this.alarmState.turnOff(expectedStatus);
      }
      void this.manualAlarmSync.refresh();
    } finally {
      this.finalizingAlarm.set(false);
    }
  }

  private async handleFinalizeError(error: unknown, alarmId: string): Promise<void> {
    if (error instanceof AlarmCommandPendingError) {
      this.activeManualAlarmId.set(null);
      this.comandoMqtt.set({
        fase: 'pendiente',
        mensaje: `La emergencia quedó finalizada, pero el comando MQTT de apagado no se publicó (${error.detalle}). Verifica el buzzer físicamente.`,
      });
      if (this.alarm.isOn()) {
        this.alarmState.turnOff(this.alarm.status());
      }
      void this.manualAlarmSync.refresh();
      await this.presentAlarmMessage(
        'Apagado MQTT pendiente',
        'La emergencia quedó finalizada en el registro, pero no se confirmó el comando al ESP32. Verifica el buzzer físicamente.',
      );
      return;
    }

    console.error('No se pudo confirmar la finalización de alarma', error);

    const refreshed = await this.getActiveManualAlarms();
    if (refreshed.ok) {
      const stillActive = refreshed.alarms.some((alarm) => alarm.id === alarmId);
      if (!stillActive && refreshed.alarms.length === 0) {
        this.activeManualAlarmId.set(null);
        if (this.alarm.isOn()) {
          this.alarmState.turnOff(this.alarm.status());
        }
        void this.manualAlarmSync.refresh();
        await this.presentAlarmMessage(
          'Emergencia finalizada',
          'La emergencia ya no se encuentra activa. Se actualizó el estado local.',
        );
        return;
      }

      if (!stillActive && refreshed.alarms.length === 1) {
        this.activeManualAlarmId.set(refreshed.alarms[0].id);
      }
    }

    await this.presentAlarmMessage(
      'No se pudo finalizar la alarma',
      this.getManualAlarmErrorMessage(error, 'finalize'),
    );
  }

  private async getActiveManualAlarms(): Promise<
    { ok: true; alarms: ManualAlarmRecord[] } | { ok: false; error: unknown }
  > {
    try {
      const alarms = await this.manualAlarmService.getActiveAlarms();
      return { ok: true, alarms };
    } catch (error: unknown) {
      console.error('No se pudo consultar alarmas manuales activas', error);
      return { ok: false, error };
    }
  }

  private getManualAlarmErrorMessage(error: unknown, action: 'activate' | 'finalize'): string {
    const code = this.getErrorCode(error);
    const status = this.getErrorStatus(error);

    if (code === 'SUPABASE_NOT_CONFIGURED') {
      return 'El servicio de alarmas no está disponible en este momento.';
    }
    if (code === 'UNAUTHENTICATED' || status === 401) {
      return 'Tu sesión no es válida o expiró. Inicia sesión nuevamente para continuar.';
    }
    if (code === 'EVENTO_NO_SELECCIONADO') {
      return 'Debes seleccionar el tipo de alarma antes de activarla.';
    }
    if (code === 'INVALID_ALARM_ID' || code === 'INVALID_ALARM_RESPONSE') {
      return action === 'finalize'
        ? 'No se pudo confirmar la finalización de la alarma. Intenta nuevamente.'
        : 'No se pudo confirmar la activación de la alarma. Intenta nuevamente.';
    }
    if (status === 403) {
      return action === 'finalize'
        ? 'No tienes permisos para finalizar esta emergencia.'
        : 'No tienes permisos para activar esta emergencia.';
    }
    if (status === 404) {
      return 'La emergencia indicada no existe o ya no está activa.';
    }
    if (status === 409) {
      return action === 'finalize'
        ? 'La emergencia ya fue finalizada o su estado cambió. Actualiza e intenta nuevamente.'
        : 'Ya existe una emergencia activa o el estado cambió. Actualiza e intenta nuevamente.';
    }

    return action === 'finalize'
      ? 'No fue posible finalizar la emergencia. Verifica tu conexión e intenta nuevamente.'
      : 'No fue posible confirmar la activación. Verifica tu conexión antes de intentarlo nuevamente.';
  }

  private getErrorCode(error: unknown): string | undefined {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const code = (error as { code?: unknown }).code;
      return typeof code === 'string' ? code : undefined;
    }
    return undefined;
  }

  private getErrorStatus(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null) {
      return undefined;
    }

    const maybeStatus = (error as { status?: unknown }).status;
    if (typeof maybeStatus === 'number') {
      return maybeStatus;
    }

    const context = (error as { context?: unknown }).context;
    if (typeof context === 'object' && context !== null && 'status' in context) {
      const contextStatus = (context as { status?: unknown }).status;
      return typeof contextStatus === 'number' ? contextStatus : undefined;
    }

    return undefined;
  }

  private async presentAlarmMessage(header: string, message: string): Promise<void> {
    const alert = await this.alarmController.create({
      header,
      message,
      buttons: ['Entendido'],
    });

    await alert.present();
  }
}
