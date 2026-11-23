/**
 * SENA CROWD INTELLIGENCE — datos simulados del panel de monitoreo.
 *
 * Estos valores son de demostración y no provienen de sensores reales.
 * El total de personas se calcula a partir de las zonas para evitar
 * duplicar cifras en las plantillas.
 *
 * Los umbrales de ocupación son ilustrativos y no representan criterios
 * oficiales de seguridad.
 */

import type { ZoneType } from './zone-config.types';

// El tipo canónico vive en el contrato de configuración; se reexporta para no
// romper los consumidores existentes de `demo-monitoring`.
export type { ZoneType };

export type OccupancyStatus = 'normal' | 'warning' | 'critical';

export interface OccupancyThresholds {
  readonly warning: number;
  readonly critical: number;
}

export interface MonitoringZone {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly people: number;
  readonly capacity: number;
  readonly icon: string;
  readonly type: ZoneType;
  readonly safe?: boolean;
}

export const OCCUPANCY_THRESHOLDS: OccupancyThresholds = {
  warning: 70,
  critical: 80,
};

export const OCCUPANCY_STATUS_LABELS: Record<OccupancyStatus, string> = {
  normal: 'Normal',
  warning: 'Precaución',
  critical: 'Crítico',
};

export const DEMO_SAFE_ZONE: MonitoringZone = {
  id: 'zona-segura',
  code: 'Zona segura',
  name: 'Punto de encuentro',
  people: 12,
  capacity: 100,
  icon: 'shield-checkmark-outline',
  type: 'punto-encuentro',
  safe: true,
};

export const DEMO_ZONES: readonly MonitoringZone[] = [
  {
    id: 'cafeteria',
    code: 'A',
    name: 'Cafetería',
    people: 35,
    capacity: 50,
    icon: 'cafe-outline',
    type: 'cafeteria',
  },
  {
    id: 'biblioteca',
    code: 'B',
    name: 'Biblioteca',
    people: 18,
    capacity: 60,
    icon: 'book-outline',
    type: 'biblioteca',
  },
  {
    id: 'pasillo-principal',
    code: 'C',
    name: 'Pasillo principal',
    people: 42,
    capacity: 50,
    icon: 'walk-outline',
    type: 'pasillo',
  },
  DEMO_SAFE_ZONE,
];

export const DEMO_LAST_UPDATE = 'Hoy, 10:42 a. m.';

export function normalizePeople(people: number): number {
  if (!Number.isFinite(people)) {
    return 0;
  }

  return Math.max(0, people);
}

export function countPeople(zones: readonly MonitoringZone[]): number {
  return zones.reduce((total, zone) => total + normalizePeople(zone.people), 0);
}

export function calculateOccupancy(people: number, capacity: number): number {
  if (!Number.isFinite(people) || !Number.isFinite(capacity) || capacity <= 0) {
    return 0;
  }

  return Math.round((normalizePeople(people) / capacity) * 100);
}

export function getOccupancyStatus(
  occupancy: number,
  thresholds: OccupancyThresholds = OCCUPANCY_THRESHOLDS,
): OccupancyStatus {
  if (!Number.isFinite(occupancy)) {
    return 'normal';
  }

  if (occupancy >= thresholds.critical) {
    return 'critical';
  }

  if (occupancy >= thresholds.warning) {
    return 'warning';
  }

  return 'normal';
}

export function getZoneOccupancy(zone: MonitoringZone): number {
  return calculateOccupancy(zone.people, zone.capacity);
}

export function getZoneStatus(zone: MonitoringZone, thresholds?: OccupancyThresholds): OccupancyStatus {
  return getOccupancyStatus(getZoneOccupancy(zone), thresholds);
}

export function getZoneProgress(zone: MonitoringZone): number {
  return Math.min(100, Math.max(0, getZoneOccupancy(zone)));
}
