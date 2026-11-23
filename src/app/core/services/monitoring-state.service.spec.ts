import { TestBed } from '@angular/core/testing';

import {
  DEMO_SAFE_ZONE,
  DEMO_ZONES,
  getOccupancyStatus,
  getZoneOccupancy,
  getZoneProgress,
  OCCUPANCY_STATUS_LABELS,
} from '../data/demo-monitoring';

import { MonitoringStateService } from './monitoring-state.service';

describe('MonitoringStateService', () => {
  let service: MonitoringStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MonitoringStateService);
  });

  it('should be a singleton shared through dependency injection', () => {
    expect(TestBed.inject(MonitoringStateService)).toBe(service);
  });

  it('should expose the four demo zones without duplicating their data', () => {
    expect(service.zones()).toBe(DEMO_ZONES);
    expect(service.zones().map((zone) => zone.id)).toEqual([
      'cafeteria',
      'biblioteca',
      'pasillo-principal',
      'zona-segura',
    ]);
    expect(service.monitoredZones()).toBe(4);
  });

  it('should calculate the total people from the zones', () => {
    expect(service.totalPeople()).toBe(107);
    expect(service.totalPeople()).toBe(service.zones().reduce((total, zone) => total + zone.people, 0));
  });

  it('should derive the occupancies, statuses and labels of every zone', () => {
    expect(service.snapshots().map((snapshot) => snapshot.occupancy)).toEqual([70, 30, 84, 12]);
    expect(service.snapshots().map((snapshot) => snapshot.progress)).toEqual([70, 30, 84, 12]);
    expect(service.snapshots().map((snapshot) => snapshot.status)).toEqual(['warning', 'normal', 'critical', 'normal']);
    expect(service.snapshots().map((snapshot) => snapshot.statusLabel)).toEqual([
      'Precaución',
      'Normal',
      'Crítico',
      'Normal',
    ]);
  });

  it('should align every snapshot with the pure helper functions', () => {
    for (const snapshot of service.snapshots()) {
      expect(snapshot.occupancy).toBe(getZoneOccupancy(snapshot.zone));
      expect(snapshot.status).toBe(getOccupancyStatus(snapshot.occupancy));
      expect(snapshot.progress).toBe(getZoneProgress(snapshot.zone));
      expect(snapshot.statusLabel).toBe(OCCUPANCY_STATUS_LABELS[snapshot.status]);
    }
  });

  it('should expose the safe zone values from the shared state', () => {
    expect(service.safeZone()).toBe(DEMO_SAFE_ZONE);
    expect(service.safeZonePeople()).toBe(12);
    expect(service.safeZone().capacity).toBe(100);
    expect(service.safeZoneOccupancy()).toBe(12);
    expect(service.safeZoneStatus()).toBe('normal');
    expect(service.safeZoneStatusLabel()).toBe('Normal');
    expect(service.safeZoneSnapshot().occupancy).toBe(12);
  });

  it('should summarize the shared state coherently', () => {
    expect(service.summary()).toEqual({
      totalPeople: 107,
      monitoredZones: 4,
      safeZonePeople: 12,
      safeZoneOccupancy: 12,
      statusCounts: { normal: 2, warning: 1, critical: 1 },
    });
  });

  it('should look up zones and snapshots by identifier', () => {
    const cafeteria = service.zoneById('cafeteria');

    expect(cafeteria?.name).toBe('Cafetería');
    expect(service.snapshotOf('cafeteria')).toBe(service.snapshots()[0]);
    expect(service.occupancyOf('cafeteria')).toBe(70);
    expect(service.statusOf('cafeteria')).toBe('warning');
    expect(service.zoneById('missing')).toBeUndefined();
    expect(service.snapshotOf('missing')).toBeUndefined();
    expect(service.occupancyOf('missing')).toBe(0);
    expect(service.statusOf('missing')).toBe('normal');
  });

  it('should keep the zone signals read-only', () => {
    expect('set' in service.zones).toBe(false);
    expect('set' in service.totalPeople).toBe(false);
    expect('update' in service.zones).toBe(false);
  });

  it('should increment one person and recalculate the derived values', () => {
    expect(service.incrementOccupancy('cafeteria')).toBe(true);

    expect(service.zoneById('cafeteria')?.people).toBe(36);
    expect(service.occupancyOf('cafeteria')).toBe(72);
    expect(service.statusOf('cafeteria')).toBe('warning');
    expect(service.totalPeople()).toBe(108);
    expect(service.hasOccupancyChanges()).toBe(true);
    expect(service.isAtInitialOccupancy('cafeteria')).toBe(false);
  });

  it('should decrement one person and cross the warning threshold downwards', () => {
    expect(service.decrementOccupancy('cafeteria')).toBe(true);

    expect(service.zoneById('cafeteria')?.people).toBe(34);
    expect(service.occupancyOf('cafeteria')).toBe(68);
    expect(service.statusOf('cafeteria')).toBe('normal');
    expect(service.totalPeople()).toBe(106);
  });

  it('should cross the critical threshold when incrementing', () => {
    for (let step = 0; step < 5; step += 1) {
      expect(service.incrementOccupancy('cafeteria')).toBe(true);
    }

    expect(service.zoneById('cafeteria')?.people).toBe(40);
    expect(service.occupancyOf('cafeteria')).toBe(80);
    expect(service.statusOf('cafeteria')).toBe('critical');
    expect(service.snapshotOf('cafeteria')?.statusLabel).toBe('Crítico');
    expect(service.summary().statusCounts).toEqual({ normal: 2, warning: 0, critical: 2 });
  });

  it('should never allow a negative occupancy', () => {
    for (let step = 0; step < 18; step += 1) {
      expect(service.decrementOccupancy('biblioteca')).toBe(true);
    }

    const before = service.zones();

    expect(service.zoneById('biblioteca')?.people).toBe(0);
    expect(service.occupancyOf('biblioteca')).toBe(0);
    expect(service.canDecrement('biblioteca')).toBe(false);
    expect(service.decrementOccupancy('biblioteca')).toBe(false);
    expect(service.zones()).toBe(before);
  });

  it('should never exceed the configured capacity', () => {
    for (let step = 0; step < 8; step += 1) {
      expect(service.incrementOccupancy('pasillo-principal')).toBe(true);
    }

    const before = service.zones();

    expect(service.zoneById('pasillo-principal')?.people).toBe(50);
    expect(service.occupancyOf('pasillo-principal')).toBe(100);
    expect(service.statusOf('pasillo-principal')).toBe('critical');
    expect(service.canIncrement('pasillo-principal')).toBe(false);
    expect(service.incrementOccupancy('pasillo-principal')).toBe(false);
    expect(service.zones()).toBe(before);
  });

  it('should ignore unknown zone identifiers', () => {
    const before = service.zones();

    expect(service.incrementOccupancy('missing')).toBe(false);
    expect(service.decrementOccupancy('missing')).toBe(false);
    expect(service.resetZoneOccupancy('missing')).toBe(false);
    expect(service.canIncrement('missing')).toBe(false);
    expect(service.canDecrement('missing')).toBe(false);
    expect(service.isAtInitialOccupancy('missing')).toBe(false);
    expect(service.zones()).toBe(before);
  });

  it('should update the safe zone through the same shared state', () => {
    expect(service.incrementOccupancy('zona-segura')).toBe(true);

    expect(service.safeZonePeople()).toBe(13);
    expect(service.safeZoneOccupancy()).toBe(13);
    expect(service.safeZoneStatus()).toBe('normal');
    expect(service.totalPeople()).toBe(108);
    expect(service.summary().safeZonePeople).toBe(13);
  });

  it('should reset a single zone without modifying the others', () => {
    service.incrementOccupancy('cafeteria');
    service.incrementOccupancy('cafeteria');
    service.incrementOccupancy('biblioteca');

    expect(service.resetZoneOccupancy('cafeteria')).toBe(true);

    expect(service.zoneById('cafeteria')?.people).toBe(35);
    expect(service.zoneById('biblioteca')?.people).toBe(19);
    expect(service.totalPeople()).toBe(108);
    expect(service.hasOccupancyChanges()).toBe(true);
    expect(service.isAtInitialOccupancy('cafeteria')).toBe(true);
  });

  it('should reset every zone to its initial occupancy', () => {
    service.incrementOccupancy('cafeteria');
    service.decrementOccupancy('pasillo-principal');
    service.incrementOccupancy('zona-segura');

    expect(service.resetAllOccupancy()).toBe(true);

    expect(service.zones().map((zone) => zone.people)).toEqual([35, 18, 42, 12]);
    expect(service.zones().map((zone) => zone.capacity)).toEqual([50, 60, 50, 100]);
    expect(service.totalPeople()).toBe(107);
    expect(service.hasOccupancyChanges()).toBe(false);
    expect(service.summary().statusCounts).toEqual({ normal: 2, warning: 1, critical: 1 });
  });

  it('should keep the same array when a reset has nothing to change', () => {
    const before = service.zones();

    expect(service.resetZoneOccupancy('cafeteria')).toBe(false);
    expect(service.resetAllOccupancy()).toBe(false);
    expect(service.zones()).toBe(before);
  });

  it('should preserve the initial demo data and immutable untouched zones', () => {
    const before = service.zones();
    const untouchedZone = service.zoneById('biblioteca');

    service.incrementOccupancy('cafeteria');

    expect(DEMO_ZONES[0].people).toBe(35);
    expect(service.zones()).not.toBe(before);
    expect(service.zoneById('cafeteria')).not.toBe(before[0]);
    expect(service.zoneById('biblioteca')).toBe(untouchedZone);
    expect(service.zoneById('cafeteria')?.capacity).toBe(50);
  });
});
