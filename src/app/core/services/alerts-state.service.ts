/**
 * SENA CROWD INTELLIGENCE — estado centralizado de alertas (Fase 3.4).
 *
 * Mantiene los registros simulados y su estado de revisión en memoria. El
 * Dashboard y el centro de alertas consultan este mismo servicio para que el
 * conteo de alertas activas sea siempre coherente.
 *
 * Expone operaciones internas para que el motor de ocupación pueda reconciliar
 * alertas automáticas sin crear duplicados ni modificar registros históricos.
 */

import { computed, Injectable, signal } from '@angular/core';

import {
  countActiveAlerts,
  countReviewedAlerts,
  DEMO_ALERTS,
  getActiveCriticalAlert,
  type AlertReviewStatus,
  type AlertSeverity,
  type AlertStatus,
  type DemoAlert,
} from '../data/demo-alerts';

export interface ManagedOccupancyAlertInput {
  readonly id: string;
  readonly zoneId: string;
  readonly zoneName: string;
  readonly severity: AlertSeverity;
  readonly status: AlertStatus;
  readonly title: string;
  readonly description: string;
  readonly detail: string;
  readonly occurredAt: string;
  readonly keepReview?: boolean;
}

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

  hasManagedOccupancyAlert(id: string): boolean {
    return this.alerts().some((alert) => alert.id === id);
  }

  resolveManagedOccupancyAlert(id: string, occurredAt: string, detail: string, description: string): void {
    this.alertsState.update((alerts) => {
      const target = alerts.find((alert) => alert.id === id);

      if (!target || target.status === 'resolved') {
        return alerts;
      }

      return alerts.map((alert) =>
        alert === target
          ? {
              ...alert,
              status: 'resolved' as AlertStatus,
              description,
              detail,
              occurredAt,
            }
          : alert,
      );
    });
  }

  upsertManagedOccupancyAlert(input: ManagedOccupancyAlertInput): void {
    this.alertsState.update((alerts) => {
      const existing = alerts.find((alert) => alert.id === input.id);

      if (!existing) {
        const next: DemoAlert = {
          id: input.id,
          title: input.title,
          zoneId: input.zoneId,
          zoneName: input.zoneName,
          severity: input.severity,
          description: input.description,
          detail: input.detail,
          occurredAt: input.occurredAt,
          status: input.status,
          review: 'pending',
          origin: 'automatic',
          condition: 'occupancy',
        };

        return [next, ...alerts];
      }

      const sameSeverity = existing.severity === input.severity;
      const sameStatus = existing.status === input.status;
      const keepReview = input.keepReview ?? (sameSeverity && sameStatus);
      const review: AlertReviewStatus = keepReview || existing.review === 'reviewed' ? existing.review : 'pending';

      if (
        sameSeverity &&
        sameStatus &&
        existing.description === input.description &&
        existing.detail === input.detail &&
        existing.title === input.title &&
        existing.zoneName === input.zoneName &&
        existing.review === review
      ) {
        return alerts;
      }

      return alerts.map((alert) =>
        alert === existing
          ? {
              ...alert,
              zoneName: input.zoneName,
              severity: input.severity,
              status: input.status,
              title: input.title,
              description: input.description,
              detail: input.detail,
              occurredAt: sameSeverity && sameStatus && existing.occurredAt ? existing.occurredAt : input.occurredAt,
              review,
              origin: existing.origin,
              condition: 'occupancy',
            }
          : alert,
      );
    });
  }
}
