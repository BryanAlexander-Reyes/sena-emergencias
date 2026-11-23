import { Injectable, effect, inject } from '@angular/core';

import {
  autoOccupancyAlertId,
  buildOccupancyAlertContent,
  formatSimulationTimestamp,
  type AlertStatus,
} from '../data/demo-alerts';
import { getOccupancyStatus, getZoneOccupancy, type OccupancyStatus } from '../data/demo-monitoring';

import { AlertsStateService } from './alerts-state.service';
import { MonitoringStateService } from './monitoring-state.service';

/**
 * SENA CROWD INTELLIGENCE — motor de alertas por ocupación (Fase 3.4).
 *
 * Reconcilia la alerta automática de ocupación de cada zona a partir del estado
 * centralizado de monitoreo. Solo se evalúa cuando una zona recibe un cambio
 * real de ocupación (usuario/simulación), nunca en la carga inicial, para
 * preservar los registros de demostración aprobados.
 *
 * Política: `ALR-001` se reutiliza como alerta gestionada del Pasillo principal.
 * `ALR-002` y `ALR-003` se conservan como históricos; las nuevas activaciones se
 * gestionan con identificadores estables `auto-occupancy-<zoneId>`.
 */

const MANAGED_ALERT_ID: Readonly<Record<string, string>> = {
  'pasillo-principal': 'ALR-001',
};

function managedAlertId(zoneId: string): string {
  return MANAGED_ALERT_ID[zoneId] ?? autoOccupancyAlertId(zoneId);
}

function occupancySeverity(status: OccupancyStatus): 'warning' | 'critical' | null {
  if (status === 'warning') return 'warning';
  if (status === 'critical') return 'critical';
  return null;
}

@Injectable({ providedIn: 'root' })
export class OccupancyAlertEngineService {
  private readonly monitoring = inject(MonitoringStateService);
  private readonly alerts = inject(AlertsStateService);
  private readonly reconciledZones = new Set<string>();
  private readonly previousPeople = new Map<string, number>();
  private baselineCaptured = false;

  constructor() {
    // React once per logical occupancy change. The first run captures the baseline
    // so no automatic alerts are generated during initial load.
    effect(() => {
      const zones = this.monitoring.zones();

      if (!this.baselineCaptured) {
        for (const zone of zones) {
          this.previousPeople.set(zone.id, zone.people);
        }
        this.baselineCaptured = true;
        return;
      }

      for (const zone of zones) {
        const previous = this.previousPeople.get(zone.id);

        if (previous === undefined || previous !== zone.people) {
          this.previousPeople.set(zone.id, zone.people);
          this.reconcileZone(zone.id);
        }
      }
    });
  }

  reconcileZone(zoneId: string): void {
    const zone = this.monitoring.zoneById(zoneId);

    if (!zone) {
      return;
    }

    const wasReconciled = this.reconciledZones.has(zoneId);
    this.reconciledZones.add(zoneId);

    const occupancy = getZoneOccupancy(zone);
    const status = getOccupancyStatus(occupancy);
    const severity = occupancySeverity(status);
    const alertId = managedAlertId(zoneId);
    const timestamp = formatSimulationTimestamp();

    if (!severity) {
      if (this.alerts.hasManagedOccupancyAlert(alertId)) {
        const content = buildOccupancyAlertContent(
          zone.name,
          zone.people,
          zone.capacity,
          occupancy,
          'warning',
          'resolved',
        );
        this.alerts.resolveManagedOccupancyAlert(alertId, timestamp, content.detail, content.description);
      }
      return;
    }

    const existing = this.alerts.alerts().find((alert) => alert.id === alertId);
    const alertStatus: AlertStatus = 'active';
    const content = buildOccupancyAlertContent(zone.name, zone.people, zone.capacity, occupancy, severity, alertStatus);

    // First reconciliation of a pre-existing demo alert: adopt it as managed without
    // changing its meaning if it already matches the current occupancy level.
    if (!wasReconciled && existing && existing.origin === 'demo') {
      const matches = existing.status === 'active' && existing.severity === severity;
      this.alerts.upsertManagedOccupancyAlert({
        id: alertId,
        zoneId,
        zoneName: zone.name,
        severity,
        status: alertStatus,
        title: content.title,
        description: matches ? existing.description : content.description,
        detail: matches ? existing.detail : content.detail,
        occurredAt: matches ? existing.occurredAt : timestamp,
        keepReview: matches,
      });
      return;
    }

    if (!existing) {
      this.alerts.upsertManagedOccupancyAlert({
        id: alertId,
        zoneId,
        zoneName: zone.name,
        severity,
        status: alertStatus,
        title: content.title,
        description: content.description,
        detail: content.detail,
        occurredAt: timestamp,
        keepReview: false,
      });
      return;
    }

    this.alerts.upsertManagedOccupancyAlert({
      id: alertId,
      zoneId,
      zoneName: zone.name,
      severity,
      status: alertStatus,
      title: content.title,
      description: content.description,
      detail: content.detail,
      occurredAt: timestamp,
      keepReview: true,
    });
  }

  reconcileZones(zoneIds: readonly string[]): void {
    for (const zoneId of zoneIds) {
      this.reconcileZone(zoneId);
    }
  }

  // Helper for inspection/testing.
  isZoneReconciled(zoneId: string): boolean {
    return this.reconciledZones.has(zoneId);
  }
}
