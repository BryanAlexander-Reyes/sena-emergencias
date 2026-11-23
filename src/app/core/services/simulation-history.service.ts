import { Injectable, computed, signal } from '@angular/core';

import {
  countPeople,
  DEMO_ZONES,
  getOccupancyStatus,
  getZoneOccupancy,
  type OccupancyStatus,
} from '../data/demo-monitoring';

export type OccupancyChangeAction = 'increment' | 'decrement' | 'reset-zone' | 'reset-all';

export interface OccupancyHistoryEvent {
  readonly id: string;
  readonly occurredAt: Date;
  readonly zoneId: string;
  readonly zoneName: string;
  readonly action: OccupancyChangeAction;
  readonly actionLabel: string;
  readonly previousPeople: number;
  readonly newPeople: number;
  readonly delta: number;
  readonly resultOccupancy: number;
  readonly resultStatus: OccupancyStatus;
  readonly totalAfter: number;
  readonly operationId?: string;
}

export interface ZoneHistoryStats {
  readonly zoneId: string;
  readonly zoneName: string;
  readonly changeCount: number;
  readonly maxPeopleObserved: number;
}

export const ACTION_LABELS: Readonly<Record<OccupancyChangeAction, string>> = {
  increment: 'Incremento manual',
  decrement: 'Decremento manual',
  'reset-zone': 'Restablecimiento de zona',
  'reset-all': 'Restablecimiento general',
};

const INITIAL_PEOPLE_BY_ID: ReadonlyMap<string, number> = new Map(DEMO_ZONES.map((zone) => [zone.id, zone.people]));
const INITIAL_TOTAL = countPeople(DEMO_ZONES);

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

@Injectable({ providedIn: 'root' })
export class SimulationHistoryService {
  private readonly eventsState = signal<readonly OccupancyHistoryEvent[]>([]);

  readonly events = this.eventsState.asReadonly();
  readonly eventsNewestFirst = computed(() => [...this.events()].reverse());
  readonly changeCount = computed(() => this.events().length);
  readonly isEmpty = computed(() => this.events().length === 0);

  readonly maxTotalObserved = computed(() => {
    let max = INITIAL_TOTAL;
    for (const event of this.events()) {
      max = Math.max(max, event.totalAfter);
    }
    return max;
  });

  readonly totalTimeline = computed<readonly { readonly total: number; readonly at?: Date; readonly label: string }[]>(
    () => {
      const points: { total: number; at?: Date; label: string }[] = [{ total: INITIAL_TOTAL, label: 'Inicio' }];
      for (const event of this.events()) {
        points.push({ total: event.totalAfter, at: event.occurredAt, label: event.zoneName });
      }
      return points;
    },
  );

  readonly zoneStats = computed<readonly ZoneHistoryStats[]>(() => {
    const stats = new Map<string, { count: number; max: number }>();
    for (const zone of DEMO_ZONES) {
      stats.set(zone.id, { count: 0, max: INITIAL_PEOPLE_BY_ID.get(zone.id) ?? 0 });
    }
    for (const event of this.events()) {
      const entry = stats.get(event.zoneId);
      if (!entry) continue;
      entry.count += 1;
      entry.max = Math.max(entry.max, event.newPeople);
    }
    return DEMO_ZONES.map((zone) => {
      const entry = stats.get(zone.id)!;
      return {
        zoneId: zone.id,
        zoneName: zone.name,
        changeCount: entry.count,
        maxPeopleObserved: entry.max,
      };
    });
  });

  recordChange(params: {
    zoneId: string;
    zoneName: string;
    action: OccupancyChangeAction;
    previousPeople: number;
    newPeople: number;
    capacity: number;
    totalAfter: number;
    operationId?: string;
  }): void {
    const { zoneId, zoneName, action, previousPeople, newPeople, capacity, totalAfter, operationId } = params;

    if (!Number.isInteger(previousPeople) || !Number.isInteger(newPeople) || previousPeople === newPeople) {
      return;
    }

    const zoneRef = {
      id: zoneId,
      code: '',
      name: zoneName,
      people: newPeople,
      capacity,
      icon: '',
      type: 'cafeteria' as const,
    };
    const resultOccupancy = getZoneOccupancy(zoneRef);
    const resultStatus = getOccupancyStatus(resultOccupancy);

    const event: OccupancyHistoryEvent = {
      id: createId(),
      occurredAt: new Date(),
      zoneId,
      zoneName,
      action,
      actionLabel: ACTION_LABELS[action],
      previousPeople,
      newPeople,
      delta: newPeople - previousPeople,
      resultOccupancy,
      resultStatus,
      totalAfter,
      ...(operationId ? { operationId } : {}),
    };

    this.eventsState.update((events) => [...events, event]);
  }

  eventsForZone(zoneId: string): readonly OccupancyHistoryEvent[] {
    return this.events().filter((event) => event.zoneId === zoneId);
  }
}
