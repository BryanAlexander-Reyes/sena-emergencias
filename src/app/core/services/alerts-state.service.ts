/**
 * SENA CROWD INTELLIGENCE — estado centralizado de alertas (Fase 3.1).
 *
 * Mantiene los registros simulados y su estado de revisión en memoria. El
 * Dashboard y el centro de alertas consultan este mismo servicio para que el
 * conteo de alertas activas sea siempre coherente.
 *
 * No genera ni resuelve alertas automáticamente: solo conserva la acción de
 * revisión ya existente en la Fase 2.6.
 */

import { computed, Injectable, signal } from '@angular/core';

import {
  countActiveAlerts,
  countReviewedAlerts,
  DEMO_ALERTS,
  getActiveCriticalAlert,
  type DemoAlert,
} from '../data/demo-alerts';

@Injectable({ providedIn: 'root' })
export class AlertsStateService {
  private readonly alertsState = signal<readonly DemoAlert[]>(DEMO_ALERTS);

  readonly alerts = this.alertsState.asReadonly();
  readonly activeAlerts = computed(() => countActiveAlerts(this.alerts()));
  readonly reviewedAlerts = computed(() => countReviewedAlerts(this.alerts()));
  readonly totalAlerts = computed(() => this.alerts().length);
  readonly activeCriticalAlert = computed(() => getActiveCriticalAlert(this.alerts()));

  markReviewed(alertId: string): void {
    this.alertsState.update((alerts) => {
      const target = alerts.find((alert) => alert.id === alertId && alert.review === 'pending');

      if (!target) {
        return alerts;
      }

      return alerts.map((alert) => (alert === target ? { ...alert, review: 'reviewed' } : alert));
    });
  }
}
