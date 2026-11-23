import { TestBed } from '@angular/core/testing';
import { type ActivatedRouteSnapshot, provideRouter, Router, type RouterStateSnapshot } from '@angular/router';
import { type SupabaseClient } from '@supabase/supabase-js';

import { SupabaseService } from '../supabase.service';

import { ADMIN_ACCESS_DENIED_QUERY_PARAMS, adminAccessGuard } from './admin-access.guard';
import type { AuthenticatedAccount } from './auth-domain.types';
import { DemoAuthService } from './demo-auth.service';
import { DemoPermissionsService, DEMO_PERMISSIONS } from './demo-permissions.service';
import { DemoSessionService } from './demo-session.service';
import { SupabaseSessionService } from './supabase-session.service';
import { verifiedTestIdentities, type VerifiedTestIdentities } from './testing/verified-session-test.util';

type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED';
type AuthListener = (event: AuthEvent, session: { access_token: string } | null) => void;

interface FakeClaims {
  readonly sub?: string;
  readonly email?: string;
  readonly app_metadata?: { readonly app_role?: unknown };
}

const ADMIN_EMAIL = 'admin_demo@sena.local.invalid';

function claimsFor(role: unknown, email: string): FakeClaims {
  return { sub: `${role}-id`, email, app_metadata: { app_role: role } };
}

function createFakeClient(claimsByToken: Readonly<Record<string, FakeClaims | null>> = {}) {
  let listener: AuthListener | null = null;
  let resolveDeferred: ((claims: FakeClaims) => void) | null = null;

  const getClaims = vi.fn(async (token: string) => {
    if (token === 'token-lento') {
      return new Promise<{ data: { claims: FakeClaims | null }; error: null }>((resolve) => {
        resolveDeferred = (claims) => resolve({ data: { claims }, error: null });
      });
    }

    return { data: { claims: claimsByToken[token] ?? null }, error: null };
  });

  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      getClaims,
      signOut: vi.fn(async () => ({ error: null })),
      onAuthStateChange: vi.fn((callback: AuthListener) => {
        listener = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
  } as unknown as SupabaseClient;

  return {
    client,
    getClaims,
    emit: (event: AuthEvent, token: string | null) =>
      listener?.(event, token === null ? null : { access_token: token }),
    resolveDeferred: (claims: FakeClaims) => resolveDeferred?.(claims),
  };
}

function configure(client: SupabaseClient) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      SupabaseSessionService,
      { provide: SupabaseService, useValue: { client, isConfigured: true } },
    ],
  });

  return {
    manager: TestBed.inject(SupabaseSessionService),
    session: TestBed.inject(DemoSessionService),
    permissions: TestBed.inject(DemoPermissionsService),
    router: TestBed.inject(Router),
  };
}

async function settle(): Promise<void> {
  for (let tick = 0; tick < 16; tick += 1) {
    await Promise.resolve();
  }
}

describe('Fase 5.3.4.D — guards, permisos y seguridad', () => {
  let verified: VerifiedTestIdentities;

  beforeEach(async () => {
    verified = await verifiedTestIdentities();
  });

  it('arranca como Aprendiz y la selección pública no concede privilegios', async () => {
    const fake = createFakeClient();
    const { manager, session, permissions } = configure(fake.client);
    await manager.initialize();

    expect(session.snapshot.role).toBe('aprendiz');
    expect(session.snapshot.status).toBe('lista');
    expect(session.profileId()).toBe('aprendiz');
    expect(session.authenticatedAccount()).toBeNull();
    session.selectPublicRole('aprendiz');

    expect(permissions.granted()).toEqual([]);
    for (const permission of DEMO_PERMISSIONS) {
      expect(permissions.can(permission)).toBe(false);
    }
  });

  it('rechaza activaciones demo y una identidad inconsistente', () => {
    const fake = createFakeClient();
    const { session, permissions } = configure(fake.client);

    expect(session.activateProfile('administrador')).toBe(false);
    expect(session.selectProfile('instructor')).toBe(false);
    expect(session.publishVerifiedIdentity({ account: {} as AuthenticatedAccount } as never)).toBe(false);
    expect(
      session.publishVerifiedIdentity({
        account: { id: 'id', nombre: 'nombre', role: 'aprendiz' },
      } as never),
    ).toBe(false);

    expect(session.profileId()).toBe('aprendiz');
    expect(session.authenticatedAccount()).toBeNull();
    expect(permissions.can('admin:access')).toBe(false);
    expect(permissions.can('alarm:control')).toBe(false);
  });

  it('publica Administrador e Instructor solo desde identidades validadas por el orquestador', async () => {
    const fake = createFakeClient();
    const { manager, session, permissions } = configure(fake.client);
    await manager.initialize();

    expect(session.profileId()).toBe('aprendiz');

    manager.applyVerifiedToken('token-admin', verified.administrador);
    expect(permissions.can('admin:access')).toBe(true);
    expect(permissions.can('instructors:manage')).toBe(true);

    manager.applyVerifiedToken('token-instructor', verified.instructor);
    expect(permissions.can('alarm:control')).toBe(true);
    expect(permissions.can('admin:access')).toBe(false);
    expect(permissions.can('instructors:manage')).toBe(false);
  });

  it('desactiva privilegios durante la revalidación y limpia al cerrar', async () => {
    const fake = createFakeClient();
    const { session, permissions } = configure(fake.client);

    session.publishVerifiedIdentity(verified.administrador);
    expect(permissions.can('admin:access')).toBe(true);

    session.suspendForValidation();
    expect(session.status()).toBe('inicializando');
    expect(permissions.granted()).toEqual([]);

    session.finishInitialization();
    session.closeSession();
    expect(session.profileId()).toBe('aprendiz');
    expect(session.authenticatedAccount()).toBeNull();
    expect(permissions.granted()).toEqual([]);
  });

  it('un evento de Auth tardío no reactiva permisos tras el cierre', async () => {
    const fake = createFakeClient();
    const { manager, session, permissions } = configure(fake.client);
    await manager.initialize();

    fake.emit('SIGNED_IN', 'token-lento');
    await settle();
    expect(session.status()).toBe('inicializando');

    manager.invalidateSession();
    fake.resolveDeferred(claimsFor('administrador', ADMIN_EMAIL));
    await settle();

    expect(session.status()).toBe('lista');
    expect(session.profileId()).toBe('aprendiz');
    expect(session.authenticatedAccount()).toBeNull();
    expect(permissions.can('admin:access')).toBe(false);
  });

  it('el guard asíncrono solo autoriza Administrador validado', async () => {
    const fake = createFakeClient();
    const { session, router } = configure(fake.client);
    const runGuard = async (): Promise<boolean> =>
      (await TestBed.runInInjectionContext(() =>
        adminAccessGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      )) === true;

    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    session.selectPublicRole('aprendiz');
    expect(await runGuard()).toBe(false);
    session.publishVerifiedIdentity(verified.instructor);
    expect(await runGuard()).toBe(false);
    session.selectProfile('aprendiz');
    expect(await runGuard()).toBe(false);
    session.publishVerifiedIdentity(verified.administrador);
    expect(await runGuard()).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['/tabs/mas'], {
      queryParams: ADMIN_ACCESS_DENIED_QUERY_PARAMS,
      replaceUrl: true,
    });
  });

  it('no expone una alternativa demo al acceso privilegiado', () => {
    expect('signIn' in DemoAuthService.prototype).toBe(false);
    expect('signOut' in DemoAuthService.prototype).toBe(false);
  });
});
