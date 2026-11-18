import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonInput } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  bookOutline,
  checkmarkCircleOutline,
  informationCircleOutline,
  keyOutline,
  lockClosedOutline,
  personOutline,
  schoolOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';

import { DemoAuthService } from '../../core/auth/demo-auth.service';
import { DEMO_PROFILES, findDemoProfile, type DemoProfileId } from '../../core/auth/demo-profiles';
import { DemoSessionService } from '../../core/auth/demo-session.service';
import { FeatureIntroComponent } from '../../shared/feature-intro/feature-intro.component';

type AccesoView = 'select' | 'login';

@Component({
  selector: 'app-acceso',
  templateUrl: 'acceso.page.html',
  styleUrls: ['acceso.page.scss'],
  imports: [IonButton, IonContent, IonIcon, IonInput, RouterLink, FeatureIntroComponent],
})
export class AccesoPage {
  readonly session = inject(DemoSessionService);
  private readonly auth = inject(DemoAuthService);
  private readonly router = inject(Router);

  readonly profiles = DEMO_PROFILES;
  readonly view = signal<AccesoView>('select');
  readonly confirmationLabel = signal<string | null>(null);
  readonly loginTitle = signal<string | null>(null);
  readonly loginError = signal<string | null>(null);

  // Valores del formulario en memoria mientras el formulario existe; nunca se
  // copian al estado de sesión, a almacenamiento ni a la consola.
  username = '';
  password = '';

  constructor() {
    addIcons({
      arrowBackOutline,
      bookOutline,
      checkmarkCircleOutline,
      informationCircleOutline,
      keyOutline,
      lockClosedOutline,
      personOutline,
      schoolOutline,
      shieldCheckmarkOutline,
    });
  }

  selectProfile(profileId: DemoProfileId): void {
    if (this.session.requiresCredentials(profileId)) {
      // Perfil pendiente: la sesión queda como Visitante y no hay privilegios.
      this.session.beginCredentialSelection(profileId);
    } else {
      // Aprendiz y Visitante conservan su acceso directo existente.
      this.session.activateProfile(profileId);
    }

    this.confirmationLabel.set(findDemoProfile(profileId)?.label ?? null);
    this.loginTitle.set(null);
    this.view.set('select');
    this.resetLoginForm();
  }

  continueToInicio(): void {
    const selectedId = this.session.selectedProfileId();

    if (this.session.requiresCredentials(selectedId)) {
      this.loginTitle.set(findDemoProfile(selectedId)?.label ?? null);
      this.resetLoginForm();
      this.view.set('login');
      return;
    }

    void this.router.navigate(['/tabs/inicio']);
  }

  onUsernameInput(event: CustomEvent<{ value?: string | null }>): void {
    this.username = event.detail.value ?? '';
  }

  onPasswordInput(event: CustomEvent<{ value?: string | null }>): void {
    this.password = event.detail.value ?? '';
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    this.login();
  }

  login(): void {
    const result = this.auth.authenticate(this.username, this.password, this.session.selectedProfileId());

    if (!result.ok) {
      this.loginError.set(result.error);
      return;
    }

    this.resetLoginForm();
    this.view.set('select');
    void this.router.navigate(['/tabs/inicio']);
  }

  back(): void {
    this.session.closeSession();
    this.confirmationLabel.set(null);
    this.loginTitle.set(null);
    this.view.set('select');
    this.resetLoginForm();
  }

  private resetLoginForm(): void {
    this.username = '';
    this.password = '';
    this.loginError.set(null);
  }
}
