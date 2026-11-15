import { Component, computed, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { peopleOutline, shieldCheckmarkOutline } from 'ionicons/icons';

import { MonitoringStateService } from '../../../core/services/monitoring-state.service';
import { SecondaryPageComponent } from '../../../shared/secondary-page/secondary-page.component';

@Component({
  selector: 'app-zona-segura',
  templateUrl: './zona-segura.page.html',
  styleUrls: ['./zona-segura.page.scss'],
  imports: [IonIcon, SecondaryPageComponent],
})
export class ZonaSeguraPage {
  private readonly monitoring = inject(MonitoringStateService);

  readonly safeZone = this.monitoring.safeZone;
  readonly occupancy = this.monitoring.safeZoneOccupancy;
  readonly status = this.monitoring.safeZoneStatus;
  readonly statusLabel = this.monitoring.safeZoneStatusLabel;
  readonly progressWidth = computed(() => this.monitoring.safeZoneSnapshot().progress);

  constructor() {
    addIcons({ peopleOutline, shieldCheckmarkOutline });
  }
}
