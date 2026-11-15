import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ConfiguracionPage } from './configuracion.page';

describe('ConfiguracionPage', () => {
  let component: ConfiguracionPage;
  let fixture: ComponentFixture<ConfiguracionPage>;

  const pageText = (): string => (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfiguracionPage],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfiguracionPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the configuration header and application information', () => {
    const content = pageText();

    expect(content).toContain('Configuración');
    expect(content).toContain('Preferencias del sistema');
    expect(content).toContain('SENA CROWD INTELLIGENCE');
    expect(content).toContain('Versión de demostración 0.7');
  });

  it('should show the dark theme and disconnected IoT status', () => {
    const content = pageText();

    expect(content).toContain('Oscuro activo');
    expect(content).toContain('Sin conexión IoT');
    expect(content).toContain('Activo');
    expect(content).toContain('Inactiva');
  });

  it('should render the project information section', () => {
    const content = pageText();

    expect(content).toContain('Información del proyecto');
    expect(content).toContain('Prototipo académico del SENA');
    expect(content).toContain('Institución');
    expect(content).toContain('Datos');
    expect(content).toContain('Simulados');
    expect(content).toContain('2.7 · Menú Más');
    expect(content).toContain('Demostración');
    expect(content).toContain('no incluye autenticación, servidores ni persistencia de preferencias');
  });

  it('should link back to the Más menu', () => {
    const back = fixture.nativeElement.querySelector('a.secondary-page__back') as HTMLAnchorElement;

    expect(back.getAttribute('href')).toBe('/tabs/mas');
    expect(back.textContent).toContain('Volver a Más');
  });
});
