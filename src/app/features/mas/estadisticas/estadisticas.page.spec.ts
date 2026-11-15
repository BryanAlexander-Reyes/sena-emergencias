import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { countPeople, DEMO_ZONES, getZoneOccupancy } from '../../../core/data/demo-monitoring';
import { MonitoringStateService } from '../../../core/services/monitoring-state.service';

import { EstadisticasPage } from './estadisticas.page';

describe('EstadisticasPage', () => {
  let component: EstadisticasPage;
  let fixture: ComponentFixture<EstadisticasPage>;

  const pageText = (): string => (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EstadisticasPage],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(EstadisticasPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should derive every indicator from the centralized monitoring state', () => {
    const monitoring = TestBed.inject(MonitoringStateService);

    expect(component.zones()).toBe(DEMO_ZONES);
    expect(component.totalPeople()).toBe(countPeople(DEMO_ZONES));
    expect(component.totalPeople()).toBe(107);
    expect(component.totalPeople()).toBe(monitoring.totalPeople());
    expect(component.monitoredZones()).toBe(4);
    expect(component.monitoredZones()).toBe(monitoring.monitoredZones());
    expect(component.averageOccupancy()).toBe(49);
    expect(component.busiestZone()?.zone.name).toBe('Pasillo principal');
    expect(component.busiestOccupancy()).toBe(Math.max(...DEMO_ZONES.map((zone) => getZoneOccupancy(zone))));
    expect(component.busiestOccupancy()).toBe(84);
  });

  it('should render four metric cards with the computed indicators', () => {
    const cards = Array.from(fixture.nativeElement.querySelectorAll('app-metric-card')) as HTMLElement[];
    const texts = cards.map((card) => (card.textContent ?? '').replace(/\s+/g, ' ').trim());

    expect(cards).toHaveLength(4);
    expect(texts[0]).toContain('Personas estimadas');
    expect(texts[0]).toContain('107');
    expect(texts[1]).toContain('Zonas monitoreadas');
    expect(texts[1]).toContain('4');
    expect(texts[2]).toContain('Ocupación promedio');
    expect(texts[2]).toContain('49%');
    expect(texts[3]).toContain('Mayor ocupación');
    expect(texts[3]).toContain('84%');
    expect(texts[3]).toContain('Pasillo principal');
  });

  it('should render the header, demo badge and future charts placeholder', () => {
    const content = pageText();

    expect(content).toContain('Estadísticas');
    expect(content).toContain('Análisis de ocupación');
    expect(content).toContain('DATOS DE DEMOSTRACIÓN');
    expect(content).toContain('Gráficos de ocupación');
    expect(content).toContain('Sin historial en la demostración');
    expect(content).toContain('Gráficos aún no implementados');
    expect(content).toContain('No representan mediciones reales ni series históricas');
    expect(fixture.nativeElement.querySelector('canvas')).toBeNull();
  });

  it('should link back to the Más menu', () => {
    const back = fixture.nativeElement.querySelector('a.secondary-page__back') as HTMLAnchorElement;

    expect(back.getAttribute('href')).toBe('/tabs/mas');
    expect(back.textContent).toContain('Volver a Más');
  });
});
