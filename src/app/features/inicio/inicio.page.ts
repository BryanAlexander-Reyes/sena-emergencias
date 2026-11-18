import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AlertController, IonButton, IonContent, IonIcon } from '@ionic/angular';
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
import { AlertsStateService } from '../../core/services/alerts-state.service';
import { DemoAlarmNoticeService } from '../../core/services/demo-alarm-notice.service';
import { DemoAlarmStateService, type DemoAlarmAction } from '../../core/services/demo-alarm-state.service';
import { MonitoringStateService } from '../../core/services/monitoring-state.service';
import { MetricCardComponent, type MetricAccent } from '../../shared/metric-card/metric-card.component';

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
  imports: [IonButton, IonContent, IonIcon, RouterLink, MetricCardComponent],
})
export class InicioPage {
  private readonly monitoring = inject(MonitoringStateService);
  private readonly alertsState = inject(AlertsStateService);
  private readonly permissions = inject(DemoPermissionsService);
  private readonly alarmController = inject(AlertController);
  private readonly alarmState = inject(DemoAlarmStateService);
  private readonly alarmNoticeService = inject(DemoAlarmNoticeService);
  private readonly confirmingAlarm = signal(false);

  readonly alarm = this.alarmState;
  readonly notice = this.alarmNoticeService.notice;
  readonly ledInstruction = this.alarmNoticeService.ledInstruction;
  readonly canControlAlarm = computed(() => this.permissions.can('alarm:control'));

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

  constructor() {
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
  }

  confirmTurnOn(): Promise<void> {
    return this.confirmAlarmChange('turn-on');
  }

  confirmTurnOff(): Promise<void> {
    return this.confirmAlarmChange('turn-off');
  }

  /**
   * Un único flujo de confirmación evita acciones duplicadas por pulsaciones
   * rápidas. El permiso se revalúa dentro del servicio al ejecutar la acción.
   */
  private async confirmAlarmChange(action: DemoAlarmAction): Promise<void> {
    if (!this.canControlAlarm() || this.confirmingAlarm()) {
      return;
    }
    if ((action === 'turn-on') === this.alarm.isOn()) {
      return;
    }

    this.confirmingAlarm.set(true);
    const expectedStatus = this.alarm.status();
    const turningOn = action === 'turn-on';

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
                this.alarmState.turnOn(expectedStatus);
              } else {
                this.alarmState.turnOff(expectedStatus);
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
}
