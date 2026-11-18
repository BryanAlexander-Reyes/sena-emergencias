import { TestBed } from '@angular/core/testing';

import { DemoPermissionsService, DEMO_PERMISSIONS } from './demo-permissions.service';
import { DEMO_PROFILES } from './demo-profiles';
import { DemoSessionService } from './demo-session.service';

describe('DemoPermissionsService', () => {
  let permissions: DemoPermissionsService;
  let session: DemoSessionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    permissions = TestBed.inject(DemoPermissionsService);
    session = TestBed.inject(DemoSessionService);
  });

  it('es un singleton', () => {
    expect(permissions).toBe(TestBed.inject(DemoPermissionsService));
  });

  it('no concede permisos a visitante por defecto', () => {
    expect(session.profile().id).toBe('visitante');
    expect(permissions.granted()).toEqual([]);
    for (const permission of DEMO_PERMISSIONS) {
      expect(permissions.can(permission)).toBe(false);
    }
  });

  it('concede todos los permisos al administrador', () => {
    session.selectProfile('administrador');
    expect(permissions.granted()).toEqual(DEMO_PERMISSIONS);
    for (const permission of DEMO_PERMISSIONS) {
      expect(permissions.can(permission)).toBe(true);
    }
  });

  it('no concede permisos de simulación a instructor ni aprendiz', () => {
    for (const profileId of ['instructor', 'aprendiz'] as const) {
      session.selectProfile(profileId);
      expect(permissions.can('occupancy:update')).toBe(false);
      expect(permissions.can('occupancy:reset')).toBe(false);
      expect(permissions.can('sensors:control')).toBe(false);
      expect(permissions.can('sensors:reset')).toBe(false);
      expect(permissions.can('alerts:review')).toBe(false);
      expect(permissions.can('admin:access')).toBe(false);
    }

    session.selectProfile('instructor');
    expect(permissions.granted()).toEqual(['alarm:control']);

    session.selectProfile('aprendiz');
    expect(permissions.granted()).toEqual([]);
  });

  it('reserva alarm:control para administrador e instructor', () => {
    for (const profile of DEMO_PROFILES) {
      session.selectProfile(profile.id);
      expect(permissions.can('alarm:control')).toBe(profile.id === 'administrador' || profile.id === 'instructor');
    }
  });

  it('cubre todos los perfiles declarados en la política', () => {
    for (const profile of DEMO_PROFILES) {
      session.selectProfile(profile.id);
      expect(profile.id).toBe(session.profile().id);
      expect(permissions.granted()).toBeDefined();
    }
  });

  it('reactiva inmediatamente los permisos al cambiar de perfil', () => {
    session.selectProfile('administrador');
    expect(permissions.can('occupancy:update')).toBe(true);

    session.selectProfile('instructor');
    expect(permissions.can('occupancy:update')).toBe(false);
    expect(permissions.granted()).toEqual(['alarm:control']);

    session.selectProfile('administrador');
    expect(permissions.can('sensors:control')).toBe(true);
  });

  it('revoca los permisos al cerrar sesión', () => {
    session.selectProfile('administrador');
    expect(permissions.can('alerts:review')).toBe(true);

    session.closeSession();
    expect(permissions.can('alerts:review')).toBe(false);
    expect(permissions.granted()).toEqual([]);
  });

  it('reserva admin:access exclusivamente para administrador', () => {
    for (const profile of DEMO_PROFILES) {
      session.selectProfile(profile.id);
      expect(permissions.can('admin:access')).toBe(profile.id === 'administrador');
    }
  });
});
