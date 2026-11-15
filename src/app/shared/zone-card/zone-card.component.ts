import { Component, computed, input, output, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, refreshOutline, removeOutline } from 'ionicons/icons';

import {
  getZoneOccupancy,
  getZoneStatus,
  OCCUPANCY_STATUS_LABELS,
  type MonitoringZone,
} from '../../core/data/demo-monitoring';

@Component({
  selector: 'app-zone-card',
  templateUrl: './zone-card.component.html',
  styleUrls: ['./zone-card.component.scss'],
  imports: [IonIcon],
  host: {
    '[class]': "'app-card zone-card zone-card--' + status()",
    '(click)': 'toggle()',
  },
})
export class ZoneCardComponent {
  readonly zone = input.required<MonitoringZone>();
  readonly resetDisabled = input(false);

  readonly increment = output<void>();
  readonly decrement = output<void>();
  readonly reset = output<void>();

  readonly occupancy = computed(() => getZoneOccupancy(this.zone()));
  readonly status = computed(() => getZoneStatus(this.zone()));
  readonly statusLabel = computed(() => OCCUPANCY_STATUS_LABELS[this.status()]);
  readonly progressWidth = computed(() => Math.min(100, Math.max(0, this.occupancy())));
  readonly canIncrement = computed(() => {
    const zone = this.zone();

    return Number.isInteger(zone.people) && zone.people >= 0 && zone.people < zone.capacity;
  });
  readonly canDecrement = computed(() => Number.isInteger(this.zone().people) && this.zone().people > 0);
  readonly noteId = computed(() => `zone-note-${this.zone().id}`);
  readonly expanded = signal(false);

  constructor() {
    addIcons({ addOutline, refreshOutline, removeOutline });
  }

  toggle(): void {
    this.expanded.update((value) => !value);
  }

  toggleFromButton(event: Event): void {
    event.stopPropagation();
    this.toggle();
  }
}
