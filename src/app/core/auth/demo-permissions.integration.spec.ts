import { TestBed } from '@angular/core/testing';

import { autoOccupancyAlertId } from '../data/demo-alerts';
import { AlertsStateService } from '../services/alerts-state.service';
import { MonitoringStateService } from '../services/monitoring-state.service';
import { OccupancyAlertEngineService } from '../services/occupancy-alert-engine.service';
import { SimulatedSensorsService } from '../services/simulated-sensors.service';
import { SimulationHistoryService } from '../services/simulation-history.service';

import { DemoPermissionsService } from './demo-permissions.service';
import { DemoSessionService } from './demo-session.service';
import { verifiedTestIdentities, type VerifiedTestIdentities } from './testing/verified-session-test.util';

describe('Integración Fase 4.3 — permisos por perfil', () => {
  let verified: VerifiedTestIdentities;

  const activate = (session: DemoSessionService, profileId: 'administrador' | 'instructor' | 'aprendiz'): void => {
    if (profileId === 'administrador') {
      session.publishVerifiedIdentity(verified.administrador);
    } else if (profileId === 'instructor') {
      session.publishVerifiedIdentity(verified.instructor);
    } else {
      session.selectProfile('aprendiz');
    }
  };

  beforeEach(async () => {
    verified = await verifiedTestIdentities();
    TestBed.configureTestingModule({});
    TestBed.inject(DemoPermissionsService);
    TestBed.inject(DemoSessionService);
    TestBed.inject(MonitoringStateService);
    TestBed.inject(AlertsStateService);
    TestBed.inject(SimulationHistoryService);
    TestBed.inject(SimulatedSensorsService);
    TestBed.inject(OccupancyAlertEngineService);
    TestBed.flushEffects();
  });

  it('mantiene el estado del simulador intacto al cambiar de perfil', () => {
    const session = TestBed.inject(DemoSessionService);
    const permissions = TestBed.inject(DemoPermissionsService);
    const monitoring = TestBed.inject(MonitoringStateService);
    const alerts = TestBed.inject(AlertsStateService);
    const history = TestBed.inject(SimulationHistoryService);
    const sensors = TestBed.inject(SimulatedSensorsService);

    const zonesSnapshot = JSON.stringify(monitoring.zones());
    const alertsSnapshot = JSON.stringify(alerts.alerts());
    const sensorsSnapshot = JSON.stringify(sensors.sensors());

    for (const profileId of ['administrador', 'instructor', 'aprendiz'] as const) {
      activate(session, profileId);
      TestBed.flushEffects();
      expect(permissions.can('occupancy:update')).toBe(profileId === 'administrador');
      expect(permissions.can('alerts:review')).toBe(profileId === 'administrador');
      expect(permissions.can('zones:manage')).toBe(profileId === 'administrador');
    }

    activate(session, 'administrador');
    session.closeSession();
    TestBed.flushEffects();

    expect(monitoring.totalPeople()).toBe(107);
    expect(monitoring.monitoredZones()).toBe(4);
    expect(monitoring.hasOccupancyChanges()).toBe(false);
    expect(JSON.stringify(monitoring.zones())).toBe(zonesSnapshot);

    expect(alerts.totalAlerts()).toBe(3);
    expect(alerts.activeAlerts()).toBe(1);
    expect(JSON.stringify(alerts.alerts())).toBe(alertsSnapshot);

    expect(history.changeCount()).toBe(0);
    expect(history.isEmpty()).toBe(true);
    expect(JSON.stringify(sensors.sensors())).toBe(sensorsSnapshot);
  });

  it('no genera alertas automáticas duplicadas al cambiar de perfil', () => {
    const session = TestBed.inject(DemoSessionService);
    const alerts = TestBed.inject(AlertsStateService);
    const automaticCafeteriaId = autoOccupancyAlertId('cafeteria');

    for (const profileId of ['administrador', 'aprendiz', 'instructor', 'administrador'] as const) {
      activate(session, profileId);
      TestBed.flushEffects();
    }

    expect(alerts.alerts().filter((alert) => alert.id === automaticCafeteriaId)).toHaveLength(0);
    expect(new Set(alerts.alerts().map((alert) => alert.id)).size).toBe(3);
    expect(alerts.alerts().find((alert) => alert.id === 'ALR-001')?.review).toBe('pending');
  });
});
