import { TestBed } from '@angular/core/testing';
import { type ActivatedRouteSnapshot, provideRouter, Router, type RouterStateSnapshot } from '@angular/router';

import { ADMIN_ACCESS_DENIED_QUERY_PARAMS, adminAccessGuard } from './admin-access.guard';
import { DemoSessionService } from './demo-session.service';
import { verifiedTestIdentities, type VerifiedTestIdentities } from './testing/verified-session-test.util';

describe('adminAccessGuard', () => {
  let router: Router;
  let session: DemoSessionService;
  let verified: VerifiedTestIdentities;

  const runGuard = async (): Promise<boolean> =>
    (await TestBed.runInInjectionContext(() =>
      adminAccessGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    )) === true;

  beforeEach(async () => {
    verified = await verifiedTestIdentities();

    await TestBed.configureTestingModule({
      providers: [provideRouter([])],
    }).compileComponents();

    router = TestBed.inject(Router);
    session = TestBed.inject(DemoSessionService);
  });

  it('permite la navegación al administrador con identidad validada', async () => {
    session.publishVerifiedIdentity(verified.administrador);
    expect(await runGuard()).toBe(true);
  });

  it.each(['instructor', 'aprendiz'] as const)('deniega la navegación directa a %s', async (profileId) => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    if (profileId === 'instructor') {
      session.publishVerifiedIdentity(verified.instructor);
    } else {
      session.selectProfile('aprendiz');
    }

    expect(await runGuard()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/tabs/mas'], {
      queryParams: ADMIN_ACCESS_DENIED_QUERY_PARAMS,
      replaceUrl: true,
    });
  });

  it('deniega una sesión inválida sin identidad', async () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    session.suspendForValidation();
    session.finishInitialization();

    expect(await runGuard()).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('vuelve a denegar la navegación después de perder el permiso', async () => {
    session.publishVerifiedIdentity(verified.administrador);
    expect(await runGuard()).toBe(true);

    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    session.closeSession();

    expect(await runGuard()).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('espera a whenReady antes de decidir y no redirige prematuramente', async () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    session.beginInitialization();

    let resolved = false;
    const guarding = runGuard().then((allowed) => {
      resolved = true;
      return allowed;
    });
    await Promise.resolve();

    expect(resolved).toBe(false);
    expect(navigate).not.toHaveBeenCalled();

    session.publishVerifiedIdentity(verified.administrador);

    expect(await guarding).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });
});
