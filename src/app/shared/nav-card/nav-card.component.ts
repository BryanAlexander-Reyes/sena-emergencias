import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronForwardOutline } from 'ionicons/icons';

export type NavCardAccent = 'green' | 'cyan' | 'blue' | 'violet' | 'gray';

@Component({
  selector: 'app-nav-card',
  templateUrl: './nav-card.component.html',
  styleUrls: ['./nav-card.component.scss'],
  imports: [IonIcon, RouterLink],
  host: {
    '[class]': "'nav-card-host nav-card-host--' + accent()",
  },
})
export class NavCardComponent {
  readonly icon = input.required<string>();
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly accent = input.required<NavCardAccent>();
  readonly link = input.required<string>();

  constructor() {
    addIcons({ chevronForwardOutline });
  }
}
