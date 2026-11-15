import { Component } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  cloudOfflineOutline,
  cogOutline,
  gridOutline,
  hardwareChipOutline,
  informationCircleOutline,
  pulseOutline,
  radioOutline,
  walkOutline,
} from 'ionicons/icons';

import { SecondaryPageComponent } from '../../../shared/secondary-page/secondary-page.component';

interface SensorType {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
}

@Component({
  selector: 'app-sensores',
  templateUrl: './sensores.page.html',
  styleUrls: ['./sensores.page.scss'],
  imports: [IonIcon, SecondaryPageComponent],
})
export class SensoresPage {
  readonly sensors: readonly SensorType[] = [
    {
      id: 'infrarrojos',
      name: 'Infrarrojos IR',
      description: 'Detección de paso en accesos y pasillos.',
      icon: 'radio-outline',
    },
    {
      id: 'ultrasonicos',
      name: 'Ultrasónicos',
      description: 'Medición de distancia y proximidad.',
      icon: 'pulse-outline',
    },
    {
      id: 'pir',
      name: 'PIR',
      description: 'Detección de movimiento por presencia.',
      icon: 'walk-outline',
    },
    {
      id: 'matrices-led',
      name: 'Matrices LED',
      description: 'Señalización visual del estado de las zonas.',
      icon: 'grid-outline',
    },
    {
      id: 'servomotores',
      name: 'Servomotores',
      description: 'Movimiento de compuertas o indicadores físicos.',
      icon: 'cog-outline',
    },
  ];

  constructor() {
    addIcons({
      cloudOfflineOutline,
      cogOutline,
      gridOutline,
      hardwareChipOutline,
      informationCircleOutline,
      pulseOutline,
      radioOutline,
      walkOutline,
    });
  }
}
