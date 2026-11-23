import {
  calculateOccupancy,
  countPeople,
  DEMO_SAFE_ZONE,
  DEMO_ZONES,
  getOccupancyStatus,
  getZoneOccupancy,
  getZoneProgress,
  getZoneStatus,
  normalizePeople,
  OCCUPANCY_STATUS_LABELS,
  OCCUPANCY_THRESHOLDS,
  type MonitoringZone,
} from './demo-monitoring';

const zoneWith = (overrides: Partial<MonitoringZone>): MonitoringZone => ({
  ...DEMO_ZONES[0],
  ...overrides,
});

describe('demo monitoring data', () => {
  it('should expose the four demo zones with the expected occupancies', () => {
    expect(DEMO_ZONES.map((zone) => zone.code)).toEqual(['A', 'B', 'C', 'Zona segura']);
    expect(DEMO_ZONES.map((zone) => getZoneOccupancy(zone))).toEqual([70, 30, 84, 12]);
    expect(countPeople(DEMO_ZONES)).toBe(107);
  });

  it('should derive statuses from the occupancy percentages', () => {
    expect(DEMO_ZONES.map((zone) => getZoneStatus(zone))).toEqual(['warning', 'normal', 'critical', 'normal']);
    expect(DEMO_ZONES.map((zone) => OCCUPANCY_STATUS_LABELS[getZoneStatus(zone)])).toEqual([
      'Precaución',
      'Normal',
      'Crítico',
      'Normal',
    ]);
  });

  it('should describe the type of every zone', () => {
    expect(DEMO_ZONES.map((zone) => zone.type)).toEqual(['cafeteria', 'biblioteca', 'pasillo', 'punto-encuentro']);
    expect(DEMO_SAFE_ZONE.type).toBe('punto-encuentro');
  });

  it('should apply the illustrative thresholds at their boundaries', () => {
    expect(OCCUPANCY_THRESHOLDS).toEqual({ warning: 70, critical: 80 });
    expect(getOccupancyStatus(69)).toBe('normal');
    expect(getOccupancyStatus(70)).toBe('warning');
    expect(getOccupancyStatus(79)).toBe('warning');
    expect(getOccupancyStatus(80)).toBe('critical');
  });

  it('should calculate and round the occupancy percentage', () => {
    expect(calculateOccupancy(35, 50)).toBe(70);
    expect(calculateOccupancy(1, 3)).toBe(33);
    expect(calculateOccupancy(2, 3)).toBe(67);
  });

  it('should avoid dividing by zero', () => {
    expect(calculateOccupancy(10, 0)).toBe(0);
    expect(calculateOccupancy(10, -5)).toBe(0);
  });

  it('should normalize negative and non-finite people values', () => {
    expect(normalizePeople(35)).toBe(35);
    expect(normalizePeople(-8)).toBe(0);
    expect(normalizePeople(Number.NaN)).toBe(0);
    expect(normalizePeople(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('should ignore invalid people when counting the total', () => {
    expect(countPeople([zoneWith({ people: -5 }), zoneWith({ people: Number.NaN }), zoneWith({ people: 12 })])).toBe(
      12,
    );
  });

  it('should treat invalid or negative capacity as zero occupancy', () => {
    expect(calculateOccupancy(10, Number.NaN)).toBe(0);
    expect(calculateOccupancy(Number.NaN, 50)).toBe(0);
    expect(getZoneOccupancy(zoneWith({ capacity: 0 }))).toBe(0);
    expect(getZoneOccupancy(zoneWith({ capacity: -10 }))).toBe(0);
    expect(getZoneStatus(zoneWith({ capacity: 0 }))).toBe('normal');
  });

  it('should treat negative people as zero occupancy', () => {
    expect(calculateOccupancy(-10, 50)).toBe(0);
    expect(getZoneOccupancy(zoneWith({ people: -10 }))).toBe(0);
  });

  it('should fall back to normal for non-finite occupancy values', () => {
    expect(getOccupancyStatus(Number.NaN)).toBe('normal');
    expect(getOccupancyStatus(Number.POSITIVE_INFINITY)).toBe('normal');
  });

  it('should clamp the progress between 0 and 100', () => {
    expect(getZoneProgress(zoneWith({ people: 10, capacity: 50 }))).toBe(20);
    expect(getZoneProgress(zoneWith({ people: 120, capacity: 100 }))).toBe(100);
    expect(getZoneProgress(zoneWith({ people: -10, capacity: 50 }))).toBe(0);
    expect(getZoneProgress(zoneWith({ people: 10, capacity: 0 }))).toBe(0);
  });
});
