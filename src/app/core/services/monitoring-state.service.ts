/**
 * SENA CROWD INTELLIGENCE — estado centralizado del monitoreo (Fases 3.2–3.5).
 *
 * Fuente única de verdad en memoria para la OCUPACIÓN SIMULADA. La
 * configuración de zonas vive aparte, en `ZoneConfigStateService` (ZONAS.3):
 * este servicio consume ese store raíz para que Inicio, Zonas y Mapa vean
 * exactamente la misma configuración sin consultar Supabase por pantalla.
 *
 * En modo DEMO se conservan las referencias originales de `DEMO_ZONES` y todas
 * las reglas de simulación existentes. En modo REMOTO las zonas se proyectan
 * desde la configuración validada, con ocupación simulada inicializada en cero.
 */

import { computed, Injectable, inject, signal, type Signal } from '@angular/core';

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
import type { ZoneConfig } from '../data/zone-config.types';

import { SimulationHistoryService, type OccupancyChangeAction } from './simulation-history.service';
import { ZoneConfigStateService, type ZoneConfigStatus } from './zone-config-state.service';

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

const INITIAL_PEOPLE_BY_ID: ReadonlyMap<string, number> = new Map(DEMO_ZONES.map((zone) => [zone.id, zone.people]));

/** Marcador explícito de "sin zonas", nunca datos DEMO disfrazados de reales. */
const REMOTE_EMPTY_ZONE: MonitoringZone = {
  id: 'sin-zonas-configuradas',
  code: '—',
  name: 'Sin zonas disponibles',
  people: 0,
  capacity: 0,
  icon: 'information-circle-outline',
  type: 'punto-encuentro',
  safe: false,
};

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

/** Proyecta configuración pura + ocupación simulada sin mezclar sus orígenes. */
function toMonitoringZone(config: ZoneConfig, people: number): MonitoringZone {
  return {
    id: config.id,
    code: config.codigo,
    name: config.nombre,
    people,
    capacity: config.capacidad,
    icon: config.icono,
    type: config.tipo,
    safe: config.segura,
  };
}

@Injectable({ providedIn: 'root' })
export class MonitoringStateService {
  private readonly zoneConfigState = inject(ZoneConfigStateService);
  private readonly history = inject(SimulationHistoryService);

  private readonly demoZonesState = signal<readonly MonitoringZone[]>(DEMO_ZONES);
  private readonly remotePeopleById = signal<ReadonlyMap<string, number>>(new Map());

  readonly zones = computed<readonly MonitoringZone[]>(() => {
    if (this.zoneConfigState.mode() === 'demo') {
      return this.demoZonesState();
    }

    return this.zoneConfigState
      .activeConfigs()
      .map((config) => toMonitoringZone(config, this.remotePeopleById().get(config.id) ?? 0));
  });
  readonly lastUpdate = DEMO_LAST_UPDATE;

  readonly snapshots = computed<readonly ZoneSnapshot[]>(() => this.zones().map(toZoneSnapshot));
  readonly snapshotsById = computed<ReadonlyMap<string, ZoneSnapshot>>(
    () => new Map(this.snapshots().map((snapshot) => [snapshot.zone.id, snapshot])),
  );

  readonly totalPeople = computed(() => countPeople(this.zones()));
  readonly monitoredZones = computed(() => this.zones().length);
  readonly hasOccupancyChanges = computed(() =>
    this.zones().some((zone) => {
      const initial = this.initialPeopleOf(zone.id);

      return initial !== undefined && zone.people !== initial;
    }),
  );

  readonly safeZone = computed<MonitoringZone>(() => {
    const zones = this.zones();
    const safeZone = zones.find((zone) => zone.safe === true);

    if (safeZone) {
      return safeZone;
    }

    if (this.zoneConfigState.mode() === 'demo') {
      return DEMO_SAFE_ZONE;
    }

    return zones[0] ?? REMOTE_EMPTY_ZONE;
  });
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

  /** Señales del store de configuración, compartidas por las tres pantallas. */
  readonly zoneConfigs = this.zoneConfigState.configs;
  readonly activeZoneConfigs = this.zoneConfigState.activeConfigs;
  readonly zoneConfigMode = this.zoneConfigState.mode;
  readonly zoneConfigLoading = this.zoneConfigState.loading;
  readonly zoneConfigEmpty = this.zoneConfigState.empty;
  readonly zoneConfigError = this.zoneConfigState.error;
  readonly zoneConfigStatus: Signal<ZoneConfigStatus> = this.zoneConfigState.status;

  /** Refresco al entrar a una pantalla, sin consultas Supabase independientes. */
  ensureZoneConfigs(): Promise<void> {
    return this.zoneConfigState.onScreenEnter();
  }

  /** Reintento explícito: usa la misma petición en curso si ya hay una. */
  retryZoneConfigs(): Promise<void> {
    return this.zoneConfigState.retry();
  }

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
    const initial = this.initialPeopleOf(zoneId);

    return zone !== undefined && initial !== undefined && zone.people === initial;
  }

  incrementOccupancy(zoneId: string): boolean {
    return this.updateZone(zoneId, (zone) => zone.people + 1, 'increment');
  }

  decrementOccupancy(zoneId: string): boolean {
    return this.updateZone(zoneId, (zone) => zone.people - 1, 'decrement');
  }

  resetZoneOccupancy(zoneId: string): boolean {
    const initial = this.initialPeopleOf(zoneId);

    if (initial === undefined) {
      return false;
    }

    return this.updateZone(zoneId, () => initial, 'reset-zone');
  }

  resetAllOccupancy(): boolean {
    const zones = this.zones();
    const changes: { zone: MonitoringZone; previousPeople: number; newPeople: number }[] = [];
    const nextRemotePeople = new Map(this.remotePeopleById());

    const nextDemoZones = zones.map((zone) => {
      const initial = this.initialPeopleOf(zone.id);

      if (initial === undefined || initial === zone.people) {
        return zone;
      }

      changes.push({ zone, previousPeople: zone.people, newPeople: initial });
      nextRemotePeople.set(zone.id, initial);

      return { ...zone, people: initial };
    });

    if (changes.length === 0) {
      return false;
    }

    this.applyOccupancyChange(nextDemoZones, nextRemotePeople);

    const operationId = `reset-all-${Date.now().toString(36)}`;
    const totalAfter = this.totalPeople();
    for (const change of changes) {
      this.history.recordChange({
        zoneId: change.zone.id,
        zoneName: change.zone.name,
        action: 'reset-all',
        previousPeople: change.previousPeople,
        newPeople: change.newPeople,
        capacity: change.zone.capacity,
        totalAfter,
        operationId,
      });
    }

    return true;
  }

  private get usingRemoteConfig(): boolean {
    return this.zoneConfigState.mode() === 'remote';
  }

  private initialPeopleOf(zoneId: string): number | undefined {
    if (this.usingRemoteConfig) {
      return this.zoneConfigState.activeConfigs().some((config) => config.id === zoneId) ? 0 : undefined;
    }

    return INITIAL_PEOPLE_BY_ID.get(zoneId);
  }

  private applyOccupancyChange(
    nextDemoZones: readonly MonitoringZone[],
    nextRemotePeople: ReadonlyMap<string, number>,
  ): void {
    if (this.usingRemoteConfig) {
      this.remotePeopleById.set(nextRemotePeople);

      return;
    }

    this.demoZonesState.set(nextDemoZones);
  }

  private updateZone(
    zoneId: string,
    resolvePeople: (zone: MonitoringZone) => number,
    action?: OccupancyChangeAction,
  ): boolean {
    const zones = this.zones();
    const zone = zones.find((item) => item.id === zoneId);

    if (!zone || !Number.isInteger(zone.people) || !Number.isFinite(zone.capacity) || zone.capacity < 0) {
      return false;
    }

    const people = resolvePeople(zone);

    if (!Number.isInteger(people) || people < 0 || people > zone.capacity || people === zone.people) {
      return false;
    }

    if (this.usingRemoteConfig) {
      const nextRemotePeople = new Map(this.remotePeopleById());
      nextRemotePeople.set(zoneId, people);
      this.remotePeopleById.set(nextRemotePeople);
    } else {
      this.demoZonesState.set(zones.map((item) => (item === zone ? { ...item, people } : item)));
    }

    if (action) {
      this.history.recordChange({
        zoneId: zone.id,
        zoneName: zone.name,
        action,
        previousPeople: zone.people,
        newPeople: people,
        capacity: zone.capacity,
        totalAfter: this.totalPeople(),
      });
    }

    return true;
  }
}
