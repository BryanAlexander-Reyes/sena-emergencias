import { computed, signal, type Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { DEMO_SAFE_ZONE, DEMO_ZONES } from '../data/demo-monitoring';
import type { ZoneConfigMode } from '../data/zone-config.source';
import type { ZoneConfig } from '../data/zone-config.types';
import { zoneConfigFromMonitoringZone } from '../data/zone-config.validators';

import { MonitoringStateService } from './monitoring-state.service';
import type { ZoneConfigStateError } from './zone-config-state.service';
import { ZoneConfigStateService } from './zone-config-state.service';

const REMOTE_CONFIGS: readonly ZoneConfig[] = [
  {
    ...zoneConfigFromMonitoringZone(DEMO_ZONES[0]),
    id: 'sala-a',
    codigo: 'RA',
    nombre: 'Sala A',
    capacidad: 10,
    segura: true,
  },
  {
    ...zoneConfigFromMonitoringZone(DEMO_ZONES[1]),
    id: 'sala-b',
    codigo: 'RB',
    nombre: 'Sala B',
    capacidad: 20,
  },
];

interface FakeStore {
  readonly service: ZoneConfigStateService;
  readonly setMode: (mode: ZoneConfigMode) => void;
  readonly setConfigs: (configs: readonly ZoneConfig[]) => void;
  readonly onScreenEnter: ReturnType<typeof vi.fn>;
}

function fakeStore(mode: ZoneConfigMode, configs: readonly ZoneConfig[]): FakeStore {
  const modeState = signal(mode);
  const configsState = signal(configs);
  const errorState = signal<ZoneConfigStateError | null>(null);
  const loadingState = signal(false);
  const activeConfigs = computed(() => configsState().filter((config) => config.activo && config.publico));
  const empty = computed(() => configsState().length === 0 && errorState() === null);
  const onScreenEnter = vi.fn().mockResolvedValue(undefined);

  const service = {
    mode: modeState.asReadonly() as Signal<ZoneConfigMode>,
    configs: configsState.asReadonly() as Signal<readonly ZoneConfig[]>,
    activeConfigs,
    loading: loadingState.asReadonly(),
    empty,
    error: errorState.asReadonly(),
    onScreenEnter,
  } as unknown as ZoneConfigStateService;

  return {
    service,
    setMode: (next) => modeState.set(next),
    setConfigs: (next) => configsState.set(next),
    onScreenEnter,
  };
}

function configure(
  mode: ZoneConfigMode,
  configs: readonly ZoneConfig[],
): {
  monitoring: MonitoringStateService;
  store: FakeStore;
} {
  const store = fakeStore(mode, configs);

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: ZoneConfigStateService, useValue: store.service }],
  });

  return { monitoring: TestBed.inject(MonitoringStateService), store };
}

describe('MonitoringStateService — configuración compartida (ZONAS.3)', () => {
  it('conserva las referencias DEMO y la simulación intacta en modo demostración', () => {
    const { monitoring } = configure('demo', REMOTE_CONFIGS);

    expect(monitoring.zones()).toBe(DEMO_ZONES);
    expect(monitoring.zones().map((zone) => zone.id)).toEqual(DEMO_ZONES.map((zone) => zone.id));
    expect(monitoring.totalPeople()).toBe(107);
    expect(monitoring.safeZone()).toBe(DEMO_SAFE_ZONE);

    expect(monitoring.incrementOccupancy('cafeteria')).toBe(true);
    expect(monitoring.zoneById('cafeteria')?.people).toBe(36);
    expect(monitoring.resetZoneOccupancy('cafeteria')).toBe(true);
  });

  it('proyecta la configuración remota sin mezclarla con ocupación real', () => {
    const { monitoring } = configure('remote', REMOTE_CONFIGS);

    expect(monitoring.zones().map((zone) => zone.id)).toEqual(['sala-a', 'sala-b']);
    expect(monitoring.zones().map((zone) => zone.people)).toEqual([0, 0]);
    expect(monitoring.zones()[0]).toMatchObject({
      code: 'RA',
      name: 'Sala A',
      capacity: 10,
      icon: 'cafe-outline',
      safe: true,
    });
    expect(monitoring.safeZone().id).toBe('sala-a');

    expect(monitoring.incrementOccupancy('sala-a')).toBe(true);
    expect(monitoring.zoneById('sala-a')?.people).toBe(1);
    expect(monitoring.occupancyOf('sala-a')).toBe(10);
    expect(monitoring.resetZoneOccupancy('sala-a')).toBe(true);
    expect(monitoring.zoneById('sala-a')?.people).toBe(0);
  });

  it('no sustituye un error remoto por zonas DEMO', () => {
    const { monitoring, store } = configure('remote', []);

    expect(monitoring.zones()).toEqual([]);
    expect(monitoring.totalPeople()).toBe(0);
    expect(monitoring.monitoredZones()).toBe(0);
    expect(monitoring.safeZone()).not.toBe(DEMO_SAFE_ZONE);
    expect(monitoring.safeZone().name).toBe('Sin zonas disponibles');

    store.setConfigs(REMOTE_CONFIGS);
    expect(monitoring.zones().map((zone) => zone.id)).toEqual(['sala-a', 'sala-b']);
    expect(monitoring.zones()).not.toBe(DEMO_ZONES);
  });

  it('expone las señales del store compartido y delega el refresco de pantalla', async () => {
    const { monitoring, store } = configure('remote', REMOTE_CONFIGS);

    expect(monitoring.zoneConfigs()).toBe(REMOTE_CONFIGS);
    expect(monitoring.zoneConfigMode()).toBe('remote');

    await monitoring.ensureZoneConfigs();

    expect(store.onScreenEnter).toHaveBeenCalledTimes(1);
  });
});
