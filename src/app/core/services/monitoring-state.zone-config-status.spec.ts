import { TestBed } from '@angular/core/testing';

import { DEMO_ZONES } from '../data/demo-monitoring';
import { ZONE_CONFIG_MODE, type ZoneConfigMode } from '../data/zone-config.source';
import type { ZoneConfig } from '../data/zone-config.types';
import { zoneConfigFromMonitoringZone } from '../data/zone-config.validators';
import { ZONES_REPOSITORY } from '../data/zones-repository.contract';
import { ZonesRepositoryError } from '../data/zones-repository.errors';
import { SupabaseService } from '../supabase.service';

import { MonitoringStateService } from './monitoring-state.service';

const REMOTE_CONFIGS: readonly ZoneConfig[] = [
  {
    ...zoneConfigFromMonitoringZone(DEMO_ZONES[0]),
    id: 'sala-remota',
    codigo: 'R1',
    nombre: 'Sala remota',
  },
];

interface SetupOptions {
  readonly mode?: ZoneConfigMode;
  readonly list?: ReturnType<typeof vi.fn>;
}

function configure(options: SetupOptions = {}): { monitoring: MonitoringStateService; list: ReturnType<typeof vi.fn> } {
  const list = options.list ?? vi.fn().mockResolvedValue(REMOTE_CONFIGS);

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: ZONE_CONFIG_MODE, useValue: options.mode ?? 'remote' },
      { provide: ZONES_REPOSITORY, useValue: { list } },
      { provide: SupabaseService, useValue: { client: {}, isConfigured: true } },
    ],
  });

  return { monitoring: TestBed.inject(MonitoringStateService), list };
}

describe('MonitoringStateService — estados y reintento de configuración (ZONAS.5.3)', () => {
  it('expone estado listo en DEMO y nunca consulta la fuente al reintentar', async () => {
    const { monitoring, list } = configure({ mode: 'demo' });

    expect(monitoring.zoneConfigMode()).toBe('demo');
    expect(monitoring.zoneConfigStatus()).toBe('ready');

    await monitoring.retryZoneConfigs();

    expect(list).not.toHaveBeenCalled();
    expect(monitoring.zoneConfigStatus()).toBe('ready');
  });

  it('publica carga y comparte la petición en curso con el reintento', async () => {
    let resolveList: ((configs: readonly ZoneConfig[]) => void) | undefined;
    const list = vi.fn(
      () =>
        new Promise<readonly ZoneConfig[]>((resolve) => {
          resolveList = resolve;
        }),
    );
    const { monitoring } = configure({ list });

    const initial = monitoring.ensureZoneConfigs();
    const retry = monitoring.retryZoneConfigs();

    expect(monitoring.zoneConfigStatus()).toBe('loading');
    expect(list).toHaveBeenCalledTimes(1);

    resolveList?.(REMOTE_CONFIGS);
    await Promise.all([initial, retry]);

    expect(monitoring.zoneConfigStatus()).toBe('ready');
    expect(monitoring.zoneConfigError()).toBeNull();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('recupera el estado listo tras reintentar un error', async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new ZonesRepositoryError('FORBIDDEN'))
      .mockResolvedValueOnce(REMOTE_CONFIGS);
    const { monitoring } = configure({ list });

    await monitoring.ensureZoneConfigs();

    expect(monitoring.zoneConfigStatus()).toBe('error');
    expect(monitoring.zoneConfigError()?.message).toBe('No tienes permiso para consultar la configuración de zonas.');
    expect(monitoring.activeZoneConfigs()).toEqual([]);

    await monitoring.retryZoneConfigs();

    expect(list).toHaveBeenCalledTimes(2);
    expect(monitoring.zoneConfigStatus()).toBe('ready');
    expect(monitoring.zoneConfigError()).toBeNull();
    expect(monitoring.activeZoneConfigs()).toEqual(REMOTE_CONFIGS);
    expect(monitoring.zones().map((zone) => zone.id)).toEqual(['sala-remota']);
  });

  it('permite reintentar un estado vacío hasta obtener zonas', async () => {
    const list = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(REMOTE_CONFIGS);
    const { monitoring } = configure({ list });

    await monitoring.ensureZoneConfigs();

    expect(monitoring.zoneConfigStatus()).toBe('empty');
    expect(monitoring.zoneConfigEmpty()).toBe(true);

    await monitoring.retryZoneConfigs();

    expect(monitoring.zoneConfigStatus()).toBe('ready');
    expect(monitoring.zoneConfigEmpty()).toBe(false);
    expect(monitoring.zones().map((zone) => zone.id)).toEqual(['sala-remota']);
  });

  it('conserva el error y sin datos DEMO si el reintento vuelve a fallar', async () => {
    const list = vi.fn().mockRejectedValue(new ZonesRepositoryError('NETWORK'));
    const { monitoring } = configure({ list });

    await monitoring.ensureZoneConfigs();
    await monitoring.retryZoneConfigs();

    expect(list).toHaveBeenCalledTimes(2);
    expect(monitoring.zoneConfigStatus()).toBe('error');
    expect(monitoring.zoneConfigError()?.code).toBe('NETWORK');
    expect(monitoring.zoneConfigs()).toEqual([]);
    expect(monitoring.zones()).toEqual([]);
  });
});
