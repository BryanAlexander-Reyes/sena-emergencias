import { TestBed } from '@angular/core/testing';

import { DEMO_ALERTS, autoOccupancyAlertId } from '../data/demo-alerts';

import { AlertsStateService } from './alerts-state.service';
import { MonitoringStateService } from './monitoring-state.service';
import { OccupancyAlertEngineService } from './occupancy-alert-engine.service';

describe('OccupancyAlertEngineService (Fase 3.4)', () => {
  let monitoring: MonitoringStateService;
  let alerts: AlertsStateService;

  const flush = (): void => {
    TestBed.flushEffects();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    monitoring = TestBed.inject(MonitoringStateService);
    alerts = TestBed.inject(AlertsStateService);
    TestBed.inject(OccupancyAlertEngineService);
    flush();
  });

  it('should start with one active alert and no duplicate critical alerts', () => {
    expect(alerts.totalAlerts()).toBe(3);
    expect(alerts.activeAlerts()).toBe(1);
    expect(alerts.alerts().filter((alert) => alert.status === 'active' && alert.severity === 'critical')).toHaveLength(
      1,
    );
    expect(alerts.activeCriticalAlert()?.id).toBe('ALR-001');
    expect(DEMO_ALERTS[0].id).toBe('ALR-001');
  });

  it('should not generate a cafeteria alert on initial load even though it starts in precaution', () => {
    expect(alerts.alerts().filter((alert) => alert.zoneId === 'cafeteria' && alert.status === 'active')).toHaveLength(
      0,
    );
    expect(alerts.activeAlerts()).toBe(1);
  });

  it('should resolve cafeteria occupancy to normal on first real change (35 -> 34) without creating an active auto alert', () => {
    expect(monitoring.decrementOccupancy('cafeteria')).toBe(true);
    flush();

    expect(monitoring.occupancyOf('cafeteria')).toBe(68);
    expect(monitoring.statusOf('cafeteria')).toBe('normal');
    expect(alerts.alerts().find((alert) => alert.id === autoOccupancyAlertId('cafeteria'))).toBeUndefined();
    expect(alerts.alerts().filter((alert) => alert.zoneId === 'cafeteria' && alert.status === 'active')).toHaveLength(
      0,
    );
    expect(alerts.activeAlerts()).toBe(1);
  });

  it('should activate a precaution alert when cafeteria crosses into warning (34 -> 35)', () => {
    expect(monitoring.decrementOccupancy('cafeteria')).toBe(true);
    flush();
    expect(monitoring.incrementOccupancy('cafeteria')).toBe(true);
    flush();

    const auto = alerts.alerts().find((alert) => alert.id === autoOccupancyAlertId('cafeteria'));

    expect(monitoring.occupancyOf('cafeteria')).toBe(70);
    expect(monitoring.statusOf('cafeteria')).toBe('warning');
    expect(auto).toBeTruthy();
    expect(auto?.status).toBe('active');
    expect(auto?.severity).toBe('warning');
    expect(auto?.zoneName).toBe('Cafetería');
    expect(auto?.description).toContain('70%');
    expect(alerts.activeAlerts()).toBe(2);
  });

  it('should update the same cafeteria alert to critical (35 -> 40) without duplicating it', () => {
    expect(monitoring.decrementOccupancy('cafeteria')).toBe(true);
    flush();
    expect(monitoring.incrementOccupancy('cafeteria')).toBe(true);
    flush();
    for (let i = 0; i < 5; i += 1) {
      expect(monitoring.incrementOccupancy('cafeteria')).toBe(true);
      flush();
    }

    const autoAlerts = alerts.alerts().filter((alert) => alert.id === autoOccupancyAlertId('cafeteria'));

    expect(autoAlerts).toHaveLength(1);
    expect(autoAlerts[0].status).toBe('active');
    expect(autoAlerts[0].severity).toBe('critical');
    expect(monitoring.occupancyOf('cafeteria')).toBe(80);
    expect(monitoring.statusOf('cafeteria')).toBe('critical');
  });

  it('should update from critical back to precaution (40 -> 39)', () => {
    expect(monitoring.decrementOccupancy('cafeteria')).toBe(true);
    flush();
    expect(monitoring.incrementOccupancy('cafeteria')).toBe(true);
    flush();
    for (let i = 0; i < 5; i += 1) {
      expect(monitoring.incrementOccupancy('cafeteria')).toBe(true);
      flush();
    }
    expect(monitoring.decrementOccupancy('cafeteria')).toBe(true);
    flush();

    const auto = alerts.alerts().find((alert) => alert.id === autoOccupancyAlertId('cafeteria'));

    expect(monitoring.occupancyOf('cafeteria')).toBe(78);
    expect(auto?.status).toBe('active');
    expect(auto?.severity).toBe('warning');
  });

  it('should resolve the automatic alert when returning to normal (39 -> 34)', () => {
    expect(monitoring.decrementOccupancy('cafeteria')).toBe(true);
    flush();
    expect(monitoring.incrementOccupancy('cafeteria')).toBe(true);
    flush();
    for (let i = 0; i < 5; i += 1) {
      expect(monitoring.incrementOccupancy('cafeteria')).toBe(true);
      flush();
    }
    expect(monitoring.decrementOccupancy('cafeteria')).toBe(true);
    flush();
    for (let i = 0; i < 5; i += 1) {
      expect(monitoring.decrementOccupancy('cafeteria')).toBe(true);
      flush();
    }

    const auto = alerts.alerts().find((alert) => alert.id === autoOccupancyAlertId('cafeteria'));

    expect(monitoring.occupancyOf('cafeteria')).toBe(68);
    expect(monitoring.statusOf('cafeteria')).toBe('normal');
    expect(auto?.status).toBe('resolved');
    expect(alerts.alerts().filter((alert) => alert.zoneId === 'cafeteria' && alert.status === 'active')).toHaveLength(
      0,
    );
  });

  it('should not duplicate alerts when occupancy changes within the same level', () => {
    expect(monitoring.decrementOccupancy('cafeteria')).toBe(true);
    flush();
    expect(monitoring.incrementOccupancy('cafeteria')).toBe(true);
    flush();
    expect(monitoring.incrementOccupancy('cafeteria')).toBe(true);
    flush();
    expect(monitoring.incrementOccupancy('cafeteria')).toBe(true);
    flush();

    const autoAlerts = alerts.alerts().filter((alert) => alert.id === autoOccupancyAlertId('cafeteria'));

    expect(autoAlerts).toHaveLength(1);
    expect(autoAlerts[0].status).toBe('active');
    expect(autoAlerts[0].severity).toBe('warning');
    expect(autoAlerts[0].description).toContain('74%');
  });

  it('should keep review state when marking reviewed without resolving, and preserve it across same-level updates', () => {
    expect(monitoring.decrementOccupancy('cafeteria')).toBe(true);
    flush();
    expect(monitoring.incrementOccupancy('cafeteria')).toBe(true);
    flush();
    const autoId = autoOccupancyAlertId('cafeteria');
    alerts.markReviewed(autoId);

    expect(alerts.alerts().find((a) => a.id === autoId)?.review).toBe('reviewed');
    expect(alerts.alerts().find((a) => a.id === autoId)?.status).toBe('active');

    expect(monitoring.incrementOccupancy('cafeteria')).toBe(true);
    flush();
    const auto = alerts.alerts().find((a) => a.id === autoId);
    expect(auto?.review).toBe('reviewed');
    expect(auto?.status).toBe('active');
    expect(auto?.severity).toBe('warning');
  });

  it('should reconcile the initial critical alert for pasillo without duplicating it', () => {
    expect(monitoring.decrementOccupancy('pasillo-principal')).toBe(true);
    flush();

    const pasilloAlerts = alerts
      .alerts()
      .filter((alert) => alert.zoneId === 'pasillo-principal' && alert.condition === 'occupancy');
    const activeCritical = pasilloAlerts.filter((alert) => alert.status === 'active' && alert.severity === 'critical');

    expect(activeCritical).toHaveLength(1);
    expect(activeCritical[0].id).toBe('ALR-001');
  });

  it('should preserve historical demo records when resetting occupancy', () => {
    expect(monitoring.decrementOccupancy('cafeteria')).toBe(true);
    flush();
    expect(monitoring.incrementOccupancy('cafeteria')).toBe(true);
    flush();
    expect(monitoring.incrementOccupancy('cafeteria')).toBe(true);
    flush(); // cafeteria queda en 36 (cambio real pendiente de restablecer)

    expect(monitoring.resetAllOccupancy()).toBe(true);
    flush();

    const alr002 = alerts.alerts().find((alert) => alert.id === 'ALR-002');
    const alr003 = alerts.alerts().find((alert) => alert.id === 'ALR-003');

    expect(alr002).toBeTruthy();
    expect(alr002?.status).toBe('resolved');
    expect(alr002?.origin).toBe('demo');
    expect(alr003).toBeTruthy();
    expect(alr003?.status).toBe('resolved');
    // Al restablecer tras un cambio real, la cafetería vuelve a 70% (precaución) y
    // su alerta automática gestionada se reconcilia como activa; el registro histórico
    // ALR-002 se conserva sin modificarse.
    const cafeteriaActive = alerts
      .alerts()
      .filter((alert) => alert.zoneId === 'cafeteria' && alert.status === 'active');
    expect(cafeteriaActive).toHaveLength(1);
    expect(cafeteriaActive[0].id).toBe(autoOccupancyAlertId('cafeteria'));
    expect(cafeteriaActive[0].severity).toBe('warning');
  });

  it('should keep dashboard and alerts active counts coherent', () => {
    expect(monitoring.decrementOccupancy('cafeteria')).toBe(true);
    flush();
    expect(monitoring.incrementOccupancy('cafeteria')).toBe(true);
    flush();
    expect(alerts.activeAlerts()).toBe(2);

    expect(monitoring.incrementOccupancy('biblioteca')).toBe(true);
    flush();
    expect(alerts.activeAlerts()).toBe(2);
  });

  it('should not alter alerts of other zones when changing one zone', () => {
    const pasilloBefore = alerts.alerts().find((a) => a.id === 'ALR-001');
    expect(monitoring.incrementOccupancy('biblioteca')).toBe(true);
    flush();
    const pasilloAfter = alerts.alerts().find((a) => a.id === 'ALR-001');

    expect(pasilloAfter).toEqual(pasilloBefore);
    expect(alerts.alerts().filter((a) => a.zoneId === 'pasillo-principal' && a.status === 'active')).toHaveLength(1);
  });
});
