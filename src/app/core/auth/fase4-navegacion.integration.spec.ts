import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { routes } from '../../app.routes';

import { ADMIN_ACCESS_DENIED_QUERY_PARAMS } from './admin-access.guard';
import { AUTH_FACADE, type AuthFacade } from './auth-facade.contract';
import { DemoSessionService } from './demo-session.service';
import { INSTRUCTOR_ACCOUNT_REPOSITORY } from './instructor-account-repository.contract';
import { verifiedTestIdentities, type VerifiedTestIdentities } from './testing/verified-session-test.util';

vi.setConfig({ testTimeout: 20000 });

describe('Integración Fase 4.5 — navegación y permisos administrativos', () => {
  let harness: RouterTestingHarness;
  let session: DemoSessionService;
  let router: Router;
  let verified: VerifiedTestIdentities;

  const deniedUrl = '/tabs/mas?acceso=denegado';

  beforeEach(async () => {
    verified = await verifiedTestIdentities();
    const authFacade: AuthFacade = {
      signIn: vi.fn<AuthFacade['signIn']>(),
      signOut: vi.fn<AuthFacade['signOut']>(async () => undefined),
    };

    const instructorAccount = { id: 'ins-simulado', nombre: 'instructor_simulado', activo: true };

    await TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: AUTH_FACADE, useValue: authFacade },
        {
          provide: INSTRUCTOR_ACCOUNT_REPOSITORY,
          useValue: {
            create: vi.fn().mockResolvedValue(instructorAccount),
            list: vi.fn().mockResolvedValue([]),
            setActive: vi.fn().mockResolvedValue(instructorAccount),
          },
        },
      ],
    }).compileComponents();

    session = TestBed.inject(DemoSessionService);
    router = TestBed.inject(Router);
  });

  const navigateToAdmin = async (): Promise<void> => {
    await harness.navigateByUrl('/tabs/mas/administracion').catch(() => false);
    await harness.fixture.whenStable();
    harness.detectChanges();
  };

  const activate = (profileId: 'administrador' | 'instructor' | 'aprendiz'): void => {
    if (profileId === 'administrador') {
      session.publishVerifiedIdentity(verified.administrador);
    } else if (profileId === 'instructor') {
      session.publishVerifiedIdentity(verified.instructor);
    } else {
      session.selectProfile('aprendiz');
    }
  };

  it.each(['instructor', 'aprendiz'] as const)(
    'deniega la URL directa de administración para %s',
    async (profileId) => {
      activate(profileId);
      harness = await RouterTestingHarness.create();

      await navigateToAdmin();

      expect(router.url).toBe(deniedUrl);
      expect(harness.routeNativeElement?.textContent).toContain('Acceso no disponible');
      expect(harness.routeNativeElement?.querySelector('.admin-users')).toBeNull();
    },
  );

  it('permite la URL directa de administración al perfil administrador', async () => {
    activate('administrador');
    harness = await RouterTestingHarness.create();

    await navigateToAdmin();

    expect(router.url).toBe('/tabs/mas/administracion');
    expect(harness.routeNativeElement?.querySelector('.admin-users')).toBeTruthy();
    expect(harness.routeNativeElement?.textContent).toContain('Administración');
  });

  it('retira la vista administrativa cacheada al perder el permiso', async () => {
    activate('administrador');
    harness = await RouterTestingHarness.create();
    await navigateToAdmin();

    expect(harness.routeNativeElement?.querySelector('.admin-users')).toBeTruthy();

    activate('aprendiz');
    TestBed.flushEffects();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(router.url).toBe(deniedUrl);
    expect(harness.routeNativeElement?.querySelector('.admin-users')).toBeNull();
    expect(harness.routeNativeElement?.textContent).toContain('Acceso restringido');
  });

  it('no recupera contenido administrativo con la navegación Atrás', async () => {
    activate('administrador');
    harness = await RouterTestingHarness.create();
    await navigateToAdmin();

    activate('aprendiz');
    TestBed.flushEffects();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(router.url).toBe(deniedUrl);

    window.history.back();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(router.url).not.toContain('/administracion');
    expect(harness.routeNativeElement?.querySelector('.admin-users')).toBeNull();
    expect(harness.routeNativeElement?.textContent?.toLowerCase()).not.toContain('usuarios ficticios');
  });

  it('usa parametros de redireccion coherentes con el guard', () => {
    expect(ADMIN_ACCESS_DENIED_QUERY_PARAMS).toEqual({ acceso: 'denegado' });
  });
});
