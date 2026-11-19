import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import type { AuthenticatedAccount } from '../../core/auth/auth-domain.types';
import { AUTH_FACADE, type AuthFacade } from '../../core/auth/auth-facade.contract';
import { DemoAuthService } from '../../core/auth/demo-auth.service';
import { DEMO_CREDENTIALS } from '../../core/auth/demo-credentials';
import { DemoPermissionsService } from '../../core/auth/demo-permissions.service';
import { DemoSessionService } from '../../core/auth/demo-session.service';
import { SUPABASE_LOGIN_ERROR } from '../../core/auth/supabase-auth.service';
import {
  verifiedTestIdentities,
  type VerifiedTestIdentities,
} from '../../core/auth/testing/verified-session-test.util';

import { AccesoPage } from './acceso.page';

describe('AccesoPage', () => {
  let component: AccesoPage;
  let fixture: ComponentFixture<AccesoPage>;
  let session: DemoSessionService;
  let permissions: DemoPermissionsService;
  let router: Router;
  let verified: VerifiedTestIdentities;

  const signIn = vi.fn<AuthFacade['signIn']>();
  const signOut = vi.fn<AuthFacade['signOut']>();
  const authFacade: AuthFacade = { signIn, signOut };

  const pageText = (): string => (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();
  const options = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('button.acceso-option')) as HTMLButtonElement[];
  const query = <T extends HTMLElement>(selector: string): T | null =>
    fixture.nativeElement.querySelector(selector) as T | null;

  const openLogin = (): void => {
    query('.acceso-continue')?.click();
    fixture.detectChanges();
  };

  const typeInto = (selector: string, value: string): void => {
    const input = query(selector);
    expect(input).not.toBeNull();
    input?.dispatchEvent(new CustomEvent('ionInput', { detail: { value }, bubbles: true }));
  };

  const submitLogin = async (username: string, password: string): Promise<void> => {
    typeInto('.acceso-login__username', username);
    typeInto('.acceso-login__password', password);
    query('.acceso-login__submit')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    verified = await verifiedTestIdentities();
    signIn.mockReset();
    signOut.mockReset();

    await TestBed.configureTestingModule({
      imports: [AccesoPage],
      providers: [provideRouter([]), { provide: AUTH_FACADE, useValue: authFacade }],
    }).compileComponents();

    session = TestBed.inject(DemoSessionService);
    permissions = TestBed.inject(DemoPermissionsService);
    router = TestBed.inject(Router);

    signIn.mockImplementation(async (credentials, requestedRole) => {
      const account: AuthenticatedAccount = {
        id: `AUTH-${requestedRole}`,
        nombre: credentials.username,
        role: requestedRole,
      };

      session.publishVerifiedIdentity(verified[requestedRole]);

      return account;
    });

    fixture = TestBed.createComponent(AccesoPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the branded header and the required information', () => {
    const header = query('app-feature-intro');

    expect(pageText()).toContain('SENA CROWD INTELLIGENCE');
    expect(pageText()).toContain('Acceso de demostración');
    expect(pageText()).toContain(
      'Selecciona un perfil para explorar las funcionalidades del prototipo SENA CROWD INTELLIGENCE',
    );
    expect(pageText()).toContain('MODO DEMOSTRACIÓN');
    expect(header?.querySelector('ion-icon')?.getAttribute('name')).toBe('key-outline');
  });

  it('should explain that only privileged profiles require verification', () => {
    const content = pageText();

    expect(content).toContain(
      'Aprendiz es público. Administrador e Instructor requieren credenciales verificadas por Supabase Auth.',
    );
    expect(content).not.toContain('contraseña');
    expect(content).not.toContain('correo electrónico');
    expect(content).not.toContain('teléfono');
    expect(query('.acceso-login')).toBeNull();
  });

  it('should expose the three demo profiles with their descriptions and icons', () => {
    const cards = options();
    const icons = cards.map((card) => card.querySelector('ion-icon')?.getAttribute('name'));

    expect(cards).toHaveLength(3);
    expect(cards[0].textContent).toContain('Administrador de demostración');
    expect(cards[0].textContent).toContain('Supervisión general de zonas, alertas y estadísticas simuladas.');
    expect(cards[1].textContent).toContain('Instructor de demostración');
    expect(cards[1].textContent).toContain('Seguimiento de la ocupación, el mapa y las alertas de la sesión.');
    expect(cards[2].textContent).toContain('Aprendiz de demostración');
    expect(cards[2].textContent).toContain('Exploración guiada del monitoreo y del mapa del prototipo.');
    expect(icons).toEqual(['shield-checkmark-outline', 'school-outline', 'book-outline']);
  });

  it('should start on the learner profile without confirmation or continue action', () => {
    expect(session.profileId()).toBe('aprendiz');
    expect(pageText()).toContain('Perfil activo en la sesión');
    expect(pageText()).toContain('Aprendiz de demostración');
    expect(query('.acceso-confirmation')).toBeNull();
    expect(query('.acceso-continue')).toBeNull();
  });

  it('should select the administrator profile, confirm it and allow continuing', () => {
    options()[0].click();
    fixture.detectChanges();

    expect(session.selectedProfileId()).toBe('administrador');
    expect(session.profileId()).toBe('aprendiz');
    expect(session.isAdministrative()).toBe(false);
    expect(permissions.can('admin:access')).toBe(false);
    expect(permissions.can('alarm:control')).toBe(false);
    expect(options()[0].getAttribute('aria-pressed')).toBe('true');
    expect(query('.acceso-confirmation')?.textContent).toContain('Administrador de demostración');
    expect(pageText()).toContain('Perfil seleccionado');
    expect(query('.acceso-current')?.textContent).toContain('Aprendiz de demostración');

    const continueButton = query('.acceso-continue');
    expect(continueButton?.textContent?.trim()).toBe('Continuar al inicio');
    expect(continueButton?.getAttribute('href')).toBeNull();
  });

  it('should select the instructor as pending and the learner directly', () => {
    options()[1].click();
    fixture.detectChanges();
    expect(session.selectedProfileId()).toBe('instructor');
    expect(session.profileId()).toBe('aprendiz');
    expect(session.isAdministrative()).toBe(false);
    expect(pageText()).toContain('Instructor de demostración');
    expect(query('.acceso-login')).toBeNull();

    options()[2].click();
    fixture.detectChanges();
    expect(session.selectedProfileId()).toBe('aprendiz');
    expect(session.profileId()).toBe('aprendiz');
    expect(session.isActive()).toBe(false);
    expect(query('.acceso-confirmation')?.textContent).toContain('Aprendiz de demostración');
    expect(query('.acceso-login')).toBeNull();
  });

  it('should keep the back link to the dashboard', () => {
    const backLink = query<HTMLAnchorElement>('.acceso-back');

    expect(backLink?.getAttribute('href')).toBe('/tabs/inicio');
  });

  it('should show the login form only after continuing with a privileged profile', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    options()[0].click();
    fixture.detectChanges();
    expect(query('.acceso-login')).toBeNull();

    openLogin();

    expect(query('.acceso-login')).not.toBeNull();
    expect(query('.acceso-options')).toBeNull();
    expect(query('.acceso-continue')).toBeNull();
    expect(query('#acceso-login-title')?.textContent?.trim()).toBe('Administrador de demostración');
    expect(pageText()).toContain('Inicio de sesión');
    expect(pageText()).toContain('Acceso verificado');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('should authenticate the administrator through the form and navigate to Inicio', async () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    options()[0].click();
    fixture.detectChanges();
    openLogin();
    await submitLogin('admin_demo', 'Admin1234!');

    expect(signIn).toHaveBeenCalledWith({ username: 'admin_demo', password: 'Admin1234!' }, 'administrador');
    expect(session.profileId()).toBe('administrador');
    expect(permissions.can('admin:access')).toBe(true);
    expect(query('.acceso-login__error')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/tabs/inicio']);
  });

  it('should authenticate the instructor through the form and grant only alarm control', async () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    options()[1].click();
    fixture.detectChanges();
    openLogin();
    await submitLogin('instructor_demo', 'Instructor1234!');

    expect(signIn).toHaveBeenCalledWith({ username: 'instructor_demo', password: 'Instructor1234!' }, 'instructor');
    expect(session.profileId()).toBe('instructor');
    expect(permissions.can('alarm:control')).toBe(true);
    expect(permissions.can('admin:access')).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/tabs/inicio']);
  });

  it('should reject incorrect credentials and stay on the form without privileges', async () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    signIn.mockRejectedValueOnce(new Error(SUPABASE_LOGIN_ERROR));

    options()[0].click();
    fixture.detectChanges();
    openLogin();
    await submitLogin('admin_demo', 'contraseña-mala');

    expect(query('.acceso-login')).not.toBeNull();
    expect(query('.acceso-login__error')?.textContent).toContain(SUPABASE_LOGIN_ERROR);
    expect(session.profileId()).toBe('aprendiz');
    expect(permissions.can('alarm:control')).toBe(false);
    expect(permissions.can('admin:access')).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('should not activate a privileged profile with credentials of the other profile', async () => {
    signIn.mockRejectedValueOnce(new Error(SUPABASE_LOGIN_ERROR));

    options()[0].click();
    fixture.detectChanges();
    openLogin();
    await submitLogin('instructor_demo', 'Instructor1234!');

    expect(signIn).toHaveBeenCalledWith({ username: 'instructor_demo', password: 'Instructor1234!' }, 'administrador');
    expect(query('.acceso-login__error')).not.toBeNull();
    expect(session.profileId()).toBe('aprendiz');
    expect(permissions.can('admin:access')).toBe(false);
    expect(permissions.can('alarm:control')).toBe(false);
  });

  it('should not fall back to demo credentials when Supabase rejects the login', async () => {
    const demoAuthenticate = vi.spyOn(DemoAuthService.prototype, 'authenticate');
    signIn.mockRejectedValueOnce(new Error(SUPABASE_LOGIN_ERROR));

    options()[0].click();
    fixture.detectChanges();
    openLogin();
    await submitLogin('admin_demo', 'Admin1234!');

    expect(signIn).toHaveBeenCalledTimes(1);
    expect(demoAuthenticate).not.toHaveBeenCalled();
    expect(query('.acceso-login__error')?.textContent).toContain(SUPABASE_LOGIN_ERROR);
    expect(session.profileId()).toBe('aprendiz');
    expect(permissions.can('admin:access')).toBe(false);
    demoAuthenticate.mockRestore();
  });

  it('should block duplicate login submissions while a request is in progress', async () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    let resolveLogin: (account: AuthenticatedAccount) => void = () => undefined;

    signIn.mockImplementationOnce(
      () =>
        new Promise<AuthenticatedAccount>((resolve) => {
          resolveLogin = resolve;
        }),
    );

    options()[0].click();
    fixture.detectChanges();
    openLogin();
    typeInto('.acceso-login__username', 'admin_demo');
    typeInto('.acceso-login__password', 'Admin1234!');

    const submit = query<HTMLButtonElement>('.acceso-login__submit');
    submit?.click();
    submit?.click();
    fixture.detectChanges();

    expect(signIn).toHaveBeenCalledTimes(1);
    expect(component.isSubmitting()).toBe(true);
    expect(submit?.disabled).toBe(true);
    expect(navigate).not.toHaveBeenCalled();

    resolveLogin({ id: 'AUTH-administrador', nombre: 'admin_demo', role: 'administrador' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.isSubmitting()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/tabs/inicio']);
  });

  it('should allow direct access for Aprendiz without showing the form', async () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    options()[2].click();
    fixture.detectChanges();
    query('.acceso-continue')?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(session.profileId()).toBe('aprendiz');
    expect(signIn).not.toHaveBeenCalled();
    expect(query('.acceso-login')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/tabs/inicio']);
  });

  it('should return to the selector with Volver without authenticating', () => {
    options()[0].click();
    fixture.detectChanges();
    openLogin();

    query('.acceso-login__back')?.click();
    fixture.detectChanges();

    expect(query('.acceso-login')).toBeNull();
    expect(query('.acceso-options')).not.toBeNull();
    expect(query('.acceso-confirmation')).toBeNull();
    expect(session.selectedProfileId()).toBe('aprendiz');
    expect(session.profileId()).toBe('aprendiz');
    expect(permissions.can('admin:access')).toBe(false);
    expect(signIn).not.toHaveBeenCalled();
    // Volver en el formulario no es un cierre de sesión.
    expect(signOut).not.toHaveBeenCalled();
  });

  it('should keep the password hidden and never render the test passwords', () => {
    options()[0].click();
    fixture.detectChanges();
    openLogin();

    const usernameInput = query('ion-input.acceso-login__username');
    const passwordInput = query('ion-input.acceso-login__password');
    expect(passwordInput?.getAttribute('type')).toBe('password');
    expect(usernameInput?.getAttribute('aria-label')).toBe('Nombre de usuario');
    expect(passwordInput?.getAttribute('aria-label')).toBe('Contraseña');
    expect(pageText()).not.toContain('Admin1234!');
    expect(pageText()).not.toContain('Instructor1234!');

    for (const credential of DEMO_CREDENTIALS) {
      expect(pageText()).not.toContain(credential.password);
    }
  });
});
