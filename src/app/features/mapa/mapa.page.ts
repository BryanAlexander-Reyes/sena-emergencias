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
import { MonitoringStateService, type ZoneSnapshot } from '../../core/services/monitoring-state.service';
import { FeatureIntroComponent } from '../../shared/feature-intro/feature-intro.component';

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

function toMapZoneView(snapshot: ZoneSnapshot): MapZoneView | undefined {
  const layout = MAP_ZONE_LAYOUT[snapshot.zone.id];

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
  imports: [IonContent, IonIcon, FeatureIntroComponent],
})
export class MapaPage {
  private readonly monitoring = inject(MonitoringStateService);

  readonly totalPeople = this.monitoring.totalPeople;
  readonly mapZones = computed<readonly MapZoneView[]>(() =>
    this.monitoring.snapshots().flatMap((snapshot) => {
      const view = toMapZoneView(snapshot);

      return view ? [view] : [];
    }),
  );

  readonly zoomed = signal(false);
  readonly selectedId = signal(this.defaultZoneId());
  readonly selectedZone = computed(
    () => this.mapZones().find((item) => item.zone.id === this.selectedId()) ?? this.mapZones()[0],
  );
  readonly selectedProgress = computed(() => this.selectedZone().progress);

  constructor() {
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
    return this.selectedId() === zoneId;
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
    return `app-card map-detail map-detail--${this.selectedZone().status}`;
  }

  private defaultZoneId(): string {
    const zones = this.mapZones();

    return zones.find((item) => item.status === 'critical')?.zone.id ?? zones[0]?.zone.id ?? '';
  }
}
