import { Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

@Component({
  selector: 'app-feature-intro',
  templateUrl: './feature-intro.component.html',
  styleUrls: ['./feature-intro.component.scss'],
  imports: [IonIcon],
})
export class FeatureIntroComponent {
  readonly icon = input.required<string>();
  readonly eyebrow = input.required<string>();
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly badge = input<string>();
}
