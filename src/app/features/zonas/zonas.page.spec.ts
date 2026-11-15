import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { DEMO_ZONES, getZoneOccupancy } from '../../core/data/demo-monitoring';
import { MonitoringStateService } from '../../core/services/monitoring-state.service';

import { ZonasPage } from './zonas.page';

describe('ZonasPage', () => {
  let component: ZonasPage;
  let fixture: ComponentFixture<ZonasPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZonasPage],
    }).compileComponents();

    fixture = TestBed.createComponent(ZonasPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the header and demo indicator', () => {
    const content = fixture.nativeElement.textContent as string;

    expect(content).toContain('Monitoreo de zonas');
    expect(content).toContain('Supervisa la ocupación estimada de cada área');
    expect(content).toContain('MODO DEMOSTRACIÓN');
  });

  it('should read the totals from the centralized monitoring state', () => {
    const monitoring = TestBed.inject(MonitoringStateService);

    expect(component.zones()).toBe(DEMO_ZONES);
    expect(component.zones()).toBe(monitoring.zones());
    expect(component.totalPeople()).toBe(107);
    expect(component.totalPeople()).toBe(monitoring.totalPeople());
    expect(component.totalZones()).toBe(4);
    expect(component.totalZones()).toBe(monitoring.monitoredZones());
  });

  it('should render four zone cards with the derived percentages and statuses', () => {
    const cards = fixture.nativeElement.querySelectorAll('app-zone-card') as NodeListOf<HTMLElement>;
    const texts = Array.from(cards).map((card) => card.textContent?.replace(/\s+/g, ' ').trim() ?? '');

    expect(cards.length).toBe(4);
    expect(DEMO_ZONES.map((zone) => getZoneOccupancy(zone))).toEqual([70, 30, 84, 12]);
    expect(texts[0]).toContain('70%');
    expect(texts[0]).toContain('Precaución');
    expect(texts[1]).toContain('30%');
    expect(texts[1]).toContain('Normal');
    expect(texts[2]).toContain('84%');
    expect(texts[2]).toContain('Crítico');
    expect(texts[3]).toContain('12%');
    expect(texts[3]).toContain('Normal');
  });

  it('should state that the thresholds are illustrative', () => {
    const content = fixture.nativeElement.textContent as string;

    expect(content).toContain('no representan criterios oficiales de seguridad');
  });
});
