import { Component, computed, input, output, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  checkmarkDoneOutline,
  chevronDownOutline,
  chevronUpOutline,
  informationCircleOutline,
  locationOutline,
  radioButtonOnOutline,
  timeOutline,
  warningOutline,
} from 'ionicons/icons';

import {
  ALERT_ORIGIN_LABELS,
  ALERT_REVIEW_LABELS,
  ALERT_SEVERITY_LABELS,
  ALERT_STATUS_LABELS,
  type AlertSeverity,
  type DemoAlert,
} from '../../core/data/demo-alerts';

const SEVERITY_ICONS: Record<AlertSeverity, string> = {
  critical: 'alert-circle-outline',
  warning: 'warning-outline',
  info: 'information-circle-outline',
};

@Component({
  selector: 'app-alert-card',
  templateUrl: './alert-card.component.html',
  styleUrls: ['./alert-card.component.scss'],
  imports: [IonIcon],
  host: {
    class: 'alert-card-host',
  },
})
export class AlertCardComponent {
  readonly alert = input.required<DemoAlert>();
  readonly canReview = input(false);
  readonly reviewRequested = output<string>();

  readonly expanded = signal(false);
  readonly severityLabel = computed(() => ALERT_SEVERITY_LABELS[this.alert().severity]);
  readonly statusLabel = computed(() => ALERT_STATUS_LABELS[this.alert().status]);
  readonly reviewLabel = computed(() => ALERT_REVIEW_LABELS[this.alert().review]);
  readonly originLabel = computed(() => ALERT_ORIGIN_LABELS[this.alert().origin]);
  readonly severityIcon = computed(() => SEVERITY_ICONS[this.alert().severity]);
  readonly detailsId = computed(() => `alert-details-${this.alert().id}`);
  readonly isPending = computed(() => this.alert().review === 'pending');
  readonly showReview = computed(() => this.isPending() && this.canReview());

  constructor() {
    addIcons({
      alertCircleOutline,
      checkmarkCircleOutline,
      checkmarkDoneOutline,
      chevronDownOutline,
      chevronUpOutline,
      informationCircleOutline,
      locationOutline,
      radioButtonOnOutline,
      timeOutline,
      warningOutline,
    });
  }

  toggle(): void {
    this.expanded.update((value) => !value);
  }

  requestReview(): void {
    if (this.showReview()) {
      this.reviewRequested.emit(this.alert().id);
    }
  }
}
