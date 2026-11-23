import { Component, computed, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  analyticsOutline,
  barChartOutline,
  gridOutline,
  informationCircleOutline,
  peopleOutline,
  pulseOutline,
  statsChartOutline,
  timeOutline,
  trendingUpOutline,
} from 'ionicons/icons';

import { OCCUPANCY_STATUS_LABELS, type OccupancyStatus } from '../../../core/data/demo-monitoring';
import { AlertsStateService } from '../../../core/services/alerts-state.service';
import { MonitoringStateService } from '../../../core/services/monitoring-state.service';
import {
  SimulationHistoryService,
  type OccupancyHistoryEvent,
} from '../../../core/services/simulation-history.service';
import { MetricCardComponent, type MetricAccent } from '../../../shared/metric-card/metric-card.component';
import { SecondaryPageComponent } from '../../../shared/secondary-page/secondary-page.component';

interface StatisticMetric {
  readonly title: string;
  readonly value: string | number;
  readonly icon: string;
  readonly accent: MetricAccent;
  readonly description: string;
}

interface ZoneStatRow {
  readonly id: string;
  readonly name: string;
  readonly people: number;
  readonly capacity: number;
  readonly occupancy: number;
  readonly status: OccupancyStatus;
  readonly statusLabel: string;
  readonly maxPeopleObserved: number;
  readonly changeCount: number;
}

@Component({
  selector: 'app-estadisticas',
  templateUrl: './estadisticas.page.html',
  styleUrls: ['./estadisticas.page.scss'],
  imports: [IonIcon, MetricCardComponent, SecondaryPageComponent],
})
export class EstadisticasPage {
  private readonly monitoring = inject(MonitoringStateService);
  private readonly history = inject(SimulationHistoryService);
  private readonly alerts = inject(AlertsStateService);

  readonly totalPeople = this.monitoring.totalPeople;
  readonly monitoredZones = this.monitoring.monitoredZones;
  readonly changeCount = this.history.changeCount;
  readonly maxTotalObserved = this.history.maxTotalObserved;
  readonly activeAlerts = this.alerts.activeAlerts;
  readonly events = this.history.eventsNewestFirst;
  readonly isEmpty = this.history.isEmpty;
  readonly timeline = this.history.totalTimeline;

  readonly metrics = computed<readonly StatisticMetric[]>(() => [
    {
      title: 'Ocupación total actual',
      value: this.totalPeople(),
      icon: 'people-outline',
      accent: 'cyan',
      description: 'Personas estimadas en la sesión',
    },
    {
      title: 'Zonas monitoreadas',
      value: this.monitoredZones(),
      icon: 'grid-outline',
      accent: 'blue',
      description: 'Zonas incluidas en la simulación',
    },
    {
      title: 'Cambios registrados',
      value: this.changeCount(),
      icon: 'analytics-outline',
      accent: 'green',
      description: 'Eventos de ocupación confirmados',
    },
    {
      title: 'Máximo total en sesión',
      value: this.maxTotalObserved(),
      icon: 'trending-up-outline',
      accent: 'yellow',
      description: 'Incluye el valor inicial (107)',
    },
    {
      title: 'Alertas activas actuales',
      value: this.activeAlerts(),
      icon: 'alert-circle-outline',
      accent: 'yellow',
      description: 'Según el servicio de alertas',
    },
  ]);

  readonly zoneRows = computed<readonly ZoneStatRow[]>(() => {
    const historyStats = new Map(this.history.zoneStats().map((s) => [s.zoneId, s]));
    return this.monitoring.snapshots().map((snapshot) => {
      const hs = historyStats.get(snapshot.zone.id);
      return {
        id: snapshot.zone.id,
        name: snapshot.zone.name,
        people: snapshot.zone.people,
        capacity: snapshot.zone.capacity,
        occupancy: snapshot.occupancy,
        status: snapshot.status,
        statusLabel: snapshot.statusLabel,
        maxPeopleObserved: hs?.maxPeopleObserved ?? snapshot.zone.people,
        changeCount: hs?.changeCount ?? 0,
      };
    });
  });

  readonly chart = computed(() => {
    const points = this.timeline();
    const values = points.map((p) => p.total);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const width = 600;
    const height = 160;
    const padX = 24;
    const padY = 20;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;
    const coords = points.map((p, i) => {
      const x = padX + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
      const y = padY + innerH - ((p.total - min) / range) * innerH;
      return { x, y, total: p.total, label: p.label };
    });
    const line = coords.map((c) => `${c.x},${c.y}`).join(' ');
    const area =
      coords.length > 0 ? `${padX},${padY + innerH} ${line} ${coords[coords.length - 1].x},${padY + innerH}` : '';
    return { width, height, padX, padY, innerH, coords, line, area, min, max };
  });

  constructor() {
    addIcons({
      alertCircleOutline,
      analyticsOutline,
      barChartOutline,
      gridOutline,
      informationCircleOutline,
      peopleOutline,
      pulseOutline,
      statsChartOutline,
      timeOutline,
      trendingUpOutline,
    });
  }

  formatEventTime(event: OccupancyHistoryEvent): string {
    return event.occurredAt.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  deltaLabel(event: OccupancyHistoryEvent): string {
    const sign = event.delta > 0 ? '+' : '';
    return `${sign}${event.delta}`;
  }

  statusLabel(status: OccupancyStatus): string {
    return OCCUPANCY_STATUS_LABELS[status];
  }
}
