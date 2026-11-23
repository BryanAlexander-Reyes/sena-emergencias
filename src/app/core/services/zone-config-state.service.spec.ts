import { TestBed } from '@angular/core/testing';

import { DEMO_ZONES } from '../data/demo-monitoring';
import { ZONE_CONFIG_MODE, type ZoneConfigMode } from '../data/zone-config.source';
import { LEGACY_ZONE_IDS, type ZoneConfig } from '../data/zone-config.types';
import { zoneConfigFromMonitoringZone } from '../data/zone-config.validators';
import { ZONES_REPOSITORY } from '../data/zones-repository.contract';
import { ZONES_REPOSITORY_MESSAGES, ZonesRepositoryError } from '../data/zones-repository.errors';
import { SupabaseService } from '../supabase.service';

import { ZoneConfigStateService } from './zone-config-state.service';

const REMOTE_CONFIGS: readonly ZoneConfig[] = [
  {
    ...zoneConfigFromMonitoringZone(DEMO_ZONES[0]),
    id: 'sala-remota',
    codigo: 'R1',
    nombre: 'Sala remota',
    capacidad: 25,
    segura: true,
  },
  {
    ...zoneConfigFromMonitoringZone(DEMO_ZONES[1]),
    id: 'sala-privada',
    codigo: 'R2',
    nombre: 'Sala privada',
    activo: false,
    publico: false,
  },
];

interface SetupOptions {
  readonly mode?: ZoneConfigMode;
  readonly configured?: boolean;
  readonly list?: ReturnType<typeof vi.fn>;
}

function configure(options: SetupOptions = {}): { service: ZoneConfigStateService; list: ReturnType<typeof vi.fn> } {
  const list = options.list ?? vi.fn().mockResolvedValue(REMOTE_CONFIGS);
  const configured = options.configured ?? true;

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: ZONE_CONFIG_MODE, useValue: options.mode ?? 'demo' },
      { provide: ZONES_REPOSITORY, useValue: { list } },
      { provide: SupabaseService, useValue: { client: configured ? {} : null, isConfigured: configured } },
    ],
  });

  return { service: TestBed.inject(ZoneConfigStateService), list };
}

describe('ZoneConfigStateService', () => {
  it('parte en modo DEMO con las cuatro zonas históricas y sin consultar Supabase', async () => {
    const { service, list } = configure();

    expect(service.mode()).toBe('demo');
    expect(service.isDemo()).toBe(true);
    expect(service.isRemote()).toBe(false);
    expect(service.configs().map((config) => config.id)).toEqual([...LEGACY_ZONE_IDS]);
    expect(service.activeConfigs()).toHaveLength(4);
    expect(service.loaded()).toBe(true);
    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
    expect(service.empty()).toBe(false);
    expect(service.status()).toBe('ready');

    await service.refresh();
    await service.retry();
    await service.onScreenEnter();

    expect(list).not.toHaveBeenCalled();
  });

  it('mantiene DEMO etiquetado si se pide remoto pero Supabase no está configurado', () => {
    const { service, list } = configure({ mode: 'remote', configured: false });

    expect(service.mode()).toBe('demo');
    expect(service.configs().map((config) => config.id)).toEqual([...LEGACY_ZONE_IDS]);
    expect(service.error()).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });

  it('hidrata la configuración remota validada y expone solo la configuración activa y pública', async () => {
    const { service, list } = configure({ mode: 'remote' });

    expect(service.mode()).toBe('remote');
    expect(service.configs()).toEqual([]);

    await service.load();

    expect(list).toHaveBeenCalledTimes(1);
    expect(service.configs()).toEqual(REMOTE_CONFIGS);
    expect(service.activeConfigs()).toEqual([REMOTE_CONFIGS[0]]);
    expect(service.loaded()).toBe(true);
    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
    expect(service.empty()).toBe(false);
    expect(service.status()).toBe('ready');
  });

  it('marca el estado empty cuando la fuente remota responde sin zonas', async () => {
    const { service, list } = configure({ mode: 'remote', list: vi.fn().mockResolvedValue([]) });

    await service.load();

    expect(list).toHaveBeenCalledTimes(1);
    expect(service.configs()).toEqual([]);
    expect(service.error()).toBeNull();
    expect(service.empty()).toBe(true);
    expect(service.status()).toBe('empty');
  });

  it('publica el error remoto sin sustituirlo por zonas DEMO', async () => {
    const list = vi.fn().mockRejectedValue(new ZonesRepositoryError('FORBIDDEN'));
    const { service } = configure({ mode: 'remote', list });

    await service.load();

    expect(service.error()).toEqual({
      code: 'FORBIDDEN',
      message: ZONES_REPOSITORY_MESSAGES.FORBIDDEN,
    });
    expect(service.configs()).toEqual([]);
    expect(service.activeConfigs()).toEqual([]);
    expect(service.empty()).toBe(false);
    expect(service.status()).toBe('error');
  });

  it('traduce errores desconocidos a un mensaje seguro sin revelar el original', async () => {
    const { service } = configure({
      mode: 'remote',
      list: vi.fn().mockRejectedValue(new Error('stack con detalle interno')),
    });

    await service.load();

    expect(service.error()).toEqual({
      code: 'QUERY_FAILED',
      message: ZONES_REPOSITORY_MESSAGES.QUERY_FAILED,
    });
    expect(JSON.stringify(service.error())).not.toContain('detalle interno');
  });

  it('comparte una sola petición entre cargas y entradas concurrentes de pantalla', async () => {
    let resolveList: ((configs: readonly ZoneConfig[]) => void) | undefined;
    const list = vi.fn(
      () =>
        new Promise<readonly ZoneConfig[]>((resolve) => {
          resolveList = resolve;
        }),
    );
    const { service } = configure({ mode: 'remote', list });

    const first = service.load();
    const second = service.onScreenEnter();
    const third = service.retry();

    expect(list).toHaveBeenCalledTimes(1);
    expect(service.loading()).toBe(true);

    resolveList?.(REMOTE_CONFIGS);
    await Promise.all([first, second, third]);

    expect(service.configs()).toEqual(REMOTE_CONFIGS);
    expect(service.loading()).toBe(false);
  });

  it('ignora una respuesta tardía de una generación anterior', async () => {
    let resolveStale: ((configs: readonly ZoneConfig[]) => void) | undefined;
    const staleConfigs: readonly ZoneConfig[] = [
      { ...REMOTE_CONFIGS[0], id: 'obsoleta', nombre: 'Respuesta obsoleta', segura: false },
    ];
    const list = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<readonly ZoneConfig[]>((resolve) => {
          resolveStale = resolve;
        }),
      )
      .mockResolvedValueOnce(REMOTE_CONFIGS);
    const { service } = configure({ mode: 'remote', list });

    const staleRequest = service.load();
    // Se fuerza una nueva generación para simular que la primera respuesta
    // llega después de un reintento ya resuelto.
    (service as unknown as { inFlight: Promise<void> | null }).inFlight = null;
    const currentRequest = service.load();

    await currentRequest;
    resolveStale?.(staleConfigs);
    await staleRequest;

    expect(service.configs()).toEqual(REMOTE_CONFIGS);
  });

  it('permite reintentar después de un error y limpia el estado de error', async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new ZonesRepositoryError('NETWORK'))
      .mockResolvedValueOnce(REMOTE_CONFIGS);
    const { service } = configure({ mode: 'remote', list });

    await service.load();
    expect(service.error()?.code).toBe('NETWORK');

    await service.retry();

    expect(list).toHaveBeenCalledTimes(2);
    expect(service.error()).toBeNull();
    expect(service.configs()).toEqual(REMOTE_CONFIGS);
    expect(service.status()).toBe('ready');
  });

  it('fuerza una lectura nueva tras una escritura sin compartir la petición en vuelo', async () => {
    let resolveStale: ((configs: readonly ZoneConfig[]) => void) | undefined;
    const updated: readonly ZoneConfig[] = [{ ...REMOTE_CONFIGS[0], nombre: 'Sala actualizada' }];
    const stale: readonly ZoneConfig[] = [{ ...REMOTE_CONFIGS[0], nombre: 'Sala obsoleta' }];
    const list = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<readonly ZoneConfig[]>((resolve) => {
          resolveStale = resolve;
        }),
      )
      .mockResolvedValueOnce(updated);
    const { service } = configure({ mode: 'remote', list });

    const pending = service.load();
    await service.refreshAfterWrite();

    expect(list).toHaveBeenCalledTimes(2);
    expect(service.configs()).toEqual(updated);

    resolveStale?.(stale);
    await pending;

    expect(service.configs()).toEqual(updated);
    expect(service.loading()).toBe(false);
  });

  it('no consulta la red al refrescar tras una escritura en modo DEMO', async () => {
    const { service, list } = configure();

    await service.refreshAfterWrite();

    expect(list).not.toHaveBeenCalled();
    expect(service.configs().map((config) => config.id)).toEqual([...LEGACY_ZONE_IDS]);
  });
});
