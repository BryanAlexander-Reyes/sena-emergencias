import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { AlertController } from '@ionic/angular';

import { DemoSessionService } from '../../core/auth/demo-session.service';
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

    TestBed.inject(DemoSessionService).selectProfile('administrador');
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

  it('muestra controles y reset con perfil administrador', () => {
    expect(fixture.nativeElement.querySelector('.zonas-simulation__reset')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.zone-card__step--increment')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.zone-card__reset')).toBeTruthy();
    expect(component.canUpdateOccupancy()).toBe(true);
    expect(component.canResetOccupancy()).toBe(true);
  });

  it('oculta la simulación y bloquea los handlers para perfil de solo consulta', () => {
    const monitoring = TestBed.inject(MonitoringStateService);
    const zone = DEMO_ZONES[0];
    const people = monitoring.zoneById(zone.id)?.people;

    TestBed.inject(DemoSessionService).selectProfile('instructor');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.zonas-simulation__reset')).toBeNull();
    expect(fixture.nativeElement.querySelector('.zone-card__step--increment')).toBeNull();
    expect(fixture.nativeElement.querySelector('.zone-card__reset')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Tu perfil permite consultar la ocupación');
    expect(component.canUpdateOccupancy()).toBe(false);
    expect(component.canResetOccupancy()).toBe(false);

    component.increment(zone.id);
    component.decrement(zone.id);
    component.resetZone(zone.id);

    expect(monitoring.zoneById(zone.id)?.people).toBe(people);
    expect(component.simulationMessage()).toContain('solo permite consultar');
  });

  it('aplica incremento, decremento y reset de zona con perfil administrador', () => {
    const monitoring = TestBed.inject(MonitoringStateService);
    const zoneId = DEMO_ZONES[0].id;
    const initial = monitoring.zoneById(zoneId)?.people;

    component.increment(zoneId);
    expect(monitoring.zoneById(zoneId)?.people).toBe((initial ?? 0) + 1);

    component.decrement(zoneId);
    expect(monitoring.zoneById(zoneId)?.people).toBe(initial);

    monitoring.incrementOccupancy(zoneId);
    component.resetZone(zoneId);

    expect(monitoring.zoneById(zoneId)?.people).toBe(initial);
    expect(component.simulationMessage()).toContain('ocupación restablecida');
  });

  it('restablece todas las zonas al confirmar el diálogo con permiso vigente', async () => {
    const monitoring = TestBed.inject(MonitoringStateService);
    const zoneId = DEMO_ZONES[0].id;
    const initial = monitoring.zoneById(zoneId)?.people;
    const alertController = TestBed.inject(AlertController);
    const alert = { present: vi.fn().mockResolvedValue(undefined) };
    const createSpy = vi
      .spyOn(alertController, 'create')
      .mockResolvedValue(alert as unknown as Awaited<ReturnType<AlertController['create']>>);

    monitoring.incrementOccupancy(zoneId);
    await component.confirmResetAll();

    const options = createSpy.mock.calls.at(0)?.at(0);
    const buttons = options?.buttons as { role?: string; handler?: () => void }[] | undefined;
    const destructive = buttons?.find((button) => button.role === 'destructive');

    destructive?.handler?.();

    expect(monitoring.zoneById(zoneId)?.people).toBe(initial);
    expect(component.simulationMessage()).toContain('Todas las zonas se restablecieron');
  });

  it('revalida el permiso al ejecutar un reset pendiente en el diálogo', async () => {
    const monitoring = TestBed.inject(MonitoringStateService);
    const zoneId = DEMO_ZONES[0].id;
    const alertController = TestBed.inject(AlertController);
    const alert = { present: vi.fn().mockResolvedValue(undefined) };
    const createSpy = vi
      .spyOn(alertController, 'create')
      .mockResolvedValue(alert as unknown as Awaited<ReturnType<AlertController['create']>>);

    monitoring.incrementOccupancy(zoneId);
    const people = monitoring.zoneById(zoneId)?.people;

    await component.confirmResetAll();
    expect(createSpy).toHaveBeenCalledTimes(1);

    const options = createSpy.mock.calls.at(0)?.at(0);
    expect(options).toBeDefined();
    const buttons = options?.buttons as { role?: string; handler?: () => void }[] | undefined;
    const destructive = buttons?.find((button) => button.role === 'destructive');
    expect(destructive?.handler).toBeTypeOf('function');

    TestBed.inject(DemoSessionService).selectProfile('visitante');
    destructive?.handler?.();

    expect(monitoring.zoneById(zoneId)?.people).toBe(people);
    expect(component.simulationMessage()).toContain('solo permite consultar');
  });
});
