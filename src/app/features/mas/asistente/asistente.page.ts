import { Component } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chatbubblesOutline, helpCircleOutline, sendOutline, sparklesOutline, timeOutline } from 'ionicons/icons';

import { SecondaryPageComponent } from '../../../shared/secondary-page/secondary-page.component';

@Component({
  selector: 'app-asistente',
  templateUrl: './asistente.page.html',
  styleUrls: ['./asistente.page.scss'],
  imports: [IonIcon, SecondaryPageComponent],
})
export class AsistentePage {
  readonly suggestions: readonly string[] = [
    '¿Cuál es la zona más ocupada?',
    '¿Cómo funciona la zona segura?',
    '¿Qué alertas están activas?',
  ];

  constructor() {
    addIcons({
      chatbubblesOutline,
      helpCircleOutline,
      sendOutline,
      sparklesOutline,
      timeOutline,
    });
  }
}
