import { TestBed } from '@angular/core/testing';

import { AlertsStateService } from '../services/alerts-state.service';
import { DemoAssistantService } from '../services/demo-assistant.service';
import { MonitoringStateService } from '../services/monitoring-state.service';
import { OccupancyAlertEngineService } from '../services/occupancy-alert-engine.service';
import { SimulatedSensorsService } from '../services/simulated-sensors.service';
import { SimulationHistoryService } from '../services/simulation-history.service';

import { DEFAULT_PROFILE, DEFAULT_PROFILE_ID, DEMO_PROFILES, type DemoProfileId } from './demo-profiles';
import { DemoSessionService } from './demo-session.service';
import type { SessionFacade } from './session-facade.contract';
import { verifiedTestIdentities, type VerifiedTestIdentities } from './testing/verified-session-test.util';

describe('DemoSessionService', () => {
  let session: DemoSessionService;
  let verified: VerifiedTestIdentities;

  const activate = (profileId: DemoProfileId): boolean => {
    if (profileId === 'administrador') {
      return session.publishVerifiedIdentity(verified.administrador);
    }
    if (profileId === 'instructor') {
      return session.publishVerifiedIdentity(verified.instructor);
    }
    return session.selectProfile('aprendiz');
  };

  beforeEach(async () => {
    verified = await verifiedTestIdentities();
    TestBed.configureTestingModule({});
    session = TestBed.inject(DemoSessionService);
  });

  it('should be a singleton shared through dependency injection', () => {
    expect(TestBed.inject(DemoSessionService)).toBe(session);
  });

  it('cumple SessionFacade sin perder las signals existentes', async () => {
    const facade: SessionFacade = session;

    expect(facade).toBe(session);
    // Arranca en `inicializando`: ningún consumidor debe ver privilegios aún.
    expect(facade.snapshot).toEqual({ status: 'inicializando', role: DEFAULT_PROFILE_ID, account: null });

    const ready = facade.whenReady();
    activate('administrador');

    expect(facade.snapshot).toEqual({
      status: 'lista',
      role: 'administrador',
      account: verified.administrador.account,
    });
    expect(session.state().profileId).toBe('administrador');
    expect(await ready).toEqual(facade.snapshot);
    expect(await facade.whenReady()).toEqual(facade.snapshot);
  });

  it('expone transiciones explícitas de inicialización y revalidación', async () => {
    activate('administrador');

    session.suspendForValidation();

    expect(session.status()).toBe('inicializando');
    expect(session.profileId()).toBe(DEFAULT_PROFILE_ID);
    expect(session.authenticatedAccount()).toBeNull();

    session.finishInitialization();

    expect(session.status()).toBe('lista');
    expect((await session.whenReady()).status).toBe('lista');
  });

  it('mantiene el acceso directo de Aprendiz y hace clear equivalente a closeSession', () => {
    const facade: SessionFacade = session;

    activate('administrador');
    facade.selectPublicRole('aprendiz');

    expect(session.profileId()).toBe(DEFAULT_PROFILE_ID);
    expect(session.selectedProfileId()).toBe(DEFAULT_PROFILE_ID);
    expect(session.authenticatedAccount()).toBeNull();

    activate('instructor');
    facade.clear();

    expect(session.profileId()).toBe(DEFAULT_PROFILE_ID);
    expect(facade.snapshot.role).toBe(DEFAULT_PROFILE_ID);
    expect(facade.snapshot.account).toBeNull();
  });

  it('should start with the learner profile and an inactive session', () => {
    expect(session.profileId()).toBe(DEFAULT_PROFILE_ID);
    expect(session.profile()).toBe(DEFAULT_PROFILE);
    expect(session.isActive()).toBe(false);
    expect(session.isAdministrative()).toBe(false);
    expect(session.state()).toEqual({
      profileId: DEFAULT_PROFILE_ID,
      profile: DEFAULT_PROFILE,
      isActive: false,
      isAdministrative: false,
    });
  });

  it('should expose the three demo profiles in the approved order', () => {
    expect(DEMO_PROFILES.map((profile) => profile.label)).toEqual([
      'Administrador de demostración',
      'Instructor de demostración',
      'Aprendiz de demostración',
    ]);
  });

  it('actualiza el estado reactivo con identidades verificadas y acceso público', () => {
    for (const profile of DEMO_PROFILES) {
      expect(activate(profile.id)).toBe(true);

      expect(session.profileId()).toBe(profile.id);
      expect(session.profile()).toBe(profile);
      expect(session.state().profile).toBe(profile);
      expect(session.state().profileId).toBe(profile.id);
    }
  });

  it('should flag only the administrator profile as administrative', () => {
    activate('administrador');
    expect(session.isAdministrative()).toBe(true);
    expect(session.isActive()).toBe(true);
    expect(session.state().isAdministrative).toBe(true);

    activate('instructor');
    expect(session.isAdministrative()).toBe(false);

    activate('aprendiz');
    expect(session.isAdministrative()).toBe(false);
    expect(session.isActive()).toBe(false);
  });

  it('should return to the learner profile when the demo session is closed', () => {
    activate('administrador');
    expect(session.isActive()).toBe(true);

    session.closeSession();

    expect(session.profileId()).toBe(DEFAULT_PROFILE_ID);
    expect(session.profile()).toBe(DEFAULT_PROFILE);
    expect(session.isActive()).toBe(false);
    expect(session.isAdministrative()).toBe(false);
    expect(session.authenticatedAccount()).toBeNull();
  });

  it('should return to the learner profile when the application state is recreated', () => {
    activate('administrador');
    expect(session.profileId()).toBe('administrador');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reloadedSession = TestBed.inject(DemoSessionService);

    expect(reloadedSession).not.toBe(session);
    expect(reloadedSession.profileId()).toBe(DEFAULT_PROFILE_ID);
    expect(reloadedSession.isActive()).toBe(false);
  });

  it('should ignore repeated or unknown profile identifiers', () => {
    expect(session.selectProfile('aprendiz')).toBe(false);
    expect(session.selectProfile('desconocido' as DemoProfileId)).toBe(false);
    expect(session.profile()).toBe(DEFAULT_PROFILE);
  });

  it('rechaza activaciones heredadas de roles privilegiados', () => {
    expect(session.activateProfile('administrador')).toBe(false);
    expect(session.activateProfile('instructor')).toBe(false);
    expect(session.selectProfile('administrador')).toBe(false);
    expect(session.selectProfile('instructor')).toBe(false);

    expect(session.profileId()).toBe(DEFAULT_PROFILE_ID);
    expect(session.authenticatedAccount()).toBeNull();
    expect(session.isAdministrative()).toBe(false);
  });

  it('no acepta una identidad plana ni un objeto falso como publicación verificada', () => {
    expect(
      session.setAuthenticatedAccount({ id: 'ADM-FALSO', nombre: 'admin', role: 'administrador' }),
    ).toBeUndefined();
    expect(
      session.publishVerifiedIdentity({
        account: { id: 'ADM-FALSO', nombre: 'admin', role: 'administrador' },
      } as never),
    ).toBe(false);

    expect(session.profileId()).toBe(DEFAULT_PROFILE_ID);
    expect(session.authenticatedAccount()).toBeNull();
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
      activate(profile.id);
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
