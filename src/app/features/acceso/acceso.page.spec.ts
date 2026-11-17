import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { DemoSessionService } from '../../core/auth/demo-session.service';

import { AccesoPage } from './acceso.page';

describe('AccesoPage', () => {
  let component: AccesoPage;
  let fixture: ComponentFixture<AccesoPage>;
  let session: DemoSessionService;

  const pageText = (): string => (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();
  const options = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('button.acceso-option')) as HTMLButtonElement[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccesoPage],
      providers: [provideRouter([])],
    }).compileComponents();

    session = TestBed.inject(DemoSessionService);
    fixture = TestBed.createComponent(AccesoPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the branded header and the required information', () => {
    const header = fixture.nativeElement.querySelector('app-feature-intro') as HTMLElement;

    expect(pageText()).toContain('SENA CROWD INTELLIGENCE');
    expect(pageText()).toContain('Acceso de demostración');
    expect(pageText()).toContain(
      'Selecciona un perfil para explorar las funcionalidades del prototipo SENA CROWD INTELLIGENCE',
    );
    expect(pageText()).toContain('MODO DEMOSTRACIÓN');
    expect(header.querySelector('ion-icon')?.getAttribute('name')).toBe('key-outline');
  });

  it('should display the simulation warning without asking for personal data', () => {
    const content = pageText();

    expect(content).toContain(
      'Este acceso simula perfiles y permisos. No verifica identidades ni se conecta a un servidor',
    );
    expect(content).not.toContain('contraseña');
    expect(content).not.toContain('correo electrónico');
    expect(content).not.toContain('teléfono');
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
    expect(fixture.nativeElement.querySelector('.acceso-confirmation')).toBeNull();
    expect(fixture.nativeElement.querySelector('.acceso-continue')).toBeNull();
  });

  it('should select the administrator profile, confirm it and allow continuing', () => {
    options()[0].click();
    fixture.detectChanges();

    expect(session.profileId()).toBe('administrador');
    expect(session.isAdministrative()).toBe(true);
    expect(options()[0].getAttribute('aria-pressed')).toBe('true');
    expect(fixture.nativeElement.querySelector('.acceso-confirmation')?.textContent).toContain(
      'Administrador de demostración',
    );
    expect(pageText()).toContain('Perfil seleccionado');

    const continueLink = fixture.nativeElement.querySelector('.acceso-continue') as HTMLElement;
    expect(continueLink.getAttribute('href')).toBe('/tabs/inicio');
  });

  it('should select the instructor and learner profiles and return to visitor', () => {
    options()[1].click();
    fixture.detectChanges();
    expect(session.profileId()).toBe('instructor');
    expect(session.isAdministrative()).toBe(false);
    expect(pageText()).toContain('Instructor de demostración');

    options()[2].click();
    fixture.detectChanges();
    expect(session.profileId()).toBe('aprendiz');
    expect(pageText()).toContain('Aprendiz de demostración');

    options()[3].click();
    fixture.detectChanges();
    expect(session.profileId()).toBe('visitante');
    expect(session.isActive()).toBe(false);
    expect(fixture.nativeElement.querySelector('.acceso-confirmation')?.textContent).toContain('Visitante');
  });

  it('should keep the back link to the dashboard', () => {
    const backLink = fixture.nativeElement.querySelector('.acceso-back') as HTMLAnchorElement;

    expect(backLink.getAttribute('href')).toBe('/tabs/inicio');
  });
});
