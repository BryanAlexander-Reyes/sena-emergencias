import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  albumsOutline,
  checkmarkDoneOutline,
  informationCircleOutline,
  notificationsOutline,
  refreshOutline,
  searchOutline,
  warningOutline,
} from 'ionicons/icons';

import type { AlertSeverity, AlertStatus } from '../../core/data/demo-alerts';
import { AlertsStateService } from '../../core/services/alerts-state.service';
import { AlertCardComponent } from '../../shared/alert-card/alert-card.component';
import { FeatureIntroComponent } from '../../shared/feature-intro/feature-intro.component';

type SeverityFilter = 'all' | AlertSeverity;
type StatusFilter = 'all' | AlertStatus;

interface FilterOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

@Component({
  selector: 'app-alertas',
  templateUrl: 'alertas.page.html',
  styleUrls: ['alertas.page.scss'],
  imports: [IonContent, IonIcon, AlertCardComponent, FeatureIntroComponent],
})
export class AlertasPage {
  private readonly alertsState = inject(AlertsStateService);

  readonly alerts = this.alertsState.alerts;
  readonly activeAlerts = this.alertsState.activeAlerts;
  readonly reviewedAlerts = this.alertsState.reviewedAlerts;
  readonly totalAlerts = this.alertsState.totalAlerts;

  readonly severityFilter = signal<SeverityFilter>('all');
  readonly statusFilter = signal<StatusFilter>('all');

  readonly severityFilters: readonly FilterOption<SeverityFilter>[] = [
    { value: 'all', label: 'Todas' },
    { value: 'critical', label: 'Críticas' },
    { value: 'warning', label: 'Precaución' },
    { value: 'info', label: 'Informativas' },
  ];

  readonly statusFilters: readonly FilterOption<StatusFilter>[] = [
    { value: 'all', label: 'Todas' },
    { value: 'active', label: 'Activas' },
    { value: 'resolved', label: 'Resueltas' },
  ];

  readonly filtersActive = computed(() => this.severityFilter() !== 'all' || this.statusFilter() !== 'all');
  readonly filteredAlerts = computed(() => {
    const severity = this.severityFilter();
    const status = this.statusFilter();

    return this.alerts().filter(
      (alert) => (severity === 'all' || alert.severity === severity) && (status === 'all' || alert.status === status),
    );
  });

  constructor() {
    addIcons({
      albumsOutline,
      checkmarkDoneOutline,
      informationCircleOutline,
      notificationsOutline,
      refreshOutline,
      searchOutline,
      warningOutline,
    });
  }

  setSeverityFilter(value: SeverityFilter): void {
    this.severityFilter.set(value);
  }

  setStatusFilter(value: StatusFilter): void {
    this.statusFilter.set(value);
  }

  clearFilters(): void {
    this.severityFilter.set('all');
    this.statusFilter.set('all');
  }

  reviewAlert(alertId: string): void {
    this.alertsState.markReviewed(alertId);
  }
}
