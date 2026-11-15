import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { countActiveAlerts, getActiveCriticalAlert } from '../../core/data/demo-alerts';
import { DEMO_ZONES } from '../../core/data/demo-monitoring';
import { AlertsStateService } from '../../core/services/alerts-state.service';

import { InicioPage } from './inicio.page';

describe('InicioPage', () => {
  let component: InicioPage;
  let fixture: ComponentFixture<InicioPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InicioPage],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(InicioPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the dashboard header and system status', () => {
    const content = fixture.nativeElement.textContent as string;

    expect(content).toContain('SENA CROWD');
    expect(content).toContain('INTELLIGENCE');
    expect(content).toContain('MODO DEMOSTRACIÓN');
    expect(content).toContain('Panel de monitoreo');
    expect(content).toContain('Estado general del sistema');
    expect(content).toContain('Operativo');
    expect(content).toContain('DATOS SIMULADOS');
  });

  it('should render four coherent metric cards', () => {
    const cards = fixture.nativeElement.querySelectorAll('app-metric-card') as NodeListOf<HTMLElement>;
    const texts = Array.from(cards).map((card) => card.textContent?.replace(/\s+/g, ' ').trim());

    expect(cards.length).toBe(4);
    expect(texts[0]).toContain('Personas estimadas');
    expect(texts[0]).toContain('107');
    expect(texts[1]).toContain('Zonas monitoreadas');
    expect(texts[1]).toContain('4');
    expect(texts[2]).toContain('Alertas activas');
    expect(texts[2]).toContain('1');
    expect(texts[3]).toContain('Zona segura');
    expect(texts[3]).toContain('12');
  });

  it('should compute the total from the shared demo zones', () => {
    const sum = component.zones().reduce((total, zone) => total + zone.people, 0);

    expect(component.zones()).toBe(DEMO_ZONES);
    expect(sum).toBe(107);
    expect(component.totalPeople()).toBe(sum);
    expect(component.monitoredZones()).toBe(4);
    expect(component.activeAlerts()).toBe(1);
    expect(component.safeZonePeople()).toBe(12);
  });

  it('should derive the active alert from the shared alert state', () => {
    const alertsState = TestBed.inject(AlertsStateService);

    expect(component.activeAlert()).toBe(getActiveCriticalAlert());
    expect(component.activeAlert()).toBe(alertsState.activeCriticalAlert());
    expect(component.activeAlerts()).toBe(countActiveAlerts());
    expect(component.activeAlerts()).toBe(alertsState.activeAlerts());
    expect(component.activeAlerts()).toBe(1);
    expect(component.criticalZone()).toBe(DEMO_ZONES.find((zone) => zone.id === component.activeAlert()?.zoneId));
    expect(component.criticalZone()?.name).toBe('Pasillo principal');
    expect(component.activeAlert()?.zoneName).toBe('Pasillo principal');
  });

  it('should render the monitoring summary', () => {
    const content = fixture.nativeElement.textContent as string;

    expect(content).toContain('Resumen de monitoreo');
    expect(content).toContain('Ocupación crítica');
    expect(content).toContain('Pasillo principal');
    expect(content).toContain('Ocupación estimada del 84%.');
    expect(content).toContain('Información de demostración');
    expect(content).toContain('Ver zonas');
  });
});
