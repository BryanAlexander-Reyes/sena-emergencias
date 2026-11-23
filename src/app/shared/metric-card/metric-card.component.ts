import { Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

export type MetricAccent = 'cyan' | 'blue' | 'yellow' | 'green';

@Component({
  selector: 'app-metric-card',
  templateUrl: './metric-card.component.html',
  styleUrls: ['./metric-card.component.scss'],
  imports: [IonIcon],
  host: {
    '[class]': "'app-card metric-card metric-card--' + accent()",
  },
})
export class MetricCardComponent {
  readonly title = input.required<string>();
  readonly value = input.required<string | number>();
  readonly icon = input.required<string>();
  readonly accent = input.required<MetricAccent>();
  readonly description = input.required<string>();
}
