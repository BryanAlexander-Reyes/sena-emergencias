import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  bookOutline,
  cafeOutline,
  contractOutline,
  expandOutline,
  informationCircleOutline,
  mapOutline,
  navigateOutline,
  shieldCheckmarkOutline,
  walkOutline,
} from 'ionicons/icons';

import type { MonitoringZone, OccupancyStatus } from '../../core/data/demo-monitoring';
import type { ZoneConfig } from '../../core/data/zone-config.types';
import { MonitoringStateService, type ZoneSnapshot } from '../../core/services/monitoring-state.service';
import { FeatureIntroComponent } from '../../shared/feature-intro/feature-intro.component';
import { ZoneConfigStatusComponent } from '../../shared/zone-config-status/zone-config-status.component';

import { MAP_ZONE_LAYOUT, type MapZoneLayout } from './map-layout';

interface MapZoneView {
  readonly layout: MapZoneLayout;
  readonly zone: MonitoringZone;
  readonly occupancy: number;
  readonly progress: number;
  readonly status: OccupancyStatus;
  readonly statusLabel: string;
  readonly ariaLabel: string;
}

/**
 * Helper puro: convierte la geometría validada de `ZoneConfig.map` en un layout
 * del plano. Una zona sin geometría (`map === null`) no produce layout.
 */
function layoutFromZoneConfig(config: ZoneConfig): MapZoneLayout | undefined {
  if (!config.map) {
    return undefined;
  }

  return {
    zoneId: config.id,
    overline: MAP_ZONE_LAYOUT[config.id]?.overline ?? `Zona ${config.codigo}`,
    x: config.map.x,
    y: config.map.y,
    width: config.map.width,
    height: config.map.height,
    labelX: config.map.labelX,
    labelY: config.map.labelY,
  };
}

function toMapZoneView(snapshot: ZoneSnapshot, layout: MapZoneLayout | undefined): MapZoneView | undefined {
  if (!layout) {
    return undefined;
  }

  return {
    layout,
    zone: snapshot.zone,
    occupancy: snapshot.occupancy,
    progress: snapshot.progress,
    status: snapshot.status,
    statusLabel: snapshot.statusLabel,
    ariaLabel: `${snapshot.zone.name}: ${snapshot.occupancy}% de ocupación. Estado ${snapshot.statusLabel}.`,
  };
}

@Component({
  selector: 'app-mapa',
  templateUrl: 'mapa.page.html',
  styleUrls: ['mapa.page.scss'],
  imports: [IonContent, IonIcon, FeatureIntroComponent, ZoneConfigStatusComponent],
})
export class MapaPage {
  private readonly monitoring = inject(MonitoringStateService);

  readonly totalPeople = this.monitoring.totalPeople;
  readonly zoneConfigMode = this.monitoring.zoneConfigMode;
  readonly zoneConfigStatus = this.monitoring.zoneConfigStatus;
  readonly zoneConfigError = this.monitoring.zoneConfigError;

  /** Geometría de Supabase indexada por id. Solo se evalúa en modo `remote`. */
  private readonly remoteLayouts = computed<ReadonlyMap<string, MapZoneLayout>>(() => {
    const layouts = new Map<string, MapZoneLayout>();

    for (const config of this.monitoring.activeZoneConfigs()) {
      const layout = layoutFromZoneConfig(config);

      if (layout) {
        layouts.set(config.id, layout);
      }
    }

    return layouts;
  });

  /** Solo zonas con geometría conocida: las demás no se dibujan en el plano. */
  readonly mapZones = computed<readonly MapZoneView[]>(() => {
    const remote = this.zoneConfigMode() === 'remote';
    // En DEMO no se consulta la geometría remota: se usa solo MAP_ZONE_LAYOUT.
    const remoteLayouts = remote ? this.remoteLayouts() : null;

    return this.monitoring.snapshots().flatMap((snapshot) => {
      const zoneId = snapshot.zone.id;
      // REMOTO prioriza Supabase; una zona histórica sin geometría conserva el
      // layout local. Una zona desconocida sin geometría queda sin layout y se
      // omite del plano sin provocar errores.
      const layout = remoteLayouts?.get(zoneId) ?? MAP_ZONE_LAYOUT[zoneId];
      const view = toMapZoneView(snapshot, layout);

      return view ? [view] : [];
    });
  });

  readonly zoomed = signal(false);
  readonly hasMapZones = computed(() => this.mapZones().length > 0);
  readonly selectedId = signal(this.defaultZoneId());

  /**
   * Resolución segura de la selección. Si el id guardado ya no existe (recarga
   * remota) o no hay zonas representables, devuelve `undefined` y la plantilla
   * muestra el estado vacío. Ningún consumidor accede a propiedades de un view
   * inexistente.
   */
  readonly selectedZone = computed<MapZoneView | undefined>(
    () => this.mapZones().find((item) => item.zone.id === this.selectedId()) ?? this.mapZones()[0],
  );
  readonly selectedProgress = computed(() => this.selectedZone()?.progress ?? 0);

  retryZoneConfigs(): void {
    void this.monitoring.retryZoneConfigs();
  }

  constructor() {
    void this.monitoring.ensureZoneConfigs();
    addIcons({
      bookOutline,
      cafeOutline,
      contractOutline,
      expandOutline,
      informationCircleOutline,
      mapOutline,
      navigateOutline,
      shieldCheckmarkOutline,
      walkOutline,
    });
  }

  isSelected(zoneId: string): boolean {
    return this.selectedZone()?.zone.id === zoneId;
  }

  selectZone(zoneId: string): void {
    this.selectedId.set(zoneId);
  }

  onZoneKeydown(event: Event, zoneId: string): void {
    event.preventDefault();
    this.selectZone(zoneId);
  }

  toggleZoom(): void {
    this.zoomed.update((value) => !value);
  }

  zoneClass(item: MapZoneView): string {
    const selected = this.isSelected(item.zone.id) ? ' map-zone--selected' : '';

    return `map-zone map-zone--${item.status}${selected}`;
  }

  detailClass(): string {
    const status = this.selectedZone()?.status;

    return status ? `app-card map-detail map-detail--${status}` : 'app-card map-detail map-detail--empty';
  }

  private defaultZoneId(): string {
    const zones = this.mapZones();

    return zones.find((item) => item.status === 'critical')?.zone.id ?? zones[0]?.zone.id ?? '';
  }
}
