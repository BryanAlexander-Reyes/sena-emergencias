import { TestBed } from '@angular/core/testing';

import { AlertsStateService } from '../services/alerts-state.service';
import { DemoAssistantService } from '../services/demo-assistant.service';
import { MonitoringStateService } from '../services/monitoring-state.service';
import { OccupancyAlertEngineService } from '../services/occupancy-alert-engine.service';
import { SimulatedSensorsService } from '../services/simulated-sensors.service';
import { SimulationHistoryService } from '../services/simulation-history.service';

import { DEMO_PROFILES, VISITOR_PROFILE, VISITOR_PROFILE_ID, type DemoProfileId } from './demo-profiles';
import { DemoSessionService } from './demo-session.service';

describe('DemoSessionService', () => {
  let session: DemoSessionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    session = TestBed.inject(DemoSessionService);
  });

  it('should be a singleton shared through dependency injection', () => {
    expect(TestBed.inject(DemoSessionService)).toBe(session);
  });

  it('should start with the visitor profile and an inactive session', () => {
    expect(session.profileId()).toBe(VISITOR_PROFILE_ID);
    expect(session.profile()).toBe(VISITOR_PROFILE);
    expect(session.isActive()).toBe(false);
    expect(session.isAdministrative()).toBe(false);
    expect(session.state()).toEqual({
      profileId: VISITOR_PROFILE_ID,
      profile: VISITOR_PROFILE,
      isActive: false,
      isAdministrative: false,
    });
  });

  it('should expose the four demo profiles in the approved order', () => {
    expect(DEMO_PROFILES.map((profile) => profile.label)).toEqual([
      'Administrador de demostración',
      'Instructor de demostración',
      'Aprendiz de demostración',
      'Visitante',
    ]);
  });

  it('should select every profile and keep its reactive state in sync', () => {
    for (const profile of DEMO_PROFILES) {
      session.selectProfile(profile.id);

      expect(session.profileId()).toBe(profile.id);
      expect(session.profile()).toBe(profile);
      expect(session.state().profile).toBe(profile);
      expect(session.state().profileId).toBe(profile.id);
    }
  });

  it('should flag only the administrator profile as administrative', () => {
    session.selectProfile('administrador');
    expect(session.isAdministrative()).toBe(true);
    expect(session.isActive()).toBe(true);
    expect(session.state().isAdministrative).toBe(true);

    session.selectProfile('instructor');
    expect(session.isAdministrative()).toBe(false);

    session.selectProfile('aprendiz');
    expect(session.isAdministrative()).toBe(false);

    session.selectProfile('visitante');
    expect(session.isAdministrative()).toBe(false);
    expect(session.isActive()).toBe(false);
  });

  it('should return to the visitor profile when the demo session is closed', () => {
    session.selectProfile('administrador');
    expect(session.isActive()).toBe(true);

    session.closeSession();

    expect(session.profileId()).toBe(VISITOR_PROFILE_ID);
    expect(session.profile()).toBe(VISITOR_PROFILE);
    expect(session.isActive()).toBe(false);
    expect(session.isAdministrative()).toBe(false);
  });

  it('should return to the visitor profile when the application state is recreated', () => {
    session.selectProfile('administrador');
    expect(session.profileId()).toBe('administrador');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reloadedSession = TestBed.inject(DemoSessionService);

    expect(reloadedSession).not.toBe(session);
    expect(reloadedSession.profileId()).toBe(VISITOR_PROFILE_ID);
    expect(reloadedSession.isActive()).toBe(false);
  });

  it('should ignore repeated or unknown profile identifiers', () => {
    expect(session.selectProfile('visitante')).toBe(false);
    expect(session.selectProfile('desconocido' as DemoProfileId)).toBe(false);
    expect(session.profile()).toBe(VISITOR_PROFILE);
  });

  it('should leave occupancy, alerts, history, sensors and assistant state untouched', () => {
    const monitoring = TestBed.inject(MonitoringStateService);
    const alerts = TestBed.inject(AlertsStateService);
    const history = TestBed.inject(SimulationHistoryService);
    const sensors = TestBed.inject(SimulatedSensorsService);
    const assistant = TestBed.inject(DemoAssistantService);
    TestBed.inject(OccupancyAlertEngineService);

    expect(monitoring.incrementOccupancy('cafeteria')).toBe(true);
    expect(sensors.setSimulationState('pir-zona-segura', 'active')).toBe(true);
    assistant.sendUserMessage('¿Cuántas personas hay en total?');
    TestBed.flushEffects();

    const zonesBefore = monitoring.zones();
    const totalBefore = monitoring.totalPeople();
    const alertsBefore = alerts.alerts();
    const activeAlertsBefore = alerts.activeAlerts();
    const eventsBefore = history.events();
    const sensorsBefore = sensors.sensors();
    const messagesBefore = assistant.messages();

    for (const profile of DEMO_PROFILES) {
      session.selectProfile(profile.id);
    }
    session.closeSession();
    TestBed.flushEffects();

    expect(monitoring.zones()).toBe(zonesBefore);
    expect(monitoring.totalPeople()).toBe(totalBefore);
    expect(alerts.alerts()).toBe(alertsBefore);
    expect(alerts.activeAlerts()).toBe(activeAlertsBefore);
    expect(history.events()).toBe(eventsBefore);
    expect(history.changeCount()).toBe(eventsBefore.length);
    expect(sensors.sensors()).toBe(sensorsBefore);
    expect(assistant.messages()).toBe(messagesBefore);
  });
});
