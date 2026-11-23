import { TestBed } from '@angular/core/testing';
import { type SupabaseClient } from '@supabase/supabase-js';

import { SupabaseService } from '../supabase.service';

import { DemoPermissionsService } from './demo-permissions.service';
import { DemoSessionService } from './demo-session.service';
import { SupabaseSessionService } from './supabase-session.service';
import { verifiedTestIdentities } from './testing/verified-session-test.util';

const ADMIN_EMAIL = 'admin_demo@sena.local.invalid';
const INSTRUCTOR_EMAIL = 'instructor_demo@sena.local.invalid';

type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED';
type AuthListener = (event: AuthEvent, session: FakeSession | null) => void;

interface FakeSession {
  readonly access_token: string;
}

interface FakeClaims {
  readonly sub?: string;
  readonly email?: string;
  readonly app_metadata?: {
    readonly app_role?: unknown;
  };
}

interface FakeClientOptions {
  readonly session?: FakeSession | null;
  readonly getSessionError?: boolean;
  readonly claimsByToken?: Readonly<Record<string, FakeClaims | null>>;
  readonly getClaimsError?: boolean;
  readonly deferredToken?: string;
}

function claimsFor(role: unknown, email: string, id = 'usuario-id'): FakeClaims {
  return { sub: id, email, app_metadata: { app_role: role } };
}

function createFakeClient(options: FakeClientOptions = {}) {
  const session = options.session === undefined ? null : options.session;
  let listener: AuthListener | null = null;
  let resolveDeferred: ((claims: FakeClaims | null) => void) | null = null;

  const getSession = vi.fn(async () =>
    options.getSessionError === true
      ? { data: { session: null }, error: { message: 'error simulado' } }
      : { data: { session }, error: null },
  );

  const getClaims = vi.fn(async (token: string) => {
    if (options.getClaimsError === true) {
      return { data: { claims: null }, error: { message: 'token inválido' } };
    }

    if (token === options.deferredToken) {
      return new Promise<{ data: { claims: FakeClaims | null }; error: null }>((resolve) => {
        resolveDeferred = (claims) => resolve({ data: { claims }, error: null });
      });
    }

    const claims =
      options.claimsByToken === undefined
        ? claimsFor('administrador', ADMIN_EMAIL)
        : (options.claimsByToken[token] ?? null);

    return { data: { claims }, error: null };
  });

  const signOut = vi.fn(async () => ({ error: null }));
  const onAuthStateChange = vi.fn((callback: AuthListener) => {
    listener = callback;

    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });

  const client = { auth: { getSession, getClaims, signOut, onAuthStateChange } } as unknown as SupabaseClient;

  return {
    client,
    getSession,
    getClaims,
    signOut,
    onAuthStateChange,
    emit: (event: AuthEvent, emittedSession: FakeSession | null) => listener?.(event, emittedSession),
    resolveDeferred: (claims: FakeClaims | null) => resolveDeferred?.(claims),
  };
}

function configure(client: SupabaseClient | null) {
  TestBed.configureTestingModule({
    providers: [
      SupabaseSessionService,
      {
        provide: SupabaseService,
        useValue: { client, isConfigured: client !== null },
      },
    ],
  });

  return {
    manager: TestBed.inject(SupabaseSessionService),
    session: TestBed.inject(DemoSessionService),
    permissions: TestBed.inject(DemoPermissionsService),
  };
}

/** Drena las microtareas encoladas por el procesador serial de eventos. */
async function settle(): Promise<void> {
  for (let tick = 0; tick < 16; tick += 1) {
    await Promise.resolve();
  }
}

describe('SupabaseSessionService (Fase 5.3.4.C)', () => {
  it('arranca en inicializando y termina en lista con Aprendiz si no hay sesión', async () => {
    const fake = createFakeClient();
    const { manager, session, permissions } = configure(fake.client);

    expect(session.status()).toBe('inicializando');
    const ready = session.whenReady();

    await manager.initialize();

    expect(session.status()).toBe('lista');
    expect((await ready).status).toBe('lista');
    expect(session.profileId()).toBe('aprendiz');
    expect(session.authenticatedAccount()).toBeNull();
    expect(permissions.can('admin:access')).toBe(false);
    expect(fake.getClaims).not.toHaveBeenCalled();
  });

  it.each([
    ['administrador', ADMIN_EMAIL, 'admin-id', 'admin:access'],
    ['instructor', INSTRUCTOR_EMAIL, 'instructor-id', 'alarm:control'],
  ] as const)('restaura una sesión válida de %s validando sus claims', async (role, email, id, permission) => {
    const fake = createFakeClient({
      session: { access_token: 'token-valido' },
      claimsByToken: { 'token-valido': claimsFor(role, email, id) },
    });
    const { manager, session, permissions } = configure(fake.client);

    await manager.initialize();

    expect(fake.getSession).toHaveBeenCalledTimes(1);
    expect(fake.getClaims).toHaveBeenCalledWith('token-valido');
    expect(fake.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(session.status()).toBe('lista');
    expect(session.profileId()).toBe(role);
    expect(session.authenticatedAccount()).toEqual({
      id,
      nombre: role === 'administrador' ? 'admin_demo' : 'instructor_demo',
      role,
    });
    expect(permissions.can(permission)).toBe(true);
    if (role === 'instructor') {
      expect(permissions.can('admin:access')).toBe(false);
    }
  });

  it('no concede privilegios mientras se valida una claims pendiente', async () => {
    const fake = createFakeClient({
      session: { access_token: 'token-lento' },
      claimsByToken: { 'token-lento': claimsFor('administrador', ADMIN_EMAIL) },
      deferredToken: 'token-lento',
    });
    const { manager, session, permissions } = configure(fake.client);

    const initializing = manager.initialize();
    await settle();

    expect(session.status()).toBe('inicializando');
    expect(session.profileId()).toBe('aprendiz');
    expect(permissions.can('admin:access')).toBe(false);

    fake.resolveDeferred(claimsFor('administrador', ADMIN_EMAIL));
    await initializing;

    expect(session.status()).toBe('lista');
    expect(session.profileId()).toBe('administrador');
    expect(permissions.can('admin:access')).toBe(true);
  });

  it('degrada a Aprendiz si el token no tiene claims verificables', async () => {
    const fake = createFakeClient({ session: { access_token: 'token-invalido' }, getClaimsError: true });
    const { manager, session, permissions } = configure(fake.client);

    await manager.initialize();

    expect(session.status()).toBe('lista');
    expect(session.profileId()).toBe('aprendiz');
    expect(session.authenticatedAccount()).toBeNull();
    expect(permissions.can('alarm:control')).toBe(false);
  });

  it('degrada a Aprendiz si getClaims devuelve claims nulas', async () => {
    const fake = createFakeClient({
      session: { access_token: 'token-vacio' },
      claimsByToken: { 'token-vacio': null },
    });
    const { manager, session } = configure(fake.client);

    await manager.initialize();

    expect(session.profileId()).toBe('aprendiz');
    expect(session.status()).toBe('lista');
  });

  it.each([
    ['ausente', claimsFor(undefined, ADMIN_EMAIL)],
    ['desconocido', claimsFor('rol_no_permitido', ADMIN_EMAIL)],
    ['no permitido', claimsFor('aprendiz', ADMIN_EMAIL)],
  ])('rechaza un rol %s y conserva Aprendiz', async (_label, claims) => {
    const fake = createFakeClient({
      session: { access_token: 'token-rol' },
      claimsByToken: { 'token-rol': claims },
    });
    const { manager, session, permissions } = configure(fake.client);

    await manager.initialize();

    expect(session.profileId()).toBe('aprendiz');
    expect(session.authenticatedAccount()).toBeNull();
    expect(permissions.can('admin:access')).toBe(false);
    expect(permissions.can('alarm:control')).toBe(false);
  });

  it('no reconstruye un nombre inventado si falta el claim de correo verificado', async () => {
    const fake = createFakeClient({
      session: { access_token: 'token-sin-email' },
      claimsByToken: { 'token-sin-email': { sub: 'usuario-id', app_metadata: { app_role: 'administrador' } } },
    });
    const { manager, session, permissions } = configure(fake.client);

    await manager.initialize();

    expect(session.profileId()).toBe('aprendiz');
    expect(session.authenticatedAccount()).toBeNull();
    expect(permissions.can('admin:access')).toBe(false);
  });

  it('conserva Aprendiz y termina en lista si Supabase no está configurado', async () => {
    const { manager, session, permissions } = configure(null);

    await manager.initialize();

    expect(session.status()).toBe('lista');
    expect(session.profileId()).toBe('aprendiz');
    expect(permissions.can('admin:access')).toBe(false);
  });

  it('conserva Aprendiz si getSession falla de forma controlada', async () => {
    const fake = createFakeClient({ getSessionError: true });
    const { manager, session } = configure(fake.client);

    await manager.initialize();

    expect(session.status()).toBe('lista');
    expect(session.profileId()).toBe('aprendiz');
  });

  it('limpia identidad y permisos ante SIGNED_OUT', async () => {
    const fake = createFakeClient({
      session: { access_token: 'token-admin' },
      claimsByToken: { 'token-admin': claimsFor('administrador', ADMIN_EMAIL) },
    });
    const { manager, session, permissions } = configure(fake.client);
    await manager.initialize();
    expect(session.profileId()).toBe('administrador');

    fake.emit('SIGNED_OUT', null);
    await settle();

    expect(session.profileId()).toBe('aprendiz');
    expect(session.authenticatedAccount()).toBeNull();
    expect(session.status()).toBe('lista');
    expect(permissions.can('admin:access')).toBe(false);
  });

  it('revalida un TOKEN_REFRESHED con rol válido antes de actualizar la identidad', async () => {
    const fake = createFakeClient({
      session: { access_token: 'token-viejo' },
      claimsByToken: {
        'token-viejo': claimsFor('instructor', INSTRUCTOR_EMAIL, 'instructor-id'),
        'token-nuevo': claimsFor('instructor', INSTRUCTOR_EMAIL, 'instructor-id'),
      },
    });
    const { manager, session, permissions } = configure(fake.client);
    await manager.initialize();

    fake.emit('TOKEN_REFRESHED', { access_token: 'token-nuevo' });
    await settle();

    expect(fake.getClaims).toHaveBeenCalledWith('token-nuevo');
    expect(session.profileId()).toBe('instructor');
    expect(session.status()).toBe('lista');
    expect(permissions.can('alarm:control')).toBe(true);
    expect(permissions.can('admin:access')).toBe(false);
  });

  it('revoca privilegios si un TOKEN_REFRESHED trae un rol inválido', async () => {
    const fake = createFakeClient({
      session: { access_token: 'token-admin' },
      claimsByToken: {
        'token-admin': claimsFor('administrador', ADMIN_EMAIL),
        'token-cambiado': claimsFor('rol_no_permitido', ADMIN_EMAIL),
      },
    });
    const { manager, session, permissions } = configure(fake.client);
    await manager.initialize();

    fake.emit('TOKEN_REFRESHED', { access_token: 'token-cambiado' });
    await settle();

    expect(session.profileId()).toBe('aprendiz');
    expect(session.authenticatedAccount()).toBeNull();
    expect(permissions.can('admin:access')).toBe(false);
  });

  it('ignora eventos duplicados del mismo token y evita validaciones redundantes', async () => {
    const fake = createFakeClient({
      session: { access_token: 'token-admin' },
      claimsByToken: { 'token-admin': claimsFor('administrador', ADMIN_EMAIL) },
    });
    const { manager, session } = configure(fake.client);
    await manager.initialize();

    fake.emit('SIGNED_IN', { access_token: 'token-admin' });
    fake.emit('INITIAL_SESSION', { access_token: 'token-admin' });
    fake.emit('TOKEN_REFRESHED', { access_token: 'token-admin' });
    await settle();

    expect(fake.getClaims).toHaveBeenCalledTimes(1);
    expect(session.profileId()).toBe('administrador');
  });

  it('descarta una validación en vuelo si llega SIGNED_OUT antes de resolver', async () => {
    const claims = claimsFor('administrador', ADMIN_EMAIL);
    const fake = createFakeClient({
      deferredToken: 'token-lento',
      claimsByToken: { 'token-lento': claims },
    });
    const { manager, session, permissions } = configure(fake.client);
    await manager.initialize();

    fake.emit('SIGNED_IN', { access_token: 'token-lento' });
    await settle();
    expect(session.status()).toBe('inicializando');

    fake.emit('SIGNED_OUT', null);
    expect(session.profileId()).toBe('aprendiz');

    fake.resolveDeferred(claims);
    await settle();

    expect(session.status()).toBe('lista');
    expect(session.profileId()).toBe('aprendiz');
    expect(session.authenticatedAccount()).toBeNull();
    expect(permissions.can('admin:access')).toBe(false);
  });

  it('publica la cuenta ya validada por signIn sin repetir la validación del token', async () => {
    const fake = createFakeClient();
    const { manager, session } = configure(fake.client);
    const verified = await verifiedTestIdentities();

    manager.applyVerifiedToken('token-login', verified.administrador);
    fake.emit('SIGNED_IN', { access_token: 'token-login' });
    await settle();

    expect(fake.getClaims).not.toHaveBeenCalled();
    expect(session.profileId()).toBe('administrador');
    expect(session.authenticatedAccount()).toEqual(verified.administrador.account);
  });

  it('cierra Supabase y vuelve a Aprendiz desde signOut', async () => {
    const fake = createFakeClient({
      session: { access_token: 'token-admin' },
      claimsByToken: { 'token-admin': claimsFor('administrador', ADMIN_EMAIL) },
    });
    const { manager, session, permissions } = configure(fake.client);
    await manager.initialize();

    await manager.signOut();

    expect(fake.signOut).toHaveBeenCalledTimes(1);
    expect(session.profileId()).toBe('aprendiz');
    expect(session.authenticatedAccount()).toBeNull();
    expect(permissions.can('admin:access')).toBe(false);
  });

  it('limpia el estado local aunque falle el cierre remoto', async () => {
    const fake = createFakeClient({
      session: { access_token: 'token-admin' },
      claimsByToken: { 'token-admin': claimsFor('administrador', ADMIN_EMAIL) },
    });
    fake.signOut.mockRejectedValueOnce(new Error('fallo remoto simulado'));
    const { manager, session, permissions } = configure(fake.client);
    await manager.initialize();

    await expect(manager.signOut()).resolves.toBeUndefined();

    expect(session.profileId()).toBe('aprendiz');
    expect(session.authenticatedAccount()).toBeNull();
    expect(permissions.can('admin:access')).toBe(false);
  });

  it('mantiene el acceso público de Aprendiz sin credenciales', async () => {
    const fake = createFakeClient();
    const { manager, session, permissions } = configure(fake.client);
    await manager.initialize();

    session.selectPublicRole('aprendiz');

    expect(session.profileId()).toBe('aprendiz');
    expect(session.isActive()).toBe(false);
    expect(fake.getClaims).not.toHaveBeenCalled();
    expect(fake.signOut).not.toHaveBeenCalled();
    expect(permissions.can('admin:access')).toBe(false);
    expect(permissions.can('alarm:control')).toBe(false);
  });

  it('inicializa una sola vez aunque se invoque repetidamente', async () => {
    const fake = createFakeClient();
    const { manager, session } = configure(fake.client);

    await Promise.all([manager.initialize(), manager.initialize()]);

    expect(fake.getSession).toHaveBeenCalledTimes(1);
    expect(fake.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(session.status()).toBe('lista');
  });
});
