import { Component } from '@angular/core';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  appsOutline,
  chatbubblesOutline,
  hardwareChipOutline,
  informationCircleOutline,
  settingsOutline,
  shieldCheckmarkOutline,
  statsChartOutline,
} from 'ionicons/icons';

import { FeatureIntroComponent } from '../../shared/feature-intro/feature-intro.component';
import { NavCardComponent, type NavCardAccent } from '../../shared/nav-card/nav-card.component';

interface MasMenuItem {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly accent: NavCardAccent;
  readonly link: string;
}

@Component({
  selector: 'app-mas',
  templateUrl: 'mas.page.html',
  styleUrls: ['mas.page.scss'],
  imports: [IonContent, IonIcon, FeatureIntroComponent, NavCardComponent],
})
export class MasPage {
  readonly menu: readonly MasMenuItem[] = [
    {
      id: 'zona-segura',
      title: 'Zona segura',
      description: 'Punto de encuentro y ocupación',
      icon: 'shield-checkmark-outline',
      accent: 'green',
      link: '/tabs/mas/zona-segura',
    },
    {
      id: 'estadisticas',
      title: 'Estadísticas',
      description: 'Gráficos y tendencias de ocupación',
      icon: 'stats-chart-outline',
      accent: 'cyan',
      link: '/tabs/mas/estadisticas',
    },
    {
      id: 'sensores',
      title: 'Sensores IoT',
      description: 'Dispositivos y lecturas simuladas',
      icon: 'hardware-chip-outline',
      accent: 'blue',
      link: '/tabs/mas/sensores',
    },
    {
      id: 'asistente',
      title: 'Asistente IA',
      description: 'Consultas sobre el monitoreo',
      icon: 'chatbubbles-outline',
      accent: 'violet',
      link: '/tabs/mas/asistente',
    },
    {
      id: 'configuracion',
      title: 'Configuración',
      description: 'Preferencias e información',
      icon: 'settings-outline',
      accent: 'gray',
      link: '/tabs/mas/configuracion',
    },
  ];

  constructor() {
    addIcons({
      appsOutline,
      chatbubblesOutline,
      hardwareChipOutline,
      informationCircleOutline,
      settingsOutline,
      shieldCheckmarkOutline,
      statsChartOutline,
    });
  }
}
