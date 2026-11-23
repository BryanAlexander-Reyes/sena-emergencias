import { TestBed } from '@angular/core/testing';

import { DemoPermissionsService, DEMO_PERMISSIONS } from './demo-permissions.service';
import { DEMO_PROFILES } from './demo-profiles';
import { DemoSessionService } from './demo-session.service';
import { verifiedTestIdentities, type VerifiedTestIdentities } from './testing/verified-session-test.util';

describe('DemoPermissionsService', () => {
  let permissions: DemoPermissionsService;
  let session: DemoSessionService;
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
    permissions = TestBed.inject(DemoPermissionsService);
    session = TestBed.inject(DemoSessionService);
  });

  it('es un singleton', () => {
    expect(permissions).toBe(TestBed.inject(DemoPermissionsService));
  });

  it('no concede permisos a aprendiz por defecto', () => {
    expect(session.profile().id).toBe('aprendiz');
    expect(permissions.granted()).toEqual([]);
    for (const permission of DEMO_PERMISSIONS) {
      expect(permissions.can(permission)).toBe(false);
    }
  });

  it('concede todos los permisos al administrador validado', () => {
    activate('administrador');
    expect(permissions.granted()).toEqual(DEMO_PERMISSIONS);
    for (const permission of DEMO_PERMISSIONS) {
      expect(permissions.can(permission)).toBe(true);
    }
  });

  it('no concede permisos de simulación a instructor ni aprendiz', () => {
    for (const profileId of ['instructor', 'aprendiz'] as const) {
      activate(profileId);
      expect(permissions.can('occupancy:update')).toBe(false);
      expect(permissions.can('occupancy:reset')).toBe(false);
      expect(permissions.can('sensors:control')).toBe(false);
      expect(permissions.can('sensors:reset')).toBe(false);
      expect(permissions.can('alerts:review')).toBe(false);
      expect(permissions.can('admin:access')).toBe(false);
      expect(permissions.can('zones:manage')).toBe(false);
    }

    activate('instructor');
    expect(permissions.granted()).toEqual(['alarm:control']);

    activate('aprendiz');
    expect(permissions.granted()).toEqual([]);
  });

  it('reserva alarm:control para administrador e instructor validados', () => {
    for (const profile of DEMO_PROFILES) {
      activate(profile.id);
      expect(permissions.can('alarm:control')).toBe(profile.id === 'administrador' || profile.id === 'instructor');
    }
  });

  it('cubre todos los perfiles declarados en la política', () => {
    for (const profile of DEMO_PROFILES) {
      activate(profile.id);
      expect(profile.id).toBe(session.profile().id);
      expect(permissions.granted()).toBeDefined();
    }
  });

  it('reactiva inmediatamente los permisos al publicar otra identidad validada', () => {
    activate('administrador');
    expect(permissions.can('occupancy:update')).toBe(true);

    activate('instructor');
    expect(permissions.can('occupancy:update')).toBe(false);
    expect(permissions.granted()).toEqual(['alarm:control']);

    activate('administrador');
    expect(permissions.can('sensors:control')).toBe(true);
  });

  it('revoca los permisos al cerrar sesión', () => {
    activate('administrador');
    expect(permissions.can('alerts:review')).toBe(true);

    session.closeSession();
    expect(permissions.can('alerts:review')).toBe(false);
    expect(permissions.granted()).toEqual([]);
  });

  it('reserva admin:access exclusivamente para administrador validado', () => {
    for (const profile of DEMO_PROFILES) {
      activate(profile.id);
      expect(permissions.can('admin:access')).toBe(profile.id === 'administrador');
    }
  });

  it('reserva zones:manage exclusivamente para administrador validado', () => {
    for (const profile of DEMO_PROFILES) {
      activate(profile.id);
      expect(permissions.can('zones:manage')).toBe(profile.id === 'administrador');
    }
  });

  it('no concede privilegios durante inicialización ni revalidación', () => {
    activate('administrador');
    expect(permissions.can('admin:access')).toBe(true);

    session.suspendForValidation();
    expect(session.status()).toBe('inicializando');
    expect(permissions.can('admin:access')).toBe(false);
    expect(permissions.can('alarm:control')).toBe(false);
    expect(permissions.can('zones:manage')).toBe(false);

    session.beginInitialization();
    expect(permissions.granted()).toEqual([]);
  });

  it('ignora selecciones visuales y activaciones directas privilegiadas', () => {
    expect(session.selectProfile('administrador')).toBe(false);
    expect(session.activateProfile('instructor')).toBe(false);
    expect(session.beginCredentialSelection('administrador')).toBe(true);

    expect(session.status()).toBe('lista');
    expect(permissions.granted()).toEqual([]);
  });
});
