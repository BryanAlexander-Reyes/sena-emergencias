import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { DEMO_CREDENTIALS } from '../../core/auth/demo-credentials';
import { DemoPermissionsService } from '../../core/auth/demo-permissions.service';
import { DemoSessionService } from '../../core/auth/demo-session.service';

import { AccesoPage } from './acceso.page';

describe('AccesoPage', () => {
  let component: AccesoPage;
  let fixture: ComponentFixture<AccesoPage>;
  let session: DemoSessionService;
  let permissions: DemoPermissionsService;
  let router: Router;

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

  const submitLogin = (username: string, password: string): void => {
    typeInto('.acceso-login__username', username);
    typeInto('.acceso-login__password', password);
    query('.acceso-login__submit')?.click();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccesoPage],
      providers: [provideRouter([])],
    }).compileComponents();

    session = TestBed.inject(DemoSessionService);
    permissions = TestBed.inject(DemoPermissionsService);
    router = TestBed.inject(Router);
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

  it('should display the simulation warning without asking for personal data', () => {
    const content = pageText();

    expect(content).toContain(
      'Este acceso simula perfiles y permisos. No verifica identidades ni se conecta a un servidor',
    );
    expect(content).not.toContain('contraseña');
    expect(content).not.toContain('correo electrónico');
    expect(content).not.toContain('teléfono');
    expect(query('.acceso-login')).toBeNull();
  });

  it('should expose the four demo profiles with their descriptions and icons', () => {
    const cards = options();
    const icons = cards.map((card) => card.querySelector('ion-icon')?.getAttribute('name'));

    expect(cards).toHaveLength(4);
    expect(cards[0].textContent).toContain('Administrador de demostración');
    expect(cards[0].textContent).toContain('Supervisión general de zonas, alertas y estadísticas simuladas.');
    expect(cards[1].textContent).toContain('Instructor de demostración');
    expect(cards[1].textContent).toContain('Seguimiento de la ocupación, el mapa y las alertas de la sesión.');
    expect(cards[2].textContent).toContain('Aprendiz de demostración');
    expect(cards[2].textContent).toContain('Exploración guiada del monitoreo y del mapa del prototipo.');
    expect(cards[3].textContent).toContain('Visitante');
    expect(cards[3].textContent).toContain('Consulta libre de la información general del prototipo.');
    expect(icons).toEqual(['shield-checkmark-outline', 'school-outline', 'book-outline', 'person-outline']);
  });

  it('should start on the visitor profile without confirmation or continue action', () => {
    expect(session.profileId()).toBe('visitante');
    expect(pageText()).toContain('Perfil activo en la sesión');
    expect(pageText()).toContain('Visitante');
    expect(query('.acceso-confirmation')).toBeNull();
    expect(query('.acceso-continue')).toBeNull();
  });

  it('should select the administrator profile, confirm it and allow continuing', () => {
    options()[0].click();
    fixture.detectChanges();

    expect(session.selectedProfileId()).toBe('administrador');
    expect(session.profileId()).toBe('visitante');
    expect(session.isAdministrative()).toBe(false);
    expect(permissions.can('admin:access')).toBe(false);
    expect(permissions.can('alarm:control')).toBe(false);
    expect(options()[0].getAttribute('aria-pressed')).toBe('true');
    expect(query('.acceso-confirmation')?.textContent).toContain('Administrador de demostración');
    expect(pageText()).toContain('Perfil seleccionado');
    expect(query('.acceso-current')?.textContent).toContain('Visitante');

    const continueButton = query('.acceso-continue');
    expect(continueButton?.textContent?.trim()).toBe('Continuar al inicio');
    expect(continueButton?.getAttribute('href')).toBeNull();
  });

  it('should select the instructor and learner profiles and return to visitor', () => {
    options()[1].click();
    fixture.detectChanges();
    expect(session.selectedProfileId()).toBe('instructor');
    expect(session.profileId()).toBe('visitante');
    expect(session.isAdministrative()).toBe(false);
    expect(pageText()).toContain('Instructor de demostración');

    options()[2].click();
    fixture.detectChanges();
    expect(session.profileId()).toBe('aprendiz');
    expect(pageText()).toContain('Aprendiz de demostración');
    expect(query('.acceso-login')).toBeNull();

    options()[3].click();
    fixture.detectChanges();
    expect(session.profileId()).toBe('visitante');
    expect(session.isActive()).toBe(false);
    expect(query('.acceso-confirmation')?.textContent).toContain('Visitante');
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
    expect(pageText()).toContain('Inicio de sesión simulado');
    expect(pageText()).toContain('Modo demostración');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('should authenticate the administrator through the form and navigate to Inicio', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    options()[0].click();
    fixture.detectChanges();
    openLogin();
    submitLogin('admin_demo', 'Admin1234!');

    expect(session.profileId()).toBe('administrador');
    expect(permissions.can('admin:access')).toBe(true);
    expect(query('.acceso-login__error')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/tabs/inicio']);
  });

  it('should authenticate the instructor through the form and grant only alarm control', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    options()[1].click();
    fixture.detectChanges();
    openLogin();
    submitLogin('instructor_demo', 'Instructor1234!');

    expect(session.profileId()).toBe('instructor');
    expect(permissions.can('alarm:control')).toBe(true);
    expect(permissions.can('admin:access')).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/tabs/inicio']);
  });

  it('should reject incorrect credentials and stay on the form without privileges', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    options()[0].click();
    fixture.detectChanges();
    openLogin();
    submitLogin('admin_demo', 'contraseña-mala');

    expect(query('.acceso-login')).not.toBeNull();
    expect(query('.acceso-login__error')?.textContent).toContain(
      'Credenciales incorrectas. Verifica el perfil seleccionado.',
    );
    expect(session.profileId()).toBe('visitante');
    expect(permissions.can('alarm:control')).toBe(false);
    expect(permissions.can('admin:access')).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('should not activate a privileged profile with credentials of the other profile', () => {
    options()[0].click();
    fixture.detectChanges();
    openLogin();
    submitLogin('instructor_demo', 'Instructor1234!');

    expect(query('.acceso-login__error')).not.toBeNull();
    expect(session.profileId()).toBe('visitante');
    expect(permissions.can('admin:access')).toBe(false);
    expect(permissions.can('alarm:control')).toBe(false);
  });

  it('should allow direct access for Aprendiz and Visitante without showing the form', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    options()[2].click();
    fixture.detectChanges();
    query('.acceso-continue')?.click();
    fixture.detectChanges();

    expect(session.profileId()).toBe('aprendiz');
    expect(query('.acceso-login')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/tabs/inicio']);

    navigate.mockClear();
    options()[3].click();
    fixture.detectChanges();
    query('.acceso-continue')?.click();
    fixture.detectChanges();

    expect(session.profileId()).toBe('visitante');
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
    expect(session.selectedProfileId()).toBe('visitante');
    expect(session.profileId()).toBe('visitante');
    expect(permissions.can('admin:access')).toBe(false);
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
