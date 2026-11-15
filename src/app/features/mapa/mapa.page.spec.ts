import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { DEMO_ZONES, getZoneOccupancy } from '../../core/data/demo-monitoring';
import { MonitoringStateService } from '../../core/services/monitoring-state.service';

import { MapaPage } from './mapa.page';

describe('MapaPage', () => {
  let component: MapaPage;
  let fixture: ComponentFixture<MapaPage>;
  let element: HTMLElement;

  const zoneGroups = (): SVGElement[] => Array.from(element.querySelectorAll('.map-zone')) as unknown as SVGElement[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapaPage],
    }).compileComponents();

    fixture = TestBed.createComponent(MapaPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the header, demo indicator and plan description', () => {
    const content = element.textContent ?? '';

    expect(content).toContain('Mapa de monitoreo');
    expect(content).toContain('Visualización de zonas y ocupación');
    expect(content).toContain('MODO DEMOSTRACIÓN');
    expect(content).toContain('Plano ilustrativo de las instalaciones');
    expect(content).toContain('Ruta demostrativa — no verificada para evacuación');
  });

  it('should derive the four map zones from the centralized monitoring state', () => {
    const monitoring = TestBed.inject(MonitoringStateService);

    expect(component.mapZones().map((item) => item.zone.id)).toEqual(DEMO_ZONES.map((zone) => zone.id));
    expect(component.mapZones().map((item) => item.occupancy)).toEqual([70, 30, 84, 12]);
    expect(component.mapZones().map((item) => item.status)).toEqual(['warning', 'normal', 'critical', 'normal']);
    expect(component.mapZones().map((item) => item.zone)).toEqual(monitoring.zones());
    expect(component.totalPeople()).toBe(107);
    expect(component.totalPeople()).toBe(monitoring.totalPeople());
  });

  it('should render each zone with its percentage and text status', () => {
    const groups = zoneGroups();
    const texts = groups.map((group) => group.textContent?.replace(/\s+/g, ' ').trim() ?? '');

    expect(groups.length).toBe(4);
    expect(texts[0]).toContain('Cafetería');
    expect(texts[0]).toContain('70%');
    expect(texts[0]).toContain('Precaución');
    expect(texts[1]).toContain('Biblioteca');
    expect(texts[1]).toContain('30%');
    expect(texts[1]).toContain('Normal');
    expect(texts[2]).toContain('Pasillo principal');
    expect(texts[2]).toContain('84%');
    expect(texts[2]).toContain('Crítico');
    expect(texts[3]).toContain('Punto de encuentro');
    expect(texts[3]).toContain('12%');
  });

  it('should map the zone statuses to their visual modifiers', () => {
    const groups = zoneGroups();

    expect(groups[0].getAttribute('class')).toContain('map-zone--warning');
    expect(groups[1].getAttribute('class')).toContain('map-zone--normal');
    expect(groups[2].getAttribute('class')).toContain('map-zone--critical');
    expect(groups[3].getAttribute('class')).toContain('map-zone--normal');
  });

  it('should preselect the critical zone and show it in the info card', () => {
    expect(component.selectedZone().zone.name).toBe('Pasillo principal');
    expect(zoneGroups()[2].getAttribute('aria-pressed')).toBe('true');

    const detail = element.querySelector('.map-detail') as HTMLElement;
    const content = detail.textContent?.replace(/\s+/g, ' ').trim() ?? '';

    expect(content).toContain('Pasillo principal');
    expect(content).toContain('Zona C');
    expect(content).toContain('42');
    expect(content).toContain('50');
    expect(content).toContain('84%');
    expect(content).toContain('Crítico');
  });

  it('should update the info card when another zone is selected', () => {
    zoneGroups()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(component.selectedId()).toBe('cafeteria');
    expect(zoneGroups()[0].getAttribute('aria-pressed')).toBe('true');

    const content =
      (element.querySelector('.map-detail') as HTMLElement).textContent?.replace(/\s+/g, ' ').trim() ?? '';

    expect(content).toContain('Cafetería');
    expect(content).toContain('35');
    expect(content).toContain('50');
    expect(content).toContain('70%');
    expect(content).toContain('Precaución');
    expect(element.querySelector('.map-detail')?.getAttribute('class')).toContain('map-detail--warning');
  });

  it('should allow keyboard selection of a zone', () => {
    zoneGroups()[1].dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(component.selectedId()).toBe('biblioteca');
    expect(component.selectedZone().zone.name).toBe('Biblioteca');

    zoneGroups()[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(component.selectedId()).toBe('zona-segura');
    expect(component.selectedZone().zone.name).toBe('Punto de encuentro');
  });

  it('should expose accessible names and selection state on every zone', () => {
    const groups = zoneGroups();

    expect(groups[0].getAttribute('aria-label')).toContain('Cafetería');
    expect(groups[0].getAttribute('aria-label')).toContain('70%');
    expect(groups[0].getAttribute('aria-label')).toContain('Precaución');
    expect(groups[0].getAttribute('role')).toBe('button');
    expect(groups[0].getAttribute('tabindex')).toBe('0');
  });

  it('should render the legend and the demo disclaimer', () => {
    const content = element.textContent ?? '';

    expect(content).toContain('Leyenda del plano');
    expect(content).toContain('Sensor infrarrojo');
    expect(content).toContain('Sensor ultrasónico');
    expect(content).toContain('Sensor de movimiento PIR');
    expect(content).toContain('Matriz LED');
    expect(content).toContain('Los sensores son conceptuales');
    expect(content).toContain('Fase 2.5 · Mapa');
  });

  it('should keep the percentages derived from the shared capacity', () => {
    expect(component.mapZones().map((item) => getZoneOccupancy(item.zone))).toEqual(
      component.mapZones().map((item) => item.occupancy),
    );
  });
});
