import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  gridOutline,
  homeOutline,
  mapOutline,
  menuOutline,
  notificationsOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';

import { DemoPermissionsService } from '../core/auth/demo-permissions.service';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, RouterLink, RouterLinkActive],
})
export class TabsPage {
  private readonly permissions = inject(DemoPermissionsService);

  /** Misma comprobación que el menú Más: requiere identidad verificada. */
  readonly canAccessAdmin = computed(() => this.permissions.can('admin:access'));

  constructor() {
    addIcons({
      gridOutline,
      homeOutline,
      mapOutline,
      menuOutline,
      notificationsOutline,
      shieldCheckmarkOutline,
    });
  }
}
