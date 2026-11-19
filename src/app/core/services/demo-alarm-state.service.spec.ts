import { TestBed } from '@angular/core/testing';

import { DemoSessionService } from '../auth/demo-session.service';
import { verifiedTestIdentities, type VerifiedTestIdentities } from '../auth/testing/verified-session-test.util';

import { AlertsStateService } from './alerts-state.service';
import { DemoAlarmStateService } from './demo-alarm-state.service';
import { MonitoringStateService } from './monitoring-state.service';
import { OccupancyAlertEngineService } from './occupancy-alert-engine.service';
import { SimulatedSensorsService } from './simulated-sensors.service';
import { SimulationHistoryService } from './simulation-history.service';

describe('DemoAlarmStateService (Fase 4.6)', () => {
  let alarm: DemoAlarmStateService;
  let session: DemoSessionService;
  let monitoring: MonitoringStateService;
  let alerts: AlertsStateService;
  let history: SimulationHistoryService;
  let sensors: SimulatedSensorsService;
  let verified: VerifiedTestIdentities;

  const activate = (profileId: 'administrador' | 'instructor' | 'aprendiz'): void => {
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
    alarm = TestBed.inject(DemoAlarmStateService);
    session = TestBed.inject(DemoSessionService);
    monitoring = TestBed.inject(MonitoringStateService);
    alerts = TestBed.inject(AlertsStateService);
    history = TestBed.inject(SimulationHistoryService);
    sensors = TestBed.inject(SimulatedSensorsService);
    TestBed.inject(OccupancyAlertEngineService);
    TestBed.flushEffects();
  });

  const removeAgglomeration = (): void => {
    // Pasillo principal inicia en 42/50 (84 %, crítico). Con 39 queda en 78 %.
    for (let step = 0; step < 3; step += 1) {
      monitoring.decrementOccupancy('pasillo-principal');
    }
    TestBed.flushEffects();
  };

  it('inicia con la alarma apagada y en modo simulado', () => {
    expect(alarm.status()).toBe('off');
    expect(alarm.isOn()).toBe(false);
    expect(alarm.label()).toBe('Alarma apagada');
    expect(alarm.simulatedOnly).toBe(true);
    expect(alarm.canControl()).toBe(false);
  });

  it('permite al administrador encender y apagar', () => {
    activate('administrador');

    expect(alarm.canControl()).toBe(true);
    expect(alarm.turnOn()).toBe(true);
    expect(alarm.status()).toBe('on');
    expect(alarm.label()).toBe('Alarma activada');

    expect(alarm.turnOff()).toBe(true);
    expect(alarm.status()).toBe('off');
  });

  it('permite al instructor encender y apagar', () => {
    activate('instructor');

    expect(alarm.canControl()).toBe(true);
    expect(alarm.turnOn()).toBe(true);
    expect(alarm.status()).toBe('on');

    expect(alarm.turnOff()).toBe(true);
    expect(alarm.status()).toBe('off');
  });

  it('no permite al aprendiz encender ni apagar', () => {
    activate('aprendiz');
    expect(alarm.turnOn()).toBe(false);
    expect(alarm.turnOff()).toBe(false);
    expect(alarm.status()).toBe('off');

    activate('administrador');
    alarm.turnOn();
    activate('aprendiz');
    expect(alarm.turnOff()).toBe(false);
    expect(alarm.status()).toBe('on');
  });

  it('permite encender la alarma sin aglomeración', () => {
    activate('administrador');
    removeAgglomeration();

    expect(monitoring.snapshots().some((snapshot) => snapshot.status === 'critical')).toBe(false);
    expect(alarm.turnOn()).toBe(true);
    expect(alarm.isOn()).toBe(true);
  });

  it('una aglomeración crítica no enciende la alarma automáticamente', () => {
    expect(monitoring.snapshots().some((snapshot) => snapshot.status === 'critical')).toBe(true);

    monitoring.incrementOccupancy('cafeteria');
    monitoring.incrementOccupancy('cafeteria');
    TestBed.flushEffects();

    expect(monitoring.snapshots().some((snapshot) => snapshot.status === 'critical')).toBe(true);
    expect(alarm.isOn()).toBe(false);
  });

  it('desaparecer la aglomeración no apaga la alarma', () => {
    activate('administrador');
    expect(alarm.turnOn()).toBe(true);

    removeAgglomeration();

    expect(monitoring.snapshots().some((snapshot) => snapshot.status === 'critical')).toBe(false);
    expect(alarm.isOn()).toBe(true);
  });

  it('cambiar de perfil no altera el estado de la alarma', () => {
    activate('administrador');
    alarm.turnOn();

    activate('instructor');
    expect(alarm.isOn()).toBe(true);

    activate('aprendiz');
    expect(alarm.isOn()).toBe(true);

    activate('administrador');
    expect(alarm.isOn()).toBe(true);
    expect(alarm.turnOff()).toBe(true);
  });

  it('revalida el permiso en el punto de ejecución, no solo en el botón', () => {
    activate('administrador');
    alarm.turnOn();

    activate('aprendiz');

    expect(alarm.turnOff()).toBe(false);
    expect(alarm.status()).toBe('on');
  });

  it('rechaza un cambio incoherente cuando el estado ya varió', () => {
    activate('administrador');
    alarm.turnOn();

    expect(alarm.turnOff('off')).toBe(false);
    expect(alarm.turnOn('off')).toBe(false);
    expect(alarm.status()).toBe('on');

    expect(alarm.turnOff('on')).toBe(true);
    expect(alarm.status()).toBe('off');
  });

  it('no modifica zonas, conteos, sensores ni historial al operar la alarma', () => {
    activate('administrador');
    const zonesSnapshot = JSON.stringify(monitoring.zones());
    const alertsSnapshot = JSON.stringify(alerts.alerts());
    const sensorsSnapshot = JSON.stringify(sensors.sensors());
    const historyCount = history.changeCount();

    for (let cycle = 0; cycle < 3; cycle += 1) {
      alarm.turnOn();
      alarm.turnOff();
    }

    expect(monitoring.totalPeople()).toBe(107);
    expect(monitoring.monitoredZones()).toBe(4);
    expect(JSON.stringify(monitoring.zones())).toBe(zonesSnapshot);
    expect(JSON.stringify(alerts.alerts())).toBe(alertsSnapshot);
    expect(JSON.stringify(sensors.sensors())).toBe(sensorsSnapshot);
    expect(history.changeCount()).toBe(historyCount);
    expect(history.changeCount()).toBe(0);
  });

  it('no genera alertas duplicadas al operar la alarma y cambiar de perfil', () => {
    activate('administrador');
    alarm.turnOn();

    for (const profileId of ['instructor', 'aprendiz', 'administrador'] as const) {
      activate(profileId);
      TestBed.flushEffects();
    }

    alarm.turnOff();
    TestBed.flushEffects();

    expect(alerts.totalAlerts()).toBe(3);
    expect(alerts.activeAlerts()).toBe(1);
    expect(new Set(alerts.alerts().map((alert) => alert.id)).size).toBe(3);
  });
});
