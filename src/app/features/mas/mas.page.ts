import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  appsOutline,
  bookOutline,
  chatbubblesOutline,
  downloadOutline,
  hardwareChipOutline,
  informationCircleOutline,
  radioOutline,
  schoolOutline,
  settingsOutline,
  shieldCheckmarkOutline,
  statsChartOutline,
} from 'ionicons/icons';

import { APK_DOWNLOAD_URL } from '../../../environments/apk-download.config';
import { ADMIN_ACCESS_DENIED_PARAM, ADMIN_ACCESS_DENIED_VALUE } from '../../core/auth/admin-access.guard';
import { AUTH_FACADE, type AuthFacade } from '../../core/auth/auth-facade.contract';
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
  private readonly auth: AuthFacade = inject(AUTH_FACADE);
  private readonly permissions = inject(DemoPermissionsService);
  private readonly route = inject(ActivatedRoute);
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly accessDenied = computed(
    () =>
      this.queryParams().get(ADMIN_ACCESS_DENIED_PARAM) === ADMIN_ACCESS_DENIED_VALUE &&
      !this.permissions.can('admin:access'),
  );

  private readonly adminMenuItem: MasMenuItem = {
    id: 'administracion',
    title: 'Administración',
    description: 'Usuarios y roles registrados',
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
      id: 'monitoreo-iot',
      title: 'Monitoreo IoT',
      description: 'Telemetría MQTT de los ESP32',
      icon: 'radio-outline',
      accent: 'cyan',
      link: '/tabs/mas/monitoreo-iot',
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

  /** Dentro de la APK la descarga no tiene sentido: solo se muestra en navegador. */
  readonly isNativeApp = signal(Capacitor.isNativePlatform());

  /** URL HTTPS de la APK oficial publicada; vacía = aún no disponible. */
  readonly apkDownloadUrl = signal(APK_DOWNLOAD_URL);

  constructor() {
    addIcons({
      appsOutline,
      bookOutline,
      chatbubblesOutline,
      downloadOutline,
      hardwareChipOutline,
      informationCircleOutline,
      radioOutline,
      schoolOutline,
      settingsOutline,
      shieldCheckmarkOutline,
      statsChartOutline,
    });
  }

  readonly isSigningOut = signal(false);

  /**
   * Cierre real: limpieza local inmediata y cierre Supabase vía `AuthFacade`.
   * El estado vuelve a Aprendiz aunque falle el cierre remoto.
   */
  async closeSession(): Promise<void> {
    if (this.isSigningOut()) {
      return;
    }

    this.isSigningOut.set(true);
    this.session.clear();

    try {
      await this.auth.signOut();
    } catch {
      // El cierre remoto falló: el estado local ya volvió a Aprendiz.
    } finally {
      this.isSigningOut.set(false);
    }
  }
}
