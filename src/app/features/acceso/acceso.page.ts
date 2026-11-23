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
  schoolOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';

import { AUTH_FACADE, type AuthFacade } from '../../core/auth/auth-facade.contract';
import { DEMO_PROFILES, findDemoProfile, type DemoProfileId } from '../../core/auth/demo-profiles';
import { DemoSessionService } from '../../core/auth/demo-session.service';
import { SUPABASE_LOGIN_ERROR } from '../../core/auth/supabase-auth.service';
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
  private readonly auth: AuthFacade = inject(AUTH_FACADE);
  private readonly router = inject(Router);

  readonly profiles = DEMO_PROFILES;
  readonly view = signal<AccesoView>('select');
  readonly confirmationLabel = signal<string | null>(null);
  readonly loginTitle = signal<string | null>(null);
  readonly loginError = signal<string | null>(null);
  readonly isSubmitting = signal(false);

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
      schoolOutline,
      shieldCheckmarkOutline,
    });
  }

  selectProfile(profileId: DemoProfileId): void {
    if (this.session.requiresCredentials(profileId)) {
      // Perfil pendiente: la sesión queda como Aprendiz y no hay privilegios.
      this.session.beginCredentialSelection(profileId);
    } else {
      // Aprendiz conserva su acceso directo existente; nunca activa un rol privilegiado.
      this.session.selectPublicRole('aprendiz');
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
    void this.login();
  }

  async login(): Promise<void> {
    if (this.isSubmitting()) {
      return;
    }

    const selectedProfileId = this.session.selectedProfileId();
    if (selectedProfileId !== 'administrador' && selectedProfileId !== 'instructor') {
      return;
    }

    this.isSubmitting.set(true);
    this.loginError.set(null);

    try {
      await this.auth.signIn({ username: this.username, password: this.password }, selectedProfileId);

      this.resetLoginForm();
      this.view.set('select');
      void this.router.navigate(['/tabs/inicio']);
    } catch (error: unknown) {
      this.loginError.set(error instanceof Error ? error.message : SUPABASE_LOGIN_ERROR);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /**
   * Vuelve atrás en el formulario. No cierra una sesión Supabase: solo descarta
   * la selección pendiente. El cierre real se hace desde Más → Salir del perfil.
   */
  back(): void {
    if (this.isSubmitting()) {
      return;
    }

    this.session.cancelCredentialSelection();
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
