/**
 * SENA CROWD INTELLIGENCE — store raíz de configuración de zonas (ZONAS.3).
 *
 * Único punto de lectura de la configuración de zonas. Separa por completo la
 * configuración (id, nombre, capacidad, icono, flags, geometría) de la
 * ocupación simulada que vive en `MonitoringStateService`.
 *
 * Modo DEMO: siembra el store desde `DEMO_ZONES` y nunca consulta Supabase.
 * Modo REMOTE: consulta el `ZonesRepository` de solo lectura. Si Supabase no
 * está configurado se mantiene DEMO etiquetado; si está configurado y la
 * consulta falla se publica el error y NUNCA se sustituye por datos DEMO.
 */

import { computed, Injectable, inject, signal } from '@angular/core';

import { DEMO_ZONES } from '../data/demo-monitoring';
import { ZONE_CONFIG_MODE, type ZoneConfigMode } from '../data/zone-config.source';
import type { ZoneConfig } from '../data/zone-config.types';
import { zoneConfigFromMonitoringZone } from '../data/zone-config.validators';
import { ZONES_REPOSITORY } from '../data/zones-repository.contract';
import {
  toZonesRepositoryError,
  ZonesRepositoryError,
  type ZonesRepositoryErrorCode,
} from '../data/zones-repository.errors';
import { SupabaseService } from '../supabase.service';

export interface ZoneConfigStateError {
  readonly code: ZonesRepositoryErrorCode;
  readonly message: string;
}

export type ZoneConfigStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

const DEMO_ZONE_CONFIGS: readonly ZoneConfig[] = DEMO_ZONES.map((zone) => zoneConfigFromMonitoringZone(zone));

function toStateError(error: unknown): ZoneConfigStateError {
  const repositoryError = error instanceof ZonesRepositoryError ? error : toZonesRepositoryError(error);

  return { code: repositoryError.code, message: repositoryError.message };
}

@Injectable({ providedIn: 'root' })
export class ZoneConfigStateService {
  private readonly repository = inject(ZONES_REPOSITORY);
  private readonly requestedMode = inject(ZONE_CONFIG_MODE);
  private readonly supabase = inject(SupabaseService);

  private readonly modeState = signal<ZoneConfigMode>(
    this.requestedMode === 'remote' && this.supabase.isConfigured ? 'remote' : 'demo',
  );
  private readonly configsState = signal<readonly ZoneConfig[]>(this.modeState() === 'demo' ? DEMO_ZONE_CONFIGS : []);
  private readonly loadedState = signal(this.modeState() === 'demo');
  private readonly loadingState = signal(false);
  private readonly errorState = signal<ZoneConfigStateError | null>(null);

  private generation = 0;
  private inFlight: Promise<void> | null = null;

  readonly mode = this.modeState.asReadonly();
  readonly configs = this.configsState.asReadonly();
  readonly loaded = this.loadedState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  /** Configuración visible: activa y pública. No incluye ocupación. */
  readonly activeConfigs = computed<readonly ZoneConfig[]>(() =>
    this.configs().filter((config) => config.activo && config.publico),
  );

  readonly empty = computed(() => this.loaded() && this.configs().length === 0 && this.error() === null);

  readonly status = computed<ZoneConfigStatus>(() => {
    if (this.loading()) {
      return 'loading';
    }
    if (this.error() !== null) {
      return 'error';
    }
    if (!this.loaded()) {
      return 'idle';
    }

    return this.configs().length === 0 ? 'empty' : 'ready';
  });

  readonly isDemo = computed(() => this.mode() === 'demo');
  readonly isRemote = computed(() => this.mode() === 'remote');

  /** Carga inicial o refresco explícito. Las llamadas concurrentes se comparten. */
  load(): Promise<void> {
    if (this.modeState() === 'demo') {
      this.configsState.set(DEMO_ZONE_CONFIGS);
      this.loadedState.set(true);
      this.loadingState.set(false);
      this.errorState.set(null);

      return Promise.resolve();
    }

    if (this.inFlight !== null) {
      return this.inFlight;
    }

    const generation = ++this.generation;
    this.loadingState.set(true);
    this.errorState.set(null);

    const request = this.repository
      .list()
      .then((configs) => {
        if (generation !== this.generation) {
          return;
        }

        this.configsState.set(configs);
        this.loadedState.set(true);
      })
      .catch((error: unknown) => {
        if (generation !== this.generation) {
          return;
        }

        this.errorState.set(toStateError(error));
      });

    this.inFlight = request;

    void request.finally(() => {
      if (generation === this.generation) {
        this.loadingState.set(false);
      }
      if (this.inFlight === request) {
        this.inFlight = null;
      }
    });

    return request;
  }

  /** Recarga remota; en DEMO es una operación local sin red. */
  refresh(): Promise<void> {
    return this.load();
  }

  /** Reintento tras un error. No cambia el modo ni inventa datos DEMO. */
  retry(): Promise<void> {
    return this.load();
  }

  /**
   * Refresco tras una escritura administrativa. Fuerza una generación nueva en
   * lugar de compartir una lectura en vuelo, para que Inicio, Zonas y Mapa
   * reciban la configuración confirmada por el servidor. En DEMO no hace nada.
   */
  refreshAfterWrite(): Promise<void> {
    if (this.modeState() === 'demo') {
      return Promise.resolve();
    }

    this.inFlight = null;
    this.generation += 1;

    return this.load();
  }

  /**
   * Punto único invocado al entrar en Inicio, Zonas o Mapa.
   * En modo remoto refresca; en DEMO no hace ninguna petición.
   */
  onScreenEnter(): Promise<void> {
    return this.modeState() === 'demo' ? Promise.resolve() : this.load();
  }
}
