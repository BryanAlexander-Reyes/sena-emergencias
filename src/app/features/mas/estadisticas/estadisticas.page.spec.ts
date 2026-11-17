import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AlertsStateService } from '../../../core/services/alerts-state.service';
import { MonitoringStateService } from '../../../core/services/monitoring-state.service';

import { EstadisticasPage } from './estadisticas.page';

describe('EstadisticasPage (Fase 3.5)', () => {
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

  it('should show initial session stats with empty history', () => {
    expect(component.totalPeople()).toBe(107);
    expect(component.monitoredZones()).toBe(4);
    expect(component.changeCount()).toBe(0);
    expect(component.maxTotalObserved()).toBe(107);
    expect(component.isEmpty()).toBe(true);

    const content = pageText();
    expect(content).toContain('Ocupación total actual');
    expect(content).toContain('107');
    expect(content).toContain('Zonas monitoreadas');
    expect(content).toContain('4');
    expect(content).toContain('Cambios registrados');
    expect(content).toContain('0');
    expect(content).toContain('Máximo total en sesión');
    expect(content).toContain('Alertas activas actuales');
    expect(content).toContain('Aún no hay cambios registrados en esta sesión');
  });

  it('should read active alerts from AlertsStateService', () => {
    const alerts = TestBed.inject(AlertsStateService);
    expect(component.activeAlerts()).toBe(alerts.activeAlerts());
    expect(component.activeAlerts()).toBe(1);
  });

  it('should render session metrics, zone stats and svg evolution chart', () => {
    const cards = Array.from(fixture.nativeElement.querySelectorAll('app-metric-card')) as HTMLElement[];
    const zones = Array.from(fixture.nativeElement.querySelectorAll('.stats-zone')) as HTMLElement[];

    expect(cards.length).toBe(5);
    expect(zones.length).toBe(4);
    expect(fixture.nativeElement.querySelector('.stats-chart__svg')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('canvas')).toBeNull();
    expect(pageText()).toContain('Total de personas');
    expect(pageText()).toContain('Cafetería');
  });

  it('should record confirmed occupancy changes and update reactive stats', () => {
    const monitoring = TestBed.inject(MonitoringStateService);
    TestBed.inject(AlertsStateService);

    expect(monitoring.incrementOccupancy('cafeteria')).toBe(true);
    TestBed.flushEffects();
    fixture.detectChanges();

    expect(component.totalPeople()).toBe(108);
    expect(component.changeCount()).toBe(1);
    expect(component.maxTotalObserved()).toBe(108);
    expect(component.isEmpty()).toBe(false);
    expect(pageText()).toContain('Cafetería');
    expect(pageText()).toContain('35 → 36 personas (+1)');

    expect(monitoring.decrementOccupancy('cafeteria')).toBe(true);
    TestBed.flushEffects();
    fixture.detectChanges();

    expect(component.totalPeople()).toBe(107);
    expect(component.changeCount()).toBe(2);
    expect(component.maxTotalObserved()).toBe(108);
  });

  it('should not create events for invalid actions and keep per-zone maxima', () => {
    const monitoring = TestBed.inject(MonitoringStateService);

    expect(monitoring.decrementOccupancy('zona-segura')).toBe(true); // 12 -> 11
    TestBed.flushEffects();
    fixture.detectChanges();
    expect(monitoring.decrementOccupancy('zona-segura')).toBe(true); // ... down to 0 eventually not needed, but test invalid
    // try invalid when at 0
    while (monitoring.canDecrement('zona-segura')) {
      monitoring.decrementOccupancy('zona-segura');
      TestBed.flushEffects();
    }
    const before = component.changeCount();
    expect(monitoring.decrementOccupancy('zona-segura')).toBe(false);
    TestBed.flushEffects();
    fixture.detectChanges();
    expect(component.changeCount()).toBe(before);

    const cafeRow = component.zoneRows().find((z) => z.id === 'cafeteria');
    expect(cafeRow?.maxPeopleObserved).toBe(35);
    expect(cafeRow?.changeCount).toBe(0);
  });

  it('should record only changed zones on reset operations', () => {
    const monitoring = TestBed.inject(MonitoringStateService);

    expect(monitoring.resetZoneOccupancy('cafeteria')).toBe(false); // already initial
    TestBed.flushEffects();
    fixture.detectChanges();
    expect(component.changeCount()).toBe(0);

    expect(monitoring.incrementOccupancy('cafeteria')).toBe(true);
    expect(monitoring.incrementOccupancy('biblioteca')).toBe(true);
    TestBed.flushEffects();
    fixture.detectChanges();
    expect(component.changeCount()).toBe(2);

    expect(monitoring.resetAllOccupancy()).toBe(true);
    TestBed.flushEffects();
    fixture.detectChanges();

    expect(component.totalPeople()).toBe(107);
    expect(component.changeCount()).toBe(4); // 2 changes + 2 reset events
  });

  it('should link back to Más and keep demo/session note', () => {
    const back = fixture.nativeElement.querySelector('a.secondary-page__back') as HTMLAnchorElement;
    const content = pageText();

    expect(back.getAttribute('href')).toBe('/tabs/mas');
    expect(content).toContain('DATOS DE DEMOSTRACIÓN');
    expect(content).toContain('sesión actual');
  });
});
