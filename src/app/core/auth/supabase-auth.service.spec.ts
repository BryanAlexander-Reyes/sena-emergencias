import { TestBed } from '@angular/core/testing';
import { type SupabaseClient } from '@supabase/supabase-js';

import { SupabaseService } from '../supabase.service';

import { DemoAuthService } from './demo-auth.service';
import { DemoPermissionsService } from './demo-permissions.service';
import { DemoSessionService } from './demo-session.service';
import {
  SUPABASE_LOGIN_ERROR,
  SUPABASE_NOT_CONFIGURED_ERROR,
  SUPABASE_USERNAME_ERROR,
  SupabaseAuthService,
  deriveInternalEmail,
  normalizeAuthUsername,
} from './supabase-auth.service';

const TEST_PASSWORD = 'password-de-prueba';

interface FakeClaims {
  readonly sub?: string;
  readonly app_metadata?: {
    readonly app_role?: unknown;
  };
}

interface FakeSession {
  readonly access_token: string;
  readonly user: {
    readonly id: string;
  };
}

interface FakeSignInResult {
  readonly data: {
    readonly session: FakeSession | null;
  };
  readonly error: {
    readonly message: string;
  } | null;
}

interface FakeClientOptions {
  readonly signInResult?: FakeSignInResult;
  readonly claims?: FakeClaims;
  readonly getClaimsError?: {
    readonly message: string;
  } | null;
  readonly signOutRejects?: boolean;
}

function createFakeClient(options: FakeClientOptions = {}) {
  const signInResult: FakeSignInResult = options.signInResult ?? {
    data: {
      session: {
        access_token: 'token-de-prueba',
        user: { id: 'usuario-autenticado-id' },
      },
    },
    error: null,
  };

  const getClaimsResult =
    options.getClaimsError === undefined || options.getClaimsError === null
      ? {
          data: {
            claims: options.claims ?? {
              sub: 'usuario-autenticado-id',
              app_metadata: { app_role: 'administrador' },
            },
          },
          error: null,
        }
      : { data: null, error: options.getClaimsError };

  const signInWithPassword = vi.fn(async () => signInResult);
  const getClaims = vi.fn(async () => getClaimsResult);
  const signOut = vi.fn(async () => {
    if (options.signOutRejects === true) {
      throw new Error('No se pudo cerrar la sesión remota.');
    }

    return { error: null };
  });

  const client = { auth: { signInWithPassword, getClaims, signOut } } as unknown as SupabaseClient;

  return { client, signInWithPassword, getClaims, signOut };
}

function configure(client: SupabaseClient | null) {
  TestBed.configureTestingModule({
    providers: [
      SupabaseAuthService,
      {
        provide: SupabaseService,
        useValue: { client, isConfigured: client !== null },
      },
    ],
  });

  return {
    auth: TestBed.inject(SupabaseAuthService),
    session: TestBed.inject(DemoSessionService),
    permissions: TestBed.inject(DemoPermissionsService),
  };
}

describe('SupabaseAuthService (Fase 5.3.4.B)', () => {
  it('normaliza nombres de usuario válidos y rechaza formatos inválidos', () => {
    expect(normalizeAuthUsername('  Admin_Demo  ')).toBe('Admin_Demo');
    expect(normalizeAuthUsername('a.b-c_123')).toBe('a.b-c_123');
    expect(normalizeAuthUsername('ab')).toBeNull();
    expect(normalizeAuthUsername('a'.repeat(33))).toBeNull();
    expect(normalizeAuthUsername('usuario con espacio')).toBeNull();
    expect(normalizeAuthUsername('usuario@correo')).toBeNull();
  });

  it('deriva el correo interno en minúsculas sin dominios reales', () => {
    expect(deriveInternalEmail('  Admin_Demo  ')).toBe('admin_demo@sena.local.invalid');
    expect(deriveInternalEmail('Instructor.01')).toBe('instructor.01@sena.local.invalid');
    expect(deriveInternalEmail('ab')).toBeNull();
  });

  it('autentica a un Administrador usando el claim app_role del JWT y activa el perfil', async () => {
    const fake = createFakeClient({ claims: { sub: 'admin-id', app_metadata: { app_role: 'administrador' } } });
    const { auth, session, permissions } = configure(fake.client);

    const account = await auth.signIn({ username: '  Admin_Demo  ', password: TEST_PASSWORD }, 'administrador');

    expect(fake.signInWithPassword).toHaveBeenCalledWith({
      email: 'admin_demo@sena.local.invalid',
      password: TEST_PASSWORD,
    });
    expect(fake.getClaims).toHaveBeenCalledWith('token-de-prueba');
    expect(account).toEqual({ id: 'admin-id', nombre: 'Admin_Demo', role: 'administrador' });
    expect(session.profileId()).toBe('administrador');
    expect(session.authenticatedAccount()).toEqual(account);
    expect(permissions.can('admin:access')).toBe(true);
  });

  it('autentica a un Instructor y concede únicamente el control de alarma', async () => {
    const fake = createFakeClient({ claims: { sub: 'instructor-id', app_metadata: { app_role: 'instructor' } } });
    const { auth, session, permissions } = configure(fake.client);

    await auth.signIn({ username: 'Instructor.01', password: TEST_PASSWORD }, 'instructor');

    expect(session.profileId()).toBe('instructor');
    expect(permissions.can('alarm:control')).toBe(true);
    expect(permissions.can('admin:access')).toBe(false);
    expect(permissions.can('instructors:manage')).toBe(false);
  });

  it.each([
    ['ausente', {}],
    ['desconocido', { sub: 'usuario-id', app_metadata: { app_role: 'rol_desconocido' } }],
    ['diferente', { sub: 'usuario-id', app_metadata: { app_role: 'instructor' } }],
  ])('rechaza un rol %s y limpia la sesión Supabase', async (_label, claims) => {
    const fake = createFakeClient({ claims });
    const { auth, session, permissions } = configure(fake.client);

    await expect(auth.signIn({ username: 'admin_demo', password: TEST_PASSWORD }, 'administrador')).rejects.toThrow(
      SUPABASE_LOGIN_ERROR,
    );

    expect(fake.signOut).toHaveBeenCalledTimes(1);
    expect(session.profileId()).toBe('aprendiz');
    expect(session.authenticatedAccount()).toBeNull();
    expect(permissions.can('admin:access')).toBe(false);
  });

  it('limpia el estado público aunque Supabase falle al cerrar la sesión rechazada', async () => {
    const fake = createFakeClient({
      claims: { sub: 'usuario-id', app_metadata: { app_role: 'instructor' } },
      signOutRejects: true,
    });
    const { auth, session } = configure(fake.client);

    await expect(auth.signIn({ username: 'admin_demo', password: TEST_PASSWORD }, 'administrador')).rejects.toThrow(
      SUPABASE_LOGIN_ERROR,
    );

    expect(session.profileId()).toBe('aprendiz');
    expect(session.authenticatedAccount()).toBeNull();
  });

  it('devuelve un error genérico cuando Supabase rechaza las credenciales', async () => {
    const fake = createFakeClient({
      signInResult: { data: { session: null }, error: { message: 'invalid login credentials' } },
    });
    const { auth, session, permissions } = configure(fake.client);

    await expect(auth.signIn({ username: 'admin_demo', password: TEST_PASSWORD }, 'administrador')).rejects.toThrow(
      SUPABASE_LOGIN_ERROR,
    );

    expect(fake.getClaims).not.toHaveBeenCalled();
    expect(session.profileId()).toBe('aprendiz');
    expect(permissions.can('alarm:control')).toBe(false);
  });

  it('rechaza un token cuyas claims no pueden validarse', async () => {
    const fake = createFakeClient({ getClaimsError: { message: 'token inválido' } });
    const { auth, session } = configure(fake.client);

    await expect(auth.signIn({ username: 'admin_demo', password: TEST_PASSWORD }, 'administrador')).rejects.toThrow(
      SUPABASE_LOGIN_ERROR,
    );

    expect(fake.signOut).toHaveBeenCalledTimes(1);
    expect(session.profileId()).toBe('aprendiz');
  });

  it('falla de forma controlada cuando Supabase no está configurado', async () => {
    const { auth, session, permissions } = configure(null);

    await expect(auth.signIn({ username: 'admin_demo', password: TEST_PASSWORD }, 'administrador')).rejects.toThrow(
      SUPABASE_NOT_CONFIGURED_ERROR,
    );

    expect(session.profileId()).toBe('aprendiz');
    expect(permissions.can('admin:access')).toBe(false);
  });

  it('valida el nombre de usuario antes de llamar a Supabase', async () => {
    const fake = createFakeClient();
    const { auth } = configure(fake.client);

    await expect(
      auth.signIn({ username: 'usuario con espacio', password: TEST_PASSWORD }, 'instructor'),
    ).rejects.toThrow(SUPABASE_USERNAME_ERROR);

    expect(fake.signInWithPassword).not.toHaveBeenCalled();
  });

  it('no usa DemoAuthService como mecanismo alternativo de acceso', async () => {
    const demoAuthenticate = vi.spyOn(DemoAuthService.prototype, 'authenticate');
    const fake = createFakeClient({
      signInResult: { data: { session: null }, error: { message: 'credenciales rechazadas' } },
    });
    const { auth, session } = configure(fake.client);

    await expect(auth.signIn({ username: 'admin_demo', password: TEST_PASSWORD }, 'administrador')).rejects.toThrow(
      SUPABASE_LOGIN_ERROR,
    );

    expect(demoAuthenticate).not.toHaveBeenCalled();
    expect(session.profileId()).toBe('aprendiz');
    demoAuthenticate.mockRestore();
  });

  it('cierra la sesión Supabase y vuelve al perfil público al invocar signOut', async () => {
    const fake = createFakeClient();
    const { auth, session, permissions } = configure(fake.client);

    await auth.signIn({ username: 'admin_demo', password: TEST_PASSWORD }, 'administrador');
    expect(permissions.can('admin:access')).toBe(true);

    await auth.signOut();

    expect(fake.signOut).toHaveBeenCalledTimes(1);
    expect(session.profileId()).toBe('aprendiz');
    expect(session.authenticatedAccount()).toBeNull();
    expect(permissions.can('admin:access')).toBe(false);
  });
});
