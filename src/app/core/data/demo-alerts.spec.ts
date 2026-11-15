import {
  ALERT_REVIEW_LABELS,
  ALERT_SEVERITY_LABELS,
  ALERT_STATUS_LABELS,
  countActiveAlerts,
  countReviewedAlerts,
  DEMO_ALERTS,
  getActiveCriticalAlert,
} from './demo-alerts';
import { DEMO_ZONES, getZoneOccupancy } from './demo-monitoring';

describe('demo alert data', () => {
  it('should expose exactly three demo alerts', () => {
    expect(DEMO_ALERTS).toHaveLength(3);
    expect(DEMO_ALERTS.map((alert) => alert.id)).toEqual(['ALR-001', 'ALR-002', 'ALR-003']);
    expect(DEMO_ALERTS.map((alert) => alert.title)).toEqual([
      'Ocupación crítica',
      'Ocupación elevada',
      'Estado actualizado',
    ]);
  });

  it('should derive the zone names and occupancies from the shared monitoring data', () => {
    const zones = DEMO_ALERTS.map((alert) => DEMO_ZONES.find((zone) => zone.id === alert.zoneId));

    expect(zones.map((zone) => zone?.name)).toEqual(['Pasillo principal', 'Cafetería', 'Biblioteca']);
    expect(DEMO_ALERTS[0].description).toBe(`Ocupación estimada del ${getZoneOccupancy(DEMO_ZONES[2])}%.`);
    expect(DEMO_ALERTS[1].description).toBe(`Ocupación estimada del ${getZoneOccupancy(DEMO_ZONES[0])}%.`);
    expect(DEMO_ALERTS[2].description).toBe('Zona en estado normal.');
  });

  it('should describe the expected severity, status and review combination', () => {
    expect(DEMO_ALERTS.map((alert) => alert.severity)).toEqual(['critical', 'warning', 'info']);
    expect(DEMO_ALERTS.map((alert) => alert.status)).toEqual(['active', 'resolved', 'resolved']);
    expect(DEMO_ALERTS.map((alert) => alert.review)).toEqual(['pending', 'reviewed', 'reviewed']);
    expect(DEMO_ALERTS.map((alert) => ALERT_SEVERITY_LABELS[alert.severity])).toEqual([
      'Crítica',
      'Precaución',
      'Informativa',
    ]);
    expect(DEMO_ALERTS.map((alert) => ALERT_STATUS_LABELS[alert.status])).toEqual(['Activa', 'Resuelta', 'Resuelta']);
    expect(DEMO_ALERTS.map((alert) => ALERT_REVIEW_LABELS[alert.review])).toEqual([
      'Pendiente',
      'Revisada',
      'Revisada',
    ]);
  });

  it('should mark every date as fictitious demo data', () => {
    for (const alert of DEMO_ALERTS) {
      expect(alert.occurredAt.startsWith('Demo · ')).toBe(true);
      expect(alert.occurredAt).toMatch(/Demo · \d{1,2} nov 2026 · /);
    }
  });

  it('should count the active, reviewed and total alerts', () => {
    expect(countActiveAlerts()).toBe(1);
    expect(countReviewedAlerts()).toBe(2);
    expect(countActiveAlerts(DEMO_ALERTS)).toBe(1);
    expect(countReviewedAlerts(DEMO_ALERTS)).toBe(2);
  });

  it('should resolve the active critical alert to the main corridor', () => {
    const alert = getActiveCriticalAlert();

    expect(alert?.id).toBe('ALR-001');
    expect(alert?.zoneName).toBe('Pasillo principal');
    expect(alert?.severity).toBe('critical');
    expect(alert?.status).toBe('active');
  });

  it('should compute the helpers from any provided alert collection', () => {
    const reviewedOnly = DEMO_ALERTS.map((alert) => ({ ...alert, review: 'reviewed' as const }));

    expect(countActiveAlerts(reviewedOnly)).toBe(1);
    expect(countReviewedAlerts(reviewedOnly)).toBe(3);
    expect(getActiveCriticalAlert(reviewedOnly)?.id).toBe('ALR-001');
    expect(countActiveAlerts([])).toBe(0);
    expect(getActiveCriticalAlert([])).toBeUndefined();
  });
});
