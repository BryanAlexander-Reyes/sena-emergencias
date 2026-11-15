import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowForwardOutline,
  gridOutline,
  notificationsOutline,
  peopleOutline,
  scanOutline,
  shieldCheckmarkOutline,
  timeOutline,
  warningOutline,
} from 'ionicons/icons';

import { AlertsStateService } from '../../core/services/alerts-state.service';
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
      arrowForwardOutline,
      gridOutline,
      notificationsOutline,
      peopleOutline,
      scanOutline,
      shieldCheckmarkOutline,
      timeOutline,
      warningOutline,
    });
  }
}
