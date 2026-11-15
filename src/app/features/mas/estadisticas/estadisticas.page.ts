import { Component, computed, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  analyticsOutline,
  barChartOutline,
  gridOutline,
  informationCircleOutline,
  peopleOutline,
  speedometerOutline,
  statsChartOutline,
  timeOutline,
} from 'ionicons/icons';

import { MonitoringStateService, type ZoneSnapshot } from '../../../core/services/monitoring-state.service';
import { MetricCardComponent, type MetricAccent } from '../../../shared/metric-card/metric-card.component';
import { SecondaryPageComponent } from '../../../shared/secondary-page/secondary-page.component';

interface StatisticMetric {
  readonly title: string;
  readonly value: string | number;
  readonly icon: string;
  readonly accent: MetricAccent;
  readonly description: string;
}

@Component({
  selector: 'app-estadisticas',
  templateUrl: './estadisticas.page.html',
  styleUrls: ['./estadisticas.page.scss'],
  imports: [IonIcon, MetricCardComponent, SecondaryPageComponent],
})
export class EstadisticasPage {
  private readonly monitoring = inject(MonitoringStateService);

  readonly zones = this.monitoring.zones;
  readonly totalPeople = this.monitoring.totalPeople;
  readonly monitoredZones = this.monitoring.monitoredZones;

  readonly averageOccupancy = computed(() => {
    const snapshots = this.monitoring.snapshots();

    if (snapshots.length === 0) {
      return 0;
    }

    return Math.round(snapshots.reduce((total, snapshot) => total + snapshot.occupancy, 0) / snapshots.length);
  });

  readonly busiestZone = computed<ZoneSnapshot | null>(() =>
    this.monitoring
      .snapshots()
      .reduce<ZoneSnapshot | null>(
        (busiest, snapshot) => (!busiest || snapshot.occupancy > busiest.occupancy ? snapshot : busiest),
        null,
      ),
  );
  readonly busiestOccupancy = computed(() => this.busiestZone()?.occupancy ?? 0);

  readonly metrics = computed<readonly StatisticMetric[]>(() => [
    {
      title: 'Personas estimadas',
      value: this.totalPeople(),
      icon: 'people-outline',
      accent: 'cyan',
      description: 'Suma de las zonas monitoreadas',
    },
    {
      title: 'Zonas monitoreadas',
      value: this.monitoredZones(),
      icon: 'grid-outline',
      accent: 'blue',
      description: 'Datos actuales de demostración',
    },
    {
      title: 'Ocupación promedio',
      value: `${this.averageOccupancy()}%`,
      icon: 'analytics-outline',
      accent: 'green',
      description: 'Promedio de las zonas monitoreadas',
    },
    {
      title: 'Mayor ocupación',
      value: `${this.busiestOccupancy()}%`,
      icon: 'speedometer-outline',
      accent: 'yellow',
      description: this.busiestZone()?.zone.name ?? 'Sin datos',
    },
  ]);

  constructor() {
    addIcons({
      analyticsOutline,
      barChartOutline,
      gridOutline,
      informationCircleOutline,
      peopleOutline,
      speedometerOutline,
      statsChartOutline,
      timeOutline,
    });
  }
}
