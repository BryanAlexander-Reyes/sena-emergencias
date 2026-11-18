import { TestBed } from '@angular/core/testing';

import {
  DEMO_INACTIVE_INSTRUCTOR_ERROR,
  DEMO_INSTRUCTOR_ALREADY_INACTIVE_ERROR,
  DEMO_INSTRUCTOR_DUPLICATE_ERROR,
  DEMO_INSTRUCTOR_NOT_FOUND_ERROR,
  DEMO_INSTRUCTOR_PASSWORD_LENGTH_ERROR,
  DEMO_INSTRUCTOR_PASSWORD_MATCH_ERROR,
  DEMO_INSTRUCTOR_PERMISSION_ERROR,
  DEMO_INSTRUCTOR_SUCCESS,
  DEMO_INSTRUCTOR_USERNAME_REQUIRED_ERROR,
  DEMO_INSTRUCTOR_USERNAME_SPACES_ERROR,
  DEMO_LOGIN_ERROR,
  DemoAuthService,
  type DemoInstructorMutationResult,
} from './demo-auth.service';
import { DEMO_CREDENTIALS } from './demo-credentials';
import { DemoPermissionsService } from './demo-permissions.service';
import { DEMO_PROFILES, type DemoProfileId } from './demo-profiles';
import { DemoSessionService } from './demo-session.service';

describe('DemoAuthService (Fase 5.1)', () => {
  let auth: DemoAuthService;
  let session: DemoSessionService;
  let permissions: DemoPermissionsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    auth = TestBed.inject(DemoAuthService);
    session = TestBed.inject(DemoSessionService);
    permissions = TestBed.inject(DemoPermissionsService);
  });

  it('autentica al administrador con sus credenciales ficticias correctas', () => {
    const result = auth.authenticate('admin_demo', 'Admin1234!', 'administrador');

    expect(result).toEqual({ ok: true, profileId: 'administrador' });
    expect(session.profileId()).toBe('administrador');
    expect(session.selectedProfileId()).toBe('administrador');
    expect(permissions.can('admin:access')).toBe(true);
    expect(permissions.can('alarm:control')).toBe(true);
  });

  it('autentica al instructor con sus credenciales ficticias correctas', () => {
    const result = auth.authenticate('instructor_demo', 'Instructor1234!', 'instructor');

    expect(result).toEqual({ ok: true, profileId: 'instructor' });
    expect(session.profileId()).toBe('instructor');
    expect(permissions.can('alarm:control')).toBe(true);
    expect(permissions.can('admin:access')).toBe(false);
  });

  it('rechaza una contraseña incorrecta sin activar ningún perfil', () => {
    const result = auth.authenticate('admin_demo', 'Admin1234', 'administrador');

    expect(result).toEqual({ ok: false, error: DEMO_LOGIN_ERROR });
    expect(session.profileId()).toBe('visitante');
    expect(permissions.can('admin:access')).toBe(false);
    expect(permissions.can('alarm:control')).toBe(false);
  });

  it('rechaza un usuario inexistente', () => {
    const result = auth.authenticate('usuario_inexistente', 'Admin1234!', 'administrador');

    expect(result.ok).toBe(false);
    expect(session.profileId()).toBe('visitante');
  });

  it('rechaza credenciales válidas cuando el perfil solicitado es distinto', () => {
    expect(auth.authenticate('instructor_demo', 'Instructor1234!', 'administrador').ok).toBe(false);
    expect(session.profileId()).toBe('visitante');
    expect(permissions.can('admin:access')).toBe(false);

    expect(auth.authenticate('admin_demo', 'Admin1234!', 'instructor').ok).toBe(false);
    expect(session.profileId()).toBe('visitante');
    expect(permissions.can('alarm:control')).toBe(false);
  });

  it('permite el acceso directo de Aprendiz sin credenciales', () => {
    expect(DEMO_CREDENTIALS.some((credential) => credential.profileId === 'aprendiz')).toBe(false);
    expect(session.activateProfile('aprendiz')).toBe(true);

    expect(session.profileId()).toBe('aprendiz');
    expect(permissions.can('alarm:control')).toBe(false);
    expect(permissions.can('admin:access')).toBe(false);
  });

  it('permite el acceso directo de Visitante sin credenciales', () => {
    expect(DEMO_CREDENTIALS.some((credential) => credential.profileId === 'visitante')).toBe(false);
    expect(session.activateProfile('visitante')).toBe(true);

    expect(session.profileId()).toBe('visitante');
    expect(session.isActive()).toBe(false);
    expect(permissions.can('alarm:control')).toBe(false);
  });

  it('no concede permisos privilegiados antes del inicio de sesión', () => {
    expect(session.beginCredentialSelection('administrador')).toBe(true);
    expect(session.selectedProfileId()).toBe('administrador');
    expect(session.profileId()).toBe('visitante');
    expect(session.isAdministrative()).toBe(false);
    expect(permissions.can('admin:access')).toBe(false);
    expect(permissions.can('alarm:control')).toBe(false);

    expect(session.beginCredentialSelection('instructor')).toBe(true);
    expect(session.profileId()).toBe('visitante');
    expect(permissions.can('alarm:control')).toBe(false);
  });

  it('revoca los permisos al cambiar de perfil antes de autenticar de nuevo', () => {
    expect(auth.authenticate('admin_demo', 'Admin1234!', 'administrador').ok).toBe(true);
    expect(permissions.can('admin:access')).toBe(true);

    session.beginCredentialSelection('instructor');

    expect(session.profileId()).toBe('visitante');
    expect(permissions.can('admin:access')).toBe(false);
    expect(permissions.can('alarm:control')).toBe(false);

    expect(auth.authenticate('instructor_demo', 'Instructor1234!', 'instructor').ok).toBe(true);
    expect(permissions.can('alarm:control')).toBe(true);
    expect(permissions.can('admin:access')).toBe(false);
  });

  it('mantiene el permiso alarm:control únicamente para administrador e instructor', () => {
    const esperado: Readonly<Record<DemoProfileId, boolean>> = {
      administrador: true,
      instructor: true,
      aprendiz: false,
      visitante: false,
    };

    for (const profile of DEMO_PROFILES) {
      session.activateProfile(profile.id);
      expect(permissions.can('alarm:control')).toBe(esperado[profile.id]);
    }
  });

  it('no almacena usuario ni contraseña en el estado de sesión', () => {
    expect(auth.authenticate('admin_demo', 'Admin1234!', 'administrador').ok).toBe(true);

    const snapshot = JSON.stringify(session.state());
    expect(Object.keys(session.state())).toEqual(['profileId', 'profile', 'isActive', 'isAdministrative']);

    for (const credential of DEMO_CREDENTIALS) {
      expect(snapshot).not.toContain(credential.username);
      expect(snapshot).not.toContain(credential.password);
    }
  });

  it('vuelve al selector sin autenticar y revoca la selección pendiente', () => {
    session.beginCredentialSelection('instructor');
    expect(session.selectedProfileId()).toBe('instructor');

    session.closeSession();

    expect(session.selectedProfileId()).toBe('visitante');
    expect(session.profileId()).toBe('visitante');
    expect(permissions.can('alarm:control')).toBe(false);
    expect(auth.authenticate('', '', 'visitante').ok).toBe(false);
  });
});

describe('DemoAuthService (Fase 5.1.1 · gestión de instructores)', () => {
  const NEW_PASSWORD = 'InstructorNuevo1234!';

  let auth: DemoAuthService;
  let session: DemoSessionService;
  let permissions: DemoPermissionsService;

  function register(
    username = 'instructor_registrado',
    password = NEW_PASSWORD,
    confirmation = password,
  ): DemoInstructorMutationResult {
    return auth.registerInstructor(username, password, confirmation);
  }

  function expectOk(result: DemoInstructorMutationResult): Extract<DemoInstructorMutationResult, { ok: true }> {
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }
    return result;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    auth = TestBed.inject(DemoAuthService);
    session = TestBed.inject(DemoSessionService);
    permissions = TestBed.inject(DemoPermissionsService);
    expect(auth.authenticate('admin_demo', 'Admin1234!', 'administrador').ok).toBe(true);
  });

  it('1. el administrador autenticado puede registrar un instructor', () => {
    const result = expectOk(register());

    expect(result.message).toBe(DEMO_INSTRUCTOR_SUCCESS);
    expect(auth.instructorAccounts()).toHaveLength(2);
  });

  it('2. un instructor autenticado no puede registrar cuentas', () => {
    session.activateProfile('instructor');

    expect(permissions.can('instructors:manage')).toBe(false);
    expect(register('instructor_no_autorizado')).toEqual({ ok: false, error: DEMO_INSTRUCTOR_PERMISSION_ERROR });
    expect(auth.instructorAccounts()).toHaveLength(1);
  });

  it('3. un aprendiz autenticado no puede registrar cuentas', () => {
    session.activateProfile('aprendiz');

    expect(permissions.can('instructors:manage')).toBe(false);
    expect(register('instructor_no_aprendiz')).toEqual({ ok: false, error: DEMO_INSTRUCTOR_PERMISSION_ERROR });
    expect(auth.instructorAccounts()).toHaveLength(1);
  });

  it('4. un visitante no puede registrar cuentas', () => {
    session.activateProfile('visitante');

    expect(permissions.can('instructors:manage')).toBe(false);
    expect(register('instructor_no_visitante')).toEqual({ ok: false, error: DEMO_INSTRUCTOR_PERMISSION_ERROR });
    expect(auth.instructorAccounts()).toHaveLength(1);
  });

  it('5. rechaza un nombre de usuario duplicado', () => {
    expectOk(register('instructor_repetido'));

    expect(register('instructor_repetido')).toEqual({ ok: false, error: DEMO_INSTRUCTOR_DUPLICATE_ERROR });
    expect(auth.instructorAccounts()).toHaveLength(2);
  });

  it('6. rechaza duplicados aunque cambien las mayúsculas y minúsculas', () => {
    expectOk(register('instructor_mayusculas'));

    expect(register('Instructor_Mayusculas')).toEqual({ ok: false, error: DEMO_INSTRUCTOR_DUPLICATE_ERROR });
    expect(auth.instructorAccounts()).toHaveLength(2);
  });

  it('7. rechaza nombres vacíos y con espacios al inicio o al final', () => {
    expect(register('')).toEqual({ ok: false, error: DEMO_INSTRUCTOR_USERNAME_REQUIRED_ERROR });
    expect(register('   ')).toEqual({ ok: false, error: DEMO_INSTRUCTOR_USERNAME_REQUIRED_ERROR });
    expect(register(' instructor_espacios ')).toEqual({
      ok: false,
      error: DEMO_INSTRUCTOR_USERNAME_SPACES_ERROR,
    });
    expect(auth.instructorAccounts()).toHaveLength(1);
  });

  it('8. rechaza una contraseña demasiado corta', () => {
    expect(auth.registerInstructor('instructor_corto', 'Corta1', 'Corta1')).toEqual({
      ok: false,
      error: DEMO_INSTRUCTOR_PASSWORD_LENGTH_ERROR,
    });
    expect(auth.instructorAccounts()).toHaveLength(1);
  });

  it('9. rechaza una confirmación de contraseña incorrecta', () => {
    expect(register('instructor_distinto', NEW_PASSWORD, 'OtraPassword1234!')).toEqual({
      ok: false,
      error: DEMO_INSTRUCTOR_PASSWORD_MATCH_ERROR,
    });
    expect(auth.instructorAccounts()).toHaveLength(1);
  });

  it('10. un registro válido crea una cuenta pública con rol Instructor', () => {
    const result = expectOk(register('instructor_formato'));

    expect(result.account).toMatchObject({
      username: 'instructor_formato',
      role: 'Instructor',
      status: 'activo',
    });
    expect(result.account.id).toMatch(/^INS-/);
    expect(Object.keys(result.account)).toEqual(['id', 'username', 'role', 'status']);
    expect(auth.instructorAccounts().find((account) => account.id === result.account.id)).toEqual(result.account);
  });

  it('11. no es posible crear Administradores desde el registro', () => {
    const adminsIniciales = DEMO_CREDENTIALS.filter((credential) => credential.profileId === 'administrador');
    const result = expectOk(register('instructor_no_admin'));

    expect(result.account.role).toBe('Instructor');
    expect(auth.authenticate('instructor_no_admin', NEW_PASSWORD, 'administrador')).toEqual({
      ok: false,
      error: DEMO_LOGIN_ERROR,
    });
    expect(DEMO_CREDENTIALS.filter((credential) => credential.profileId === 'administrador')).toEqual(adminsIniciales);
  });

  it('12. registrar no cambia la sesión del Administrador', () => {
    const estadoInicial = JSON.stringify(session.state());
    const cuentaInicial = session.authenticatedAccountId();

    expectOk(register('instructor_sin_cambio'));

    expect(JSON.stringify(session.state())).toBe(estadoInicial);
    expect(session.authenticatedAccountId()).toBe(cuentaInicial);
    expect(session.profileId()).toBe('administrador');
    expect(permissions.can('admin:access')).toBe(true);
  });

  it('13. un instructor recién registrado puede iniciar sesión', () => {
    const result = expectOk(register('instructor_nuevo_login'));

    session.beginCredentialSelection('instructor');
    expect(auth.authenticate(result.account.username, NEW_PASSWORD, 'instructor')).toEqual({
      ok: true,
      profileId: 'instructor',
    });
    expect(session.profileId()).toBe('instructor');
    expect(permissions.can('alarm:control')).toBe(true);
    expect(permissions.can('admin:access')).toBe(false);
    expect(permissions.can('instructors:manage')).toBe(false);
  });

  it('14. rechaza una contraseña incorrecta sin conceder permisos', () => {
    const result = expectOk(register('instructor_clave_errada'));

    session.beginCredentialSelection('instructor');
    expect(auth.authenticate(result.account.username, 'ClaveIncorrecta123!', 'instructor')).toEqual({
      ok: false,
      error: DEMO_LOGIN_ERROR,
    });
    expect(session.profileId()).toBe('visitante');
    expect(permissions.can('alarm:control')).toBe(false);
    expect(permissions.can('admin:access')).toBe(false);
  });

  it('15. un instructor desactivado no puede iniciar sesión', () => {
    const result = expectOk(register('instructor_inactivo_login'));
    expect(auth.deactivateInstructor(result.account.id).ok).toBe(true);

    session.beginCredentialSelection('instructor');
    expect(auth.authenticate(result.account.username, NEW_PASSWORD, 'instructor')).toEqual({
      ok: false,
      error: DEMO_INACTIVE_INSTRUCTOR_ERROR,
    });
    expect(session.profileId()).toBe('visitante');
    expect(permissions.can('alarm:control')).toBe(false);
  });

  it('17. desactivar actualiza el listado sin borrar la cuenta ni afectar a Administrador', () => {
    const result = expectOk(register('instructor_desactivado_lista'));
    const totalInicial = auth.instructorAccounts().length;

    const deactivated = expectOk(auth.deactivateInstructor(result.account.id));
    const listado = auth.instructorAccounts();

    expect(deactivated.account.status).toBe('inactivo');
    expect(listado).toHaveLength(totalInicial);
    expect(listado.find((account) => account.id === result.account.id)?.status).toBe('inactivo');
    expect(auth.deactivateInstructor('ADM-DMO-001')).toEqual({
      ok: false,
      error: DEMO_INSTRUCTOR_NOT_FOUND_ERROR,
    });
    expect(auth.deactivateInstructor(result.account.id)).toEqual({
      ok: false,
      error: DEMO_INSTRUCTOR_ALREADY_INACTIVE_ERROR,
    });
  });

  it('19. el listado público no expone credenciales', () => {
    const credencialSecreta = 'SecretoDemo1234!';
    expectOk(register('instructor_secreto', credencialSecreta));

    const serializado = JSON.stringify(auth.instructorAccounts());

    expect(serializado).not.toContain(credencialSecreta);
    expect(serializado).not.toContain('Instructor1234!');
    expect(serializado).not.toContain('Admin1234!');
    for (const account of auth.instructorAccounts()) {
      expect(Object.keys(account)).toEqual(['id', 'username', 'role', 'status']);
    }
  });

  it('20. conserva alarm:control para instructores autenticados y lo retira al cambiar de perfil', () => {
    const result = expectOk(register('instructor_buzzer'));

    session.beginCredentialSelection('instructor');
    expect(auth.authenticate(result.account.username, NEW_PASSWORD, 'instructor').ok).toBe(true);
    expect(permissions.can('alarm:control')).toBe(true);

    session.selectProfile('aprendiz');
    expect(permissions.can('alarm:control')).toBe(false);

    session.selectProfile('visitante');
    expect(permissions.can('alarm:control')).toBe(false);
  });

  it('21. no se duplican cuentas al ejecutar registros consecutivos', () => {
    const first = expectOk(register('instructor_uno'));
    const second = expectOk(register('instructor_dos'));
    const listado = auth.instructorAccounts();

    expect(first.account.id).not.toBe(second.account.id);
    expect(listado).toHaveLength(3);
    expect(new Set(listado.map((account) => account.username)).size).toBe(3);
    expect(register('instructor_uno')).toEqual({ ok: false, error: DEMO_INSTRUCTOR_DUPLICATE_ERROR });
  });

  it('22. una recarga restablece las cuentas temporales al estado en memoria inicial', () => {
    expectOk(register('instructor_temporal'));
    expect(auth.instructorAccounts()).toHaveLength(2);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const recargado = TestBed.inject(DemoAuthService);

    expect(recargado).not.toBe(auth);
    expect(recargado.instructorAccounts()).toHaveLength(1);
    expect(recargado.instructorAccounts()[0].username).toBe('instructor_demo');
  });
});
