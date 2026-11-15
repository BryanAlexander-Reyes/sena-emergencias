import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SensoresPage } from './sensores.page';

describe('SensoresPage', () => {
  let component: SensoresPage;
  let fixture: ComponentFixture<SensoresPage>;

  const pageText = (): string => (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SensoresPage],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SensoresPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the header and the disconnected status', () => {
    const content = pageText();

    expect(content).toContain('Sensores IoT');
    expect(content).toContain('Monitoreo de dispositivos');
    expect(content).toContain('Dispositivos no conectados');
    expect(content).toContain('Sin conexión');
    expect(content).toContain('No hay comunicación con hardware real');
  });

  it('should render the ESP32 information card', () => {
    const content = pageText();

    expect(content).toContain('ESP32');
    expect(content).toContain('Controlador previsto');
    expect(content).toContain('No conectado');
    expect(content).toContain('En esta demostración no hay dispositivos ni lecturas reales');
  });

  it('should list the five planned sensor types', () => {
    const items = Array.from(fixture.nativeElement.querySelectorAll('.sensor-list__item')) as HTMLElement[];
    const texts = items.map((item) => (item.textContent ?? '').replace(/\s+/g, ' ').trim());

    expect(component.sensors).toHaveLength(5);
    expect(items).toHaveLength(5);
    expect(texts[0]).toContain('Infrarrojos IR');
    expect(texts[1]).toContain('Ultrasónicos');
    expect(texts[2]).toContain('PIR');
    expect(texts[3]).toContain('Matrices LED');
    expect(texts[4]).toContain('Servomotores');
    expect(texts.every((text) => text.includes('Previsto'))).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('app-metric-card')).toHaveLength(0);
  });

  it('should explain that readings and hardware communication are not implemented', () => {
    const content = pageText();

    expect(content).toContain('No se muestran lecturas ni se establece comunicación con dispositivos');
  });

  it('should link back to the Más menu', () => {
    const back = fixture.nativeElement.querySelector('a.secondary-page__back') as HTMLAnchorElement;

    expect(back.getAttribute('href')).toBe('/tabs/mas');
    expect(back.textContent).toContain('Volver a Más');
  });
});
