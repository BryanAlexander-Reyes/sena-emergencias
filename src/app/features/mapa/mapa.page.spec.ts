import { computed, signal, type Signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import {
  countPeople,
  DEMO_ZONES,
  getZoneOccupancy,
  getZoneProgress,
  getZoneStatus,
  OCCUPANCY_STATUS_LABELS,
  type MonitoringZone,
} from '../../core/data/demo-monitoring';
import type { ZoneConfig, ZoneMapGeometry } from '../../core/data/zone-config.types';
import { MonitoringStateService, type ZoneSnapshot } from '../../core/services/monitoring-state.service';

import { MAP_ZONE_LAYOUT } from './map-layout';
import { MapaPage } from './mapa.page';

interface MapaSetup {
  readonly fixture: ComponentFixture<MapaPage>;
  readonly component: MapaPage;
  readonly element: HTMLElement;
  readonly setZones: (zones: readonly MonitoringZone[]) => void;
  readonly setConfigs: (configs: readonly ZoneConfig[]) => void;
}

interface MapaConfigOptions {
  readonly mode?: 'demo' | 'remote';
  readonly configs?: readonly ZoneConfig[];
}

function toSnapshot(zone: MonitoringZone): ZoneSnapshot {
  const status = getZoneStatus(zone);

  return {
    zone,
    occupancy: getZoneOccupancy(zone),
    progress: getZoneProgress(zone),
    status,
    statusLabel: OCCUPANCY_STATUS_LABELS[status],
  };
}

/** Geometría local de una zona histórica, en el orden de `ZoneConfig.map`. */
function geometryFromLayout(zoneId: string): ZoneMapGeometry | null {
  const layout = MAP_ZONE_LAYOUT[zoneId];

  return layout
    ? {
        x: layout.x,
        y: layout.y,
        width: layout.width,
        height: layout.height,
        labelX: layout.labelX,
        labelY: layout.labelY,
      }
    : null;
}

function toZoneConfig(zone: MonitoringZone, map: ZoneMapGeometry | null = geometryFromLayout(zone.id)): ZoneConfig {
  return {
    id: zone.id,
    codigo: zone.code,
    nombre: zone.name,
    capacidad: zone.capacity,
    icono: zone.icon,
    tipo: zone.type,
    segura: zone.safe ?? false,
    activo: true,
    publico: true,
    map,
  };
}

/** Estado de monitoreo controlado: permite simular zonas vacías, sin layout y geometría remota. */
function configure(zones: readonly MonitoringZone[] = DEMO_ZONES, options: MapaConfigOptions = {}): MapaSetup {
  const snapshotsState = signal<readonly ZoneSnapshot[]>(zones.map(toSnapshot));
  const configsState = signal<readonly ZoneConfig[]>(options.configs ?? []);
  const monitoring = {
    snapshots: snapshotsState.asReadonly() as Signal<readonly ZoneSnapshot[]>,
    zones: computed(() => snapshotsState().map((snapshot) => snapshot.zone)),
    totalPeople: computed(() => countPeople(snapshotsState().map((snapshot) => snapshot.zone))),
    zoneConfigMode: () => options.mode ?? 'demo',
    activeZoneConfigs: configsState.asReadonly() as Signal<readonly ZoneConfig[]>,
    zoneConfigStatus: () => 'ready' as const,
    zoneConfigError: () => null,
    ensureZoneConfigs: vi.fn().mockResolvedValue(undefined),
    retryZoneConfigs: vi.fn().mockResolvedValue(undefined),
  } as unknown as MonitoringStateService;

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [MapaPage],
    providers: [{ provide: MonitoringStateService, useValue: monitoring }],
  });

  const fixture = TestBed.createComponent(MapaPage);
  fixture.detectChanges();

  return {
    fixture,
    component: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
    setZones: (next) => {
      snapshotsState.set(next.map(toSnapshot));
      fixture.detectChanges();
    },
    setConfigs: (next) => {
      configsState.set(next);
      fixture.detectChanges();
    },
  };
}

describe('MapaPage', () => {
  let component: MapaPage;
  let fixture: ComponentFixture<MapaPage>;
  let element: HTMLElement;

  const zoneGroups = (): SVGElement[] => Array.from(element.querySelectorAll('.map-zone')) as unknown as SVGElement[];

  beforeEach(() => {
    ({ component, fixture, element } = configure());
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('no muestra avisos de configuración remota en modo DEMO', () => {
    expect(element.querySelector('.zone-status')).toBeNull();
  });

  it('should render the header, the local-configuration indicator and the plan description in DEMO', () => {
    const content = (element.textContent ?? '').replace(/\s+/g, ' ');

    expect(content).toContain('Mapa de monitoreo');
    expect(content).toContain('Visualización de zonas y ocupación');
    expect(content).toContain('ZONAS LOCALES · OCUPACIÓN SIMULADA');
    expect(content).not.toContain('MODO DEMOSTRACIÓN');
    expect(content).toContain('Plano ilustrativo de las instalaciones');
    expect(content).toContain('Ruta demostrativa — no verificada para evacuación');
    expect(content).toContain('Ocupación simulada · Toca otra zona del plano para actualizar esta tarjeta.');
    expect(content).toContain('OCUPACIÓN SIMULADA');
    expect(content).toContain('Los sensores son conceptuales y no están conectados a equipos reales');
  });

  it('muestra el badge de configuración remota y conserva las advertencias de simulación', () => {
    const setup = configure(DEMO_ZONES, { mode: 'remote' });
    const content = (setup.element.textContent ?? '').replace(/\s+/g, ' ');

    expect(content).toContain('ZONAS REMOTAS · OCUPACIÓN SIMULADA');
    expect(content).not.toContain('ZONAS LOCALES · OCUPACIÓN SIMULADA');
    expect(content).not.toContain('MODO DEMOSTRACIÓN');
    expect(content).toContain('Ocupación simulada · Toca otra zona del plano para actualizar esta tarjeta.');
    expect(content).toContain('OCUPACIÓN SIMULADA');
    expect(content).toContain('Plano ilustrativo de las instalaciones');
    expect(content).toContain('Ruta demostrativa — no verificada para evacuación');
    expect(content).toContain('Los sensores son conceptuales y no están conectados a equipos reales');
    expect(setup.component.mapZones()).toHaveLength(4);
    expect(setup.component.selectedZone()?.zone.id).toBe('pasillo-principal');
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
    expect(component.selectedZone()?.zone.name).toBe('Pasillo principal');
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
    expect(component.selectedZone()?.zone.name).toBe('Biblioteca');

    zoneGroups()[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(component.selectedId()).toBe('zona-segura');
    expect(component.selectedZone()?.zone.name).toBe('Punto de encuentro');
  });

  it('should expose accessible names and selection state on every zone', () => {
    const groups = zoneGroups();

    expect(groups[0].getAttribute('aria-label')).toContain('Cafetería');
    expect(groups[0].getAttribute('aria-label')).toContain('70%');
    expect(groups[0].getAttribute('aria-label')).toContain('Precaución');
    expect(groups[0].getAttribute('role')).toBe('button');
    expect(groups[0].getAttribute('tabindex')).toBe('0');
  });

  it('should expose the selected occupancy as text for assistive technology', () => {
    const progress = element.querySelector('.app-progress.map-detail__progress') as HTMLElement;
    const fill = element.querySelector('.app-progress__fill.map-detail__progress-fill') as HTMLElement;

    expect(progress.getAttribute('role')).toBe('progressbar');
    expect(progress.getAttribute('aria-valuenow')).toBe('84');
    expect(progress.getAttribute('aria-valuetext')).toContain('84%');
    expect(progress.getAttribute('aria-valuetext')).toContain('Crítico');
    expect(fill.style.width).toBeTruthy();
  });

  it('should keep the plan and the detail in the responsive layout', () => {
    const layout = element.querySelector('.map-layout') as HTMLElement;

    expect(layout.querySelector('.map-layout__primary .map-card')).toBeTruthy();
    expect(layout.querySelector('.map-layout__primary .map-route-note')).toBeTruthy();
    expect(layout.querySelector('.map-layout__aside .map-detail')).toBeTruthy();
    expect(layout.querySelector('.map-layout__aside .map-legend')).toBeTruthy();
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

describe('MapaPage — resiliencia ante zonas no representables (ZONAS.5.2)', () => {
  const zoneWithoutLayout: MonitoringZone = {
    ...DEMO_ZONES[0],
    id: 'sala-sin-layout',
    name: 'Sala sin geometría',
  };

  it('should show a safe empty state and never read undefined when there are no zones', () => {
    const setup = configure([]);

    expect(setup.component.mapZones()).toEqual([]);
    expect(setup.component.hasMapZones()).toBe(false);
    expect(setup.component.selectedZone()).toBeUndefined();
    expect(setup.component.selectedProgress()).toBe(0);
    expect(setup.component.detailClass()).toBe('app-card map-detail map-detail--empty');

    expect(Array.from(setup.element.querySelectorAll('.map-zone')).length).toBe(0);
    expect(setup.element.querySelector('.map-plan__meta[role="status"]')).toBeTruthy();
    expect(setup.element.querySelector('.map-detail--empty')).toBeTruthy();
    expect(setup.element.querySelector('.map-detail__metrics')).toBeNull();
    expect(setup.element.querySelector('.app-progress.map-detail__progress')).toBeNull();
    expect(setup.element.textContent).toContain('Sin zonas para mostrar');
    expect(setup.element.textContent).toContain('0 zonas monitoreadas');
  });

  it('should fall back to a representable zone when the selected id disappears', () => {
    const setup = configure();
    const initialName = setup.component.selectedZone()?.zone.name;

    setup.component.selectZone('zona-que-desaparece');
    setup.fixture.detectChanges();

    expect(setup.component.selectedZone()?.zone.id).toBe(DEMO_ZONES[0].id);
    expect(setup.component.selectedZone()?.zone.name).not.toBe(initialName);
    expect(Array.from(setup.element.querySelectorAll('.map-zone'))[0].getAttribute('aria-pressed')).toBe('true');
    expect((setup.element.querySelector('.map-detail') as HTMLElement).textContent).toContain('Cafetería');
  });

  it('should ignore zones without layout and keep the empty state when none are representable', () => {
    const setup = configure([zoneWithoutLayout, { ...zoneWithoutLayout, id: 'otra-sin-layout' }]);

    expect(setup.component.mapZones()).toEqual([]);
    expect(setup.component.selectedZone()).toBeUndefined();
    expect(setup.element.querySelector('.map-detail--empty')).toBeTruthy();
    expect(Array.from(setup.element.querySelectorAll('.map-zone')).length).toBe(0);
  });

  it('should render only the representable zones when a mix is supplied', () => {
    const setup = configure([zoneWithoutLayout, DEMO_ZONES[2]]);
    const groups = Array.from(setup.element.querySelectorAll('.map-zone'));

    expect(setup.component.mapZones().map((item) => item.zone.id)).toEqual(['pasillo-principal']);
    expect(groups.length).toBe(1);
    expect(groups[0].getAttribute('aria-pressed')).toBe('true');
    expect(setup.element.querySelector('.map-plan__meta[role="status"]')).toBeNull();
    expect((setup.element.querySelector('.map-detail') as HTMLElement).textContent).toContain('Pasillo principal');
  });

  it('should recover without errors when zones arrive after an empty initial load', () => {
    const setup = configure([]);
    expect(setup.component.selectedZone()).toBeUndefined();

    setup.setZones(DEMO_ZONES);

    expect(setup.component.hasMapZones()).toBe(true);
    expect(Array.from(setup.element.querySelectorAll('.map-zone')).length).toBe(4);
    expect(setup.element.querySelector('.map-detail--empty')).toBeNull();
    expect(setup.component.selectedZone()?.zone.id).toBe(DEMO_ZONES[0].id);
  });
});

describe('MapaPage — geometría dinámica remota (ZONAS.5.17)', () => {
  const customMap: ZoneMapGeometry = { x: 12, y: 34, width: 56, height: 78, labelX: 40, labelY: 73 };

  const configsWith = (overrides: Record<string, ZoneMapGeometry | null> = {}): ZoneConfig[] =>
    DEMO_ZONES.map((zone) => {
      const override = overrides[zone.id];

      return toZoneConfig(zone, override !== undefined ? override : geometryFromLayout(zone.id));
    });

  function renderedGeometries(setup: MapaSetup) {
    return Array.from(setup.element.querySelectorAll('.map-zone')).map((group) => {
      const shape = group.querySelector('.map-zone__shape');
      const overline = group.querySelector('.map-zone__overline');
      const name = group.querySelector('.map-zone__name');
      const value = group.querySelector('.map-zone__value');
      const status = group.querySelector('.map-zone__status');

      return {
        name: name?.textContent?.trim() ?? '',
        overline: overline?.textContent?.trim() ?? '',
        rect: {
          x: Number(shape?.getAttribute('x')),
          y: Number(shape?.getAttribute('y')),
          width: Number(shape?.getAttribute('width')),
          height: Number(shape?.getAttribute('height')),
        },
        label: {
          x: Number(name?.getAttribute('x')),
          y: Number(name?.getAttribute('y')),
          overlineY: Number(overline?.getAttribute('y')),
          valueY: Number(value?.getAttribute('y')),
          statusY: Number(status?.getAttribute('y')),
        },
      };
    });
  }

  it('usa la geometría de Supabase en modo remote cuando difiere del layout local', () => {
    const setup = configure(DEMO_ZONES, { mode: 'remote', configs: configsWith({ cafeteria: customMap }) });
    const geometries = renderedGeometries(setup);

    expect(setup.component.mapZones().map((item) => item.zone.id)).toEqual(DEMO_ZONES.map((zone) => zone.id));
    expect(geometries).toHaveLength(4);
    expect(geometries[0].rect).toEqual({ x: 12, y: 34, width: 56, height: 78 });
    expect(geometries[1].rect).toEqual({ x: 188, y: 52, width: 144, height: 112 });
    expect(geometries[0].overline).toBe('Zona A');
  });

  it('ignora la geometría remota en modo DEMO y conserva el layout local', () => {
    const setup = configure(DEMO_ZONES, {
      mode: 'demo',
      configs: configsWith({ cafeteria: customMap, biblioteca: customMap }),
    });
    const geometries = renderedGeometries(setup);

    expect(geometries[0].rect).toEqual({ x: 28, y: 52, width: 144, height: 112 });
    expect(geometries[1].rect).toEqual({ x: 188, y: 52, width: 144, height: 112 });
    expect(setup.component.mapZones()[0].layout.labelX).toBe(100);
  });

  it('aplica el fallback local a una zona histórica remota sin geometría', () => {
    const setup = configure(DEMO_ZONES, { mode: 'remote', configs: configsWith({ biblioteca: null }) });
    const geometries = renderedGeometries(setup);

    expect(setup.component.mapZones().map((item) => item.zone.id)).toContain('biblioteca');
    expect(geometries[1].rect).toEqual({ x: 188, y: 52, width: 144, height: 112 });
    expect(geometries[1].overline).toBe('Zona B');
  });

  it('omite una zona desconocida sin geometría sin provocar errores', () => {
    const unknownZone: MonitoringZone = { ...DEMO_ZONES[0], id: 'sala-nueva', name: 'Sala nueva' };
    const setup = configure([unknownZone], { mode: 'remote', configs: [toZoneConfig(unknownZone, null)] });

    expect(setup.component.mapZones()).toEqual([]);
    expect(setup.component.hasMapZones()).toBe(false);
    expect(setup.component.selectedZone()).toBeUndefined();
    expect(renderedGeometries(setup)).toEqual([]);
    expect(setup.element.querySelector('.map-detail--empty')).toBeTruthy();
  });

  it('dibuja una zona desconocida con geometría remota usando su código como etiqueta', () => {
    const unknownZone: MonitoringZone = { ...DEMO_ZONES[0], id: 'sala-nueva', code: 'D', name: 'Sala nueva' };
    const setup = configure([unknownZone], {
      mode: 'remote',
      configs: [toZoneConfig(unknownZone, customMap)],
    });
    const geometries = renderedGeometries(setup);

    expect(setup.component.mapZones().map((item) => item.zone.id)).toEqual(['sala-nueva']);
    expect(geometries[0].name).toBe('Sala nueva');
    expect(geometries[0].overline).toBe('Zona D');
    expect(geometries[0].rect).toEqual({ x: 12, y: 34, width: 56, height: 78 });
  });

  it('conserva los desplazamientos de las etiquetas sobre la geometría remota', () => {
    const setup = configure(DEMO_ZONES, { mode: 'remote', configs: configsWith({ cafeteria: customMap }) });
    const label = renderedGeometries(setup)[0].label;

    expect(label.x).toBe(40);
    expect(label.y).toBe(70); // labelY - 3
    expect(label.overlineY).toBe(51); // labelY - 22
    expect(label.valueY).toBe(92); // labelY + 19
    expect(label.statusY).toBe(110); // labelY + 37
  });

  it('mantiene la selección estable al cambiar la geometría remota', () => {
    const setup = configure(DEMO_ZONES, { mode: 'remote', configs: configsWith() });

    setup.component.selectZone('biblioteca');
    setup.fixture.detectChanges();
    expect(setup.component.selectedZone()?.zone.id).toBe('biblioteca');

    setup.setConfigs(configsWith({ biblioteca: customMap }));

    expect(setup.component.selectedZone()?.zone.id).toBe('biblioteca');
    expect(setup.component.selectedZone()?.layout.x).toBe(12);
    expect(
      Array.from(setup.element.querySelectorAll('.map-zone')).filter(
        (group) => group.getAttribute('aria-pressed') === 'true',
      ),
    ).toHaveLength(1);
  });

  it('resuelve otra zona seleccionable cuando la elegida pierde su geometría', () => {
    const unknownZone: MonitoringZone = { ...DEMO_ZONES[0], id: 'sala-nueva', name: 'Sala nueva' };
    const setup = configure([...DEMO_ZONES, unknownZone], {
      mode: 'remote',
      configs: [...configsWith(), toZoneConfig(unknownZone, customMap)],
    });

    setup.component.selectZone('sala-nueva');
    setup.fixture.detectChanges();
    expect(setup.component.selectedZone()?.zone.id).toBe('sala-nueva');

    setup.setConfigs([...configsWith(), toZoneConfig(unknownZone, null)]);

    expect(setup.component.mapZones().map((item) => item.zone.id)).not.toContain('sala-nueva');
    expect(setup.component.selectedZone()?.zone.id).toBe(DEMO_ZONES[0].id);
  });

  it('no altera ocupación, progreso ni estado al aplicar geometría remota', () => {
    const setup = configure(DEMO_ZONES, { mode: 'remote', configs: configsWith({ cafeteria: customMap }) });
    const views = setup.component.mapZones();

    expect(views.map((item) => item.occupancy)).toEqual([70, 30, 84, 12]);
    expect(views.map((item) => item.progress)).toEqual(DEMO_ZONES.map((zone) => getZoneProgress(zone)));
    expect(views.map((item) => item.status)).toEqual(['warning', 'normal', 'critical', 'normal']);
    expect(views.map((item) => item.statusLabel)).toEqual(
      DEMO_ZONES.map((zone) => OCCUPANCY_STATUS_LABELS[getZoneStatus(zone)]),
    );
    expect(setup.element.textContent).toContain('84%');
  });
});
