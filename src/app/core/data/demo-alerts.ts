/**
 * SENA CROWD INTELLIGENCE — alertas simuladas del centro de eventos (Fase 3.4).
 *
 * Los nombres de zona y los porcentajes iniciales se derivan de `demo-monitoring.ts`
 * para no duplicar datos. Las alertas y sus fechas son ficticias: no representan
 * eventos en tiempo real ni lecturas de sensores conectados.
 *
 * Política de inicialización (3.4): se conservan los tres registros de la Fase 2.6.
 * `ALR-001` (Pasillo principal, crítica activa) se reconcilia como la alerta de
 * ocupación gestionada de su zona; `ALR-002` y `ALR-003` permanecen como registros
 * históricos resueltos. No se generan alertas automáticas en la carga inicial; la
 * evaluación por zona comienza a partir del primer cambio real de ocupación.
 */

import { DEMO_ZONES, getZoneOccupancy, type MonitoringZone } from './demo-monitoring';

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertStatus = 'active' | 'resolved';
export type AlertReviewStatus = 'pending' | 'reviewed';
export type AlertOrigin = 'demo' | 'automatic';
export type AlertCondition = 'occupancy' | 'info';

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
  readonly origin: AlertOrigin;
  readonly condition: AlertCondition;
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

export const ALERT_ORIGIN_LABELS: Record<AlertOrigin, string> = {
  demo: 'Registro de demostración',
  automatic: 'Generada automáticamente (simulada)',
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
    origin: 'demo',
    condition: 'occupancy',
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
    origin: 'demo',
    condition: 'occupancy',
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
    origin: 'demo',
    condition: 'info',
  },
];

export const AUTO_OCCUPANCY_ALERT_PREFIX = 'auto-occupancy-';

export function autoOccupancyAlertId(zoneId: string): string {
  return `${AUTO_OCCUPANCY_ALERT_PREFIX}${zoneId}`;
}

export function isAutoOccupancyAlert(alert: Pick<DemoAlert, 'id' | 'condition'>): boolean {
  return alert.condition === 'occupancy' && alert.id.startsWith(AUTO_OCCUPANCY_ALERT_PREFIX);
}

export function isOccupancyCondition(severity: AlertSeverity): boolean {
  return severity === 'warning' || severity === 'critical';
}

export function occupancySeverityLabel(severity: 'warning' | 'critical'): string {
  return severity === 'critical' ? 'Ocupación crítica' : 'Ocupación elevada';
}

export function formatSimulationTimestamp(date: Date = new Date()): string {
  const day = date.getDate();
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const month = months[date.getMonth()] ?? '';
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const suffix = hours >= 12 ? 'p. m.' : 'a. m.';
  hours = hours % 12 || 12;

  return `Simulación · ${day} ${month} ${year} · ${hours}:${minutes} ${suffix}`;
}

export function buildOccupancyAlertContent(
  zoneName: string,
  people: number,
  capacity: number,
  occupancy: number,
  severity: 'warning' | 'critical',
  status: AlertStatus,
): Pick<DemoAlert, 'title' | 'description' | 'detail'> {
  const title = occupancySeverityLabel(severity);
  const description = `Ocupación estimada del ${occupancy}%.`;
  const level = severity === 'critical' ? 'crítica' : 'elevada';
  const stateText =
    status === 'active'
      ? `se encuentra en nivel ${level}`
      : 'volvió a un nivel normal y la alerta automática se marcó como resuelta';

  const detail = `Simulación de ocupación: ${zoneName} ${stateText} (${people} de ${capacity} personas, ${occupancy}%). Alerta demostrativa generada por el motor de simulación; no proviene de sensores ni sustituye protocolos institucionales de emergencia.`;

  return { title, description, detail };
}

export function countActiveAlerts(alerts: readonly DemoAlert[] = DEMO_ALERTS): number {
  return alerts.filter((alert) => alert.status === 'active').length;
}

export function countReviewedAlerts(alerts: readonly DemoAlert[] = DEMO_ALERTS): number {
  return alerts.filter((alert) => alert.review === 'reviewed').length;
}

export function getActiveCriticalAlert(alerts: readonly DemoAlert[] = DEMO_ALERTS): DemoAlert | undefined {
  return alerts.find((alert) => alert.status === 'active' && alert.severity === 'critical');
}
