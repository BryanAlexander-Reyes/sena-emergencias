import { TestBed } from '@angular/core/testing';
import { type ActivatedRouteSnapshot, provideRouter, Router, type RouterStateSnapshot } from '@angular/router';

import { ADMIN_ACCESS_DENIED_QUERY_PARAMS, adminAccessGuard } from './admin-access.guard';
import { DemoSessionService } from './demo-session.service';

describe('adminAccessGuard', () => {
  let router: Router;
  let session: DemoSessionService;

  const runGuard = (): unknown =>
    TestBed.runInInjectionContext(() => adminAccessGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideRouter([])],
    }).compileComponents();

    router = TestBed.inject(Router);
    session = TestBed.inject(DemoSessionService);
  });

  it('permite la navegación al administrador de demostración', () => {
    session.selectProfile('administrador');
    expect(runGuard()).toBe(true);
  });

  it.each(['instructor', 'aprendiz', 'visitante'] as const)('deniega la navegación directa a %s', (profileId) => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    session.selectProfile(profileId);

    expect(runGuard()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/tabs/mas'], {
      queryParams: ADMIN_ACCESS_DENIED_QUERY_PARAMS,
      replaceUrl: true,
    });
  });

  it('vuelve a denegar la navegación después de perder el permiso', () => {
    session.selectProfile('administrador');
    expect(runGuard()).toBe(true);

    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    session.selectProfile('visitante');

    expect(runGuard()).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
