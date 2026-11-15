import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';

import { FeatureIntroComponent } from '../feature-intro/feature-intro.component';

@Component({
  selector: 'app-secondary-page',
  templateUrl: './secondary-page.component.html',
  styleUrls: ['./secondary-page.component.scss'],
  imports: [IonContent, IonIcon, RouterLink, FeatureIntroComponent],
})
export class SecondaryPageComponent {
  readonly icon = input.required<string>();
  readonly eyebrow = input.required<string>();
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly badge = input<string>('MODO DEMOSTRACIÓN');
  readonly backLink = input<string>('/tabs/mas');
  readonly backLabel = input<string>('Volver a Más');
  readonly footerLabel = input.required<string>();
  readonly footerVersion = input<string>('v0.7');

  constructor() {
    addIcons({ arrowBackOutline });
  }
}
