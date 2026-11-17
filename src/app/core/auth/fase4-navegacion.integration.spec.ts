import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { routes } from '../../app.routes';

import { ADMIN_ACCESS_DENIED_QUERY_PARAMS } from './admin-access.guard';
import { DemoSessionService } from './demo-session.service';

vi.setConfig({ testTimeout: 20000 });

describe('Integración Fase 4.5 — navegación y permisos administrativos', () => {
  let harness: RouterTestingHarness;
  let session: DemoSessionService;
  let router: Router;

  const deniedUrl = '/tabs/mas?acceso=denegado';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideRouter(routes)],
    }).compileComponents();

    session = TestBed.inject(DemoSessionService);
    router = TestBed.inject(Router);
  });

  const navigateToAdmin = async (): Promise<void> => {
    await harness.navigateByUrl('/tabs/mas/administracion').catch(() => false);
    await harness.fixture.whenStable();
    harness.detectChanges();
  };

  it.each(['instructor', 'aprendiz', 'visitante'] as const)(
    'deniega la URL directa de administración para %s',
    async (profileId) => {
      session.selectProfile(profileId);
      harness = await RouterTestingHarness.create();

      await navigateToAdmin();

      expect(router.url).toBe(deniedUrl);
      expect(harness.routeNativeElement?.textContent).toContain('Acceso no disponible');
      expect(harness.routeNativeElement?.querySelector('.admin-users')).toBeNull();
    },
  );

  it('permite la URL directa de administración al perfil administrador', async () => {
    session.selectProfile('administrador');
    harness = await RouterTestingHarness.create();

    await navigateToAdmin();

    expect(router.url).toBe('/tabs/mas/administracion');
    expect(harness.routeNativeElement?.querySelector('.admin-users')).toBeTruthy();
    expect(harness.routeNativeElement?.textContent).toContain('Administración');
  });

  it('retira la vista administrativa cacheada al perder el permiso', async () => {
    session.selectProfile('administrador');
    harness = await RouterTestingHarness.create();
    await navigateToAdmin();

    expect(harness.routeNativeElement?.querySelector('.admin-users')).toBeTruthy();

    session.selectProfile('visitante');
    TestBed.flushEffects();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(router.url).toBe(deniedUrl);
    expect(harness.routeNativeElement?.querySelector('.admin-users')).toBeNull();
    expect(harness.routeNativeElement?.textContent).toContain('Acceso restringido');
  });

  it('no recupera contenido administrativo con la navegación Atrás', async () => {
    session.selectProfile('administrador');
    harness = await RouterTestingHarness.create();
    await navigateToAdmin();

    session.selectProfile('visitante');
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
