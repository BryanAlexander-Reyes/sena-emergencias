import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { ADMIN_ACCESS_DENIED_PARAM, ADMIN_ACCESS_DENIED_VALUE } from '../../core/auth/admin-access.guard';
import { DemoSessionService } from '../../core/auth/demo-session.service';

import { MasPage } from './mas.page';

describe('MasPage', () => {
  let component: MasPage;
  let fixture: ComponentFixture<MasPage>;
  let session: DemoSessionService;

  const pageText = (): string => (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MasPage],
      providers: [provideRouter([])],
    }).compileComponents();

    session = TestBed.inject(DemoSessionService);
    fixture = TestBed.createComponent(MasPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the branded header and the demo indicators', () => {
    const content = pageText();
    const header = fixture.nativeElement.querySelector('app-feature-intro') as HTMLElement;

    expect(content).toContain('SENA CROWD INTELLIGENCE');
    expect(content).toContain('Más opciones');
    expect(content).toContain('Herramientas y configuración del sistema');
    expect(content).toContain('MODO DEMOSTRACIÓN');
    expect(header.querySelector('ion-icon')?.getAttribute('name')).toBe('apps-outline');
  });

  it('should render the demo system information card', () => {
    const content = pageText();

    expect(content).toContain('Sistema de demostración');
    expect(content).toContain('Los datos mostrados son simulados. No hay conexión con dispositivos IoT.');
  });

  it('should expose the five menu destinations with their descriptions', () => {
    const cards = Array.from(fixture.nativeElement.querySelectorAll('app-nav-card')) as HTMLElement[];
    const texts = cards.map((card) => (card.textContent ?? '').replace(/\s+/g, ' ').trim());

    expect(cards).toHaveLength(5);
    expect(texts[0]).toContain('Zona segura');
    expect(texts[0]).toContain('Punto de encuentro y ocupación');
    expect(texts[1]).toContain('Estadísticas');
    expect(texts[1]).toContain('Gráficos y tendencias de ocupación');
    expect(texts[2]).toContain('Sensores IoT');
    expect(texts[2]).toContain('Dispositivos y lecturas simuladas');
    expect(texts[3]).toContain('Asistente IA');
    expect(texts[3]).toContain('Consultas sobre el monitoreo');
    expect(texts[4]).toContain('Configuración');
    expect(texts[4]).toContain('Preferencias e información');
  });

  it('should link every card to its secondary route', () => {
    const links = Array.from(fixture.nativeElement.querySelectorAll('app-nav-card a')) as HTMLAnchorElement[];

    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/tabs/mas/zona-segura',
      '/tabs/mas/estadisticas',
      '/tabs/mas/sensores',
      '/tabs/mas/asistente',
      '/tabs/mas/configuracion',
    ]);
  });

  it('should apply the configured accent and icon to every card', () => {
    const cards = Array.from(fixture.nativeElement.querySelectorAll('app-nav-card')) as HTMLElement[];
    const accents = cards.map((card) =>
      Array.from(card.classList).find((className) => className.startsWith('nav-card-host--')),
    );
    const icons = cards.map((card) => card.querySelector('.nav-card__icon ion-icon')?.getAttribute('name'));

    expect(accents).toEqual([
      'nav-card-host--green',
      'nav-card-host--cyan',
      'nav-card-host--blue',
      'nav-card-host--violet',
      'nav-card-host--gray',
    ]);
    expect(icons).toEqual([
      'shield-checkmark-outline',
      'stats-chart-outline',
      'hardware-chip-outline',
      'chatbubbles-outline',
      'settings-outline',
    ]);
  });

  it('should show the visitor profile and the demo mode indicator by default', () => {
    const section = fixture.nativeElement.querySelector('.mas-profile') as HTMLElement;
    const changeLink = section.querySelector('.mas-profile__action') as HTMLAnchorElement;

    expect(section.textContent).toContain('Perfil de demostración');
    expect(section.textContent).toContain('Modo demostración');
    expect(section.textContent).toContain('Perfil activo');
    expect(section.querySelector('.mas-profile__value')?.textContent).toContain('Visitante');
    expect(section.textContent).toContain('Cambiar perfil');
    expect(changeLink.getAttribute('href')).toBe('/acceso');
    expect(section.textContent).not.toContain('Salir del perfil');
  });

  it('should render the active profile and allow leaving it', () => {
    session.selectProfile('instructor');
    fixture.detectChanges();

    const section = fixture.nativeElement.querySelector('.mas-profile') as HTMLElement;
    expect(section.querySelector('.mas-profile__value')?.textContent).toContain('Instructor de demostración');
    const profileIcon = section.querySelector('.mas-profile__icon ion-icon') as unknown as { name: string };
    expect(profileIcon.name).toBe('school-outline');
    expect(section.textContent).toContain('Salir del perfil');

    const exitButton = Array.from(section.querySelectorAll('ion-button')).find((button) =>
      (button.textContent ?? '').includes('Salir del perfil'),
    ) as HTMLElement;
    exitButton.click();
    fixture.detectChanges();

    expect(session.profileId()).toBe('visitante');
    expect(section.querySelector('.mas-profile__value')?.textContent).toContain('Visitante');
    expect(section.textContent).not.toContain('Salir del perfil');
  });

  it('should expose the admin card only to the administrator profile', () => {
    const links = (): (string | null)[] =>
      Array.from(fixture.nativeElement.querySelectorAll('app-nav-card a')).map((link) =>
        (link as HTMLAnchorElement).getAttribute('href'),
      );

    expect(component.menu()).toHaveLength(5);
    expect(links()).not.toContain('/tabs/mas/administracion');

    session.selectProfile('administrador');
    fixture.detectChanges();

    expect(component.menu()).toHaveLength(6);
    expect(pageText()).toContain('Administración');
    expect(pageText()).toContain('Usuarios y roles ficticios');
    expect(links().at(-1)).toBe('/tabs/mas/administracion');

    session.selectProfile('visitante');
    fixture.detectChanges();

    expect(component.menu()).toHaveLength(5);
    expect(links()).not.toContain('/tabs/mas/administracion');
  });

  it('should keep the demo access and profile actions available for every profile', () => {
    const section = fixture.nativeElement.querySelector('.mas-profile') as HTMLElement;
    const changeLink = section.querySelector('.mas-profile__action') as HTMLAnchorElement;

    expect(changeLink.getAttribute('href')).toBe('/acceso');
    expect(section.textContent).toContain('Cambiar perfil');

    session.selectProfile('administrador');
    fixture.detectChanges();

    expect(section.textContent).toContain('Salir del perfil');
  });

  it('should render the footer', () => {
    const content = pageText();

    expect(content).toContain('Fase 2.7 · Menú Más');
    expect(content).toContain('v0.7');
  });
});

describe('MasPage acceso denegado', () => {
  let fixture: ComponentFixture<MasPage>;
  let session: DemoSessionService;

  const pageText = (): string => (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MasPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({ [ADMIN_ACCESS_DENIED_PARAM]: ADMIN_ACCESS_DENIED_VALUE }),
            },
          },
        },
      ],
    }).compileComponents();

    session = TestBed.inject(DemoSessionService);
    fixture = TestBed.createComponent(MasPage);
    fixture.detectChanges();
  });

  it('should show an understandable message after a denied admin navigation', () => {
    const banner = fixture.nativeElement.querySelector('.mas-denied') as HTMLElement;

    expect(banner).toBeTruthy();
    expect(banner.getAttribute('role')).toBe('alert');
    expect(pageText()).toContain('Acceso no disponible');
    expect(pageText()).toContain('perfil Administrador de demostración');
  });

  it('should hide the denial notice when the administrator profile is selected', () => {
    expect(fixture.nativeElement.querySelector('.mas-denied')).toBeTruthy();

    session.selectProfile('administrador');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.mas-denied')).toBeNull();
    expect(pageText()).toContain('Administración');
  });

  it('should keep the existing demo options visible after the denial', () => {
    const links = Array.from(fixture.nativeElement.querySelectorAll('app-nav-card a')).map((link) =>
      (link as HTMLAnchorElement).getAttribute('href'),
    );

    expect(links).toHaveLength(5);
    expect(links).toContain('/tabs/mas/configuracion');
    expect(links).not.toContain('/tabs/mas/administracion');
  });
});
