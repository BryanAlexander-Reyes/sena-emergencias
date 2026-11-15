/**
 * SENA CROWD INTELLIGENCE — alertas simuladas del centro de eventos (Fase 2.6).
 *
 * Los nombres de zona y los porcentajes se derivan de `demo-monitoring.ts`
 * para no duplicar los datos compartidos con el Dashboard y el Mapa.
 *
 * Las alertas y sus fechas son ficticias: no representan eventos en tiempo
 * real ni lecturas de sensores conectados.
 */

import { DEMO_ZONES, getZoneOccupancy, type MonitoringZone } from './demo-monitoring';

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertStatus = 'active' | 'resolved';
export type AlertReviewStatus = 'pending' | 'reviewed';

export interface DemoAlert {
  readonly id: string;
  readonly title: string;
  readonly zoneId: string;
  readonly zoneName: string;
  readonly severity: AlertSeverity;
  readonly description: string;
  readonly detail: string;
  readonly occurredAt: string;
  readonly status: AlertStatus;
  readonly review: AlertReviewStatus;
}

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  critical: 'Crítica',
  warning: 'Precaución',
  info: 'Informativa',
};

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  active: 'Activa',
  resolved: 'Resuelta',
};

export const ALERT_REVIEW_LABELS: Record<AlertReviewStatus, string> = {
  pending: 'Pendiente',
  reviewed: 'Revisada',
};

function requireZone(zoneId: string): MonitoringZone {
  const zone = DEMO_ZONES.find((item) => item.id === zoneId);

  if (!zone) {
    throw new Error(`Zona de demostración no encontrada: ${zoneId}`);
  }

  return zone;
}

const cafeteria = requireZone('cafeteria');
const biblioteca = requireZone('biblioteca');
const pasilloPrincipal = requireZone('pasillo-principal');

export const DEMO_ALERTS: readonly DemoAlert[] = [
  {
    id: 'ALR-001',
    title: 'Ocupación crítica',
    zoneId: pasilloPrincipal.id,
    zoneName: pasilloPrincipal.name,
    severity: 'critical',
    description: `Ocupación estimada del ${getZoneOccupancy(pasilloPrincipal)}%.`,
    detail: `La ocupación estimada del ${pasilloPrincipal.name} alcanzó el ${getZoneOccupancy(pasilloPrincipal)}% de su capacidad (${pasilloPrincipal.people} de ${pasilloPrincipal.capacity} personas). Registro de demostración con fines de visualización.`,
    occurredAt: 'Demo · 12 nov 2026 · 10:42 a. m.',
    status: 'active',
    review: 'pending',
  },
  {
    id: 'ALR-002',
    title: 'Ocupación elevada',
    zoneId: cafeteria.id,
    zoneName: cafeteria.name,
    severity: 'warning',
    description: `Ocupación estimada del ${getZoneOccupancy(cafeteria)}%.`,
    detail: `La ocupación estimada de la ${cafeteria.name} se registró en ${getZoneOccupancy(cafeteria)}% de su capacidad (${cafeteria.people} de ${cafeteria.capacity} personas). El evento figura como resuelto dentro de la demostración.`,
    occurredAt: 'Demo · 11 nov 2026 · 4:15 p. m.',
    status: 'resolved',
    review: 'reviewed',
  },
  {
    id: 'ALR-003',
    title: 'Estado actualizado',
    zoneId: biblioteca.id,
    zoneName: biblioteca.name,
    severity: 'info',
    description: 'Zona en estado normal.',
    detail: `La ${biblioteca.name} se reporta en estado normal dentro de la simulación (${biblioteca.people} de ${biblioteca.capacity} personas). Evento informativo de demostración, sin riesgo asociado.`,
    occurredAt: 'Demo · 10 nov 2026 · 8:05 a. m.',
    status: 'resolved',
    review: 'reviewed',
  },
];

export function countActiveAlerts(alerts: readonly DemoAlert[] = DEMO_ALERTS): number {
  return alerts.filter((alert) => alert.status === 'active').length;
}

export function countReviewedAlerts(alerts: readonly DemoAlert[] = DEMO_ALERTS): number {
  return alerts.filter((alert) => alert.review === 'reviewed').length;
}

export function getActiveCriticalAlert(alerts: readonly DemoAlert[] = DEMO_ALERTS): DemoAlert | undefined {
  return alerts.find((alert) => alert.status === 'active' && alert.severity === 'critical');
}
