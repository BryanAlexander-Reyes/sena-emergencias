import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  appsOutline,
  bookOutline,
  chatbubblesOutline,
  hardwareChipOutline,
  informationCircleOutline,
  personOutline,
  schoolOutline,
  settingsOutline,
  shieldCheckmarkOutline,
  statsChartOutline,
} from 'ionicons/icons';

import { ADMIN_ACCESS_DENIED_PARAM, ADMIN_ACCESS_DENIED_VALUE } from '../../core/auth/admin-access.guard';
import { DemoPermissionsService } from '../../core/auth/demo-permissions.service';
import { DemoSessionService } from '../../core/auth/demo-session.service';
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
  imports: [IonButton, IonContent, IonIcon, RouterLink, FeatureIntroComponent, NavCardComponent],
})
export class MasPage {
  readonly session = inject(DemoSessionService);
  private readonly permissions = inject(DemoPermissionsService);
  private readonly route = inject(ActivatedRoute);

  readonly accessDenied = computed(
    () =>
      this.route.snapshot.queryParamMap.get(ADMIN_ACCESS_DENIED_PARAM) === ADMIN_ACCESS_DENIED_VALUE &&
      !this.permissions.can('admin:access'),
  );

  private readonly adminMenuItem: MasMenuItem = {
    id: 'administracion',
    title: 'Administración',
    description: 'Usuarios y roles ficticios',
    icon: 'shield-checkmark-outline',
    accent: 'green',
    link: '/tabs/mas/administracion',
  };

  private readonly baseMenu: readonly MasMenuItem[] = [
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

  readonly menu = computed<readonly MasMenuItem[]>(() =>
    this.permissions.can('admin:access') ? [...this.baseMenu, this.adminMenuItem] : this.baseMenu,
  );

  constructor() {
    addIcons({
      appsOutline,
      bookOutline,
      chatbubblesOutline,
      hardwareChipOutline,
      informationCircleOutline,
      personOutline,
      schoolOutline,
      settingsOutline,
      shieldCheckmarkOutline,
      statsChartOutline,
    });
  }

  closeSession(): void {
    this.session.closeSession();
  }
}
