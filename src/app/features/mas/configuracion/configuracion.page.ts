import { Component } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  appsOutline,
  cloudOfflineOutline,
  informationCircleOutline,
  moonOutline,
  settingsOutline,
} from 'ionicons/icons';

import { SecondaryPageComponent } from '../../../shared/secondary-page/secondary-page.component';

@Component({
  selector: 'app-configuracion',
  templateUrl: './configuracion.page.html',
  styleUrls: ['./configuracion.page.scss'],
  imports: [IonIcon, SecondaryPageComponent],
})
export class ConfiguracionPage {
  constructor() {
    addIcons({
      appsOutline,
      cloudOfflineOutline,
      informationCircleOutline,
      moonOutline,
      settingsOutline,
    });
  }
}
