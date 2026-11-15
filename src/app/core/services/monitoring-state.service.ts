/**
 * SENA CROWD INTELLIGENCE — estado centralizado del monitoreo (Fase 3.2).
 *
 * Fuente única de verdad en memoria para las zonas simuladas. La capa de datos
 * (`core/data/demo-monitoring.ts`) conserva los valores iniciales y las
 * funciones puras; este servicio expone lecturas reactivas y las operaciones
 * manuales del simulador.
 *
 * Las capacidades y los identificadores nunca cambian. Los valores iniciales
 * se conservan aparte para poder restablecer una zona o todas las zonas.
 */

import { computed, Injectable, signal } from '@angular/core';

import {
  countPeople,
  DEMO_LAST_UPDATE,
  DEMO_SAFE_ZONE,
  DEMO_ZONES,
  getOccupancyStatus,
  getZoneOccupancy,
  getZoneProgress,
  OCCUPANCY_STATUS_LABELS,
  type MonitoringZone,
  type OccupancyStatus,
} from '../data/demo-monitoring';

export interface ZoneSnapshot {
  readonly zone: MonitoringZone;
  readonly occupancy: number;
  readonly progress: number;
  readonly status: OccupancyStatus;
  readonly statusLabel: string;
}

export interface MonitoringSummary {
  readonly totalPeople: number;
  readonly monitoredZones: number;
  readonly safeZonePeople: number;
  readonly safeZoneOccupancy: number;
  readonly statusCounts: Readonly<Record<OccupancyStatus, number>>;
}

const INITIAL_PEOPLE_BY_ID: ReadonlyMap<string, number> = new Map(
  DEMO_ZONES.map((zone) => [zone.id, zone.people]),
);

function toZoneSnapshot(zone: MonitoringZone): ZoneSnapshot {
  const occupancy = getZoneOccupancy(zone);
  const status = getOccupancyStatus(occupancy);

  return {
    zone,
    occupancy,
    progress: getZoneProgress(zone),
    status,
    statusLabel: OCCUPANCY_STATUS_LABELS[status],
  };
}

@Injectable({ providedIn: 'root' })
export class MonitoringStateService {
  private readonly zonesState = signal<readonly MonitoringZone[]>(DEMO_ZONES);

  readonly zones = this.zonesState.asReadonly();
  readonly lastUpdate = DEMO_LAST_UPDATE;

  readonly snapshots = computed<readonly ZoneSnapshot[]>(() => this.zones().map(toZoneSnapshot));
  readonly snapshotsById = computed<ReadonlyMap<string, ZoneSnapshot>>(
    () => new Map(this.snapshots().map((snapshot) => [snapshot.zone.id, snapshot])),
  );

  readonly totalPeople = computed(() => countPeople(this.zones()));
  readonly monitoredZones = computed(() => this.zones().length);
  readonly hasOccupancyChanges = computed(() =>
    this.zones().some((zone) => {
      const initial = INITIAL_PEOPLE_BY_ID.get(zone.id);

      return initial !== undefined && zone.people !== initial;
    }),
  );

  readonly safeZone = computed<MonitoringZone>(() => this.zones().find((zone) => zone.safe) ?? DEMO_SAFE_ZONE);
  readonly safeZoneSnapshot = computed(() => toZoneSnapshot(this.safeZone()));
  readonly safeZonePeople = computed(() => this.safeZone().people);
  readonly safeZoneOccupancy = computed(() => this.safeZoneSnapshot().occupancy);
  readonly safeZoneStatus = computed(() => this.safeZoneSnapshot().status);
  readonly safeZoneStatusLabel = computed(() => this.safeZoneSnapshot().statusLabel);

  readonly summary = computed<MonitoringSummary>(() => {
    const statusCounts: Record<OccupancyStatus, number> = {
      normal: 0,
      warning: 0,
      critical: 0,
    };

    for (const snapshot of this.snapshots()) {
      statusCounts[snapshot.status] += 1;
    }

    const safeZone = this.safeZoneSnapshot();

    return {
      totalPeople: this.totalPeople(),
      monitoredZones: this.monitoredZones(),
      safeZonePeople: safeZone.zone.people,
      safeZoneOccupancy: safeZone.occupancy,
      statusCounts,
    };
  });

  zoneById(zoneId: string): MonitoringZone | undefined {
    return this.zones().find((zone) => zone.id === zoneId);
  }

  snapshotOf(zoneId: string): ZoneSnapshot | undefined {
    return this.snapshotsById().get(zoneId);
  }

  occupancyOf(zoneId: string): number {
    return this.snapshotOf(zoneId)?.occupancy ?? 0;
  }

  statusOf(zoneId: string): OccupancyStatus {
    return this.snapshotOf(zoneId)?.status ?? 'normal';
  }

  canIncrement(zoneId: string): boolean {
    const zone = this.zoneById(zoneId);

    return (
      zone !== undefined &&
      Number.isInteger(zone.people) &&
      zone.people >= 0 &&
      Number.isFinite(zone.capacity) &&
      zone.people < zone.capacity
    );
  }

  canDecrement(zoneId: string): boolean {
    const zone = this.zoneById(zoneId);

    return zone !== undefined && Number.isInteger(zone.people) && zone.people > 0;
  }

  isAtInitialOccupancy(zoneId: string): boolean {
    const zone = this.zoneById(zoneId);
    const initial = INITIAL_PEOPLE_BY_ID.get(zoneId);

    return zone !== undefined && initial !== undefined && zone.people === initial;
  }

  incrementOccupancy(zoneId: string): boolean {
    return this.updateZone(zoneId, (zone) => zone.people + 1);
  }

  decrementOccupancy(zoneId: string): boolean {
    return this.updateZone(zoneId, (zone) => zone.people - 1);
  }

  resetZoneOccupancy(zoneId: string): boolean {
    const initial = INITIAL_PEOPLE_BY_ID.get(zoneId);

    if (initial === undefined) {
      return false;
    }

    return this.updateZone(zoneId, () => initial);
  }

  resetAllOccupancy(): boolean {
    const zones = this.zones();
    let changed = false;

    const nextZones = zones.map((zone) => {
      const initial = INITIAL_PEOPLE_BY_ID.get(zone.id);

      if (initial === undefined || initial === zone.people) {
        return zone;
      }

      changed = true;

      return { ...zone, people: initial };
    });

    if (!changed) {
      return false;
    }

    this.zonesState.set(nextZones);

    return true;
  }

  private updateZone(zoneId: string, resolvePeople: (zone: MonitoringZone) => number): boolean {
    const zones = this.zones();
    const zone = zones.find((item) => item.id === zoneId);

    if (!zone || !Number.isInteger(zone.people) || !Number.isFinite(zone.capacity) || zone.capacity < 0) {
      return false;
    }

    const people = resolvePeople(zone);

    if (
      !Number.isInteger(people) ||
      people < 0 ||
      people > zone.capacity ||
      people === zone.people
    ) {
      return false;
    }

    this.zonesState.set(zones.map((item) => (item === zone ? { ...item, people } : item)));

    return true;
  }
}
