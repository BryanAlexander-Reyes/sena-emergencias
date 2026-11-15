import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { MasPage } from './mas.page';

describe('MasPage', () => {
  let component: MasPage;
  let fixture: ComponentFixture<MasPage>;

  const pageText = (): string => (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MasPage],
      providers: [provideRouter([])],
    }).compileComponents();

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

  it('should render the footer', () => {
    const content = pageText();

    expect(content).toContain('Fase 2.7 · Menú Más');
    expect(content).toContain('v0.7');
  });
});
