import { computed, Injectable, signal } from '@angular/core';

import {
  findDemoProfile,
  VISITOR_PROFILE,
  VISITOR_PROFILE_ID,
  type DemoProfile,
  type DemoProfileId,
} from './demo-profiles';

export interface DemoSessionState {
  readonly profileId: DemoProfileId;
  readonly profile: DemoProfile;
  readonly isActive: boolean;
  readonly isAdministrative: boolean;
}

/** Perfiles que requieren el formulario de credenciales simuladas (Fase 5.1). */
const CREDENTIAL_PROFILE_IDS: readonly DemoProfileId[] = ['administrador', 'instructor'];

/**
 * Sesión de demostración. `profileId` es el perfil ACTIVO y es la única fuente
 * de verdad usada por `DemoPermissionsService` y los guards.
 *
 * `selectedProfileId` es el perfil elegido en `/acceso`. Para Administrador e
 * Instructor se guarda como pendiente sin activarlo: `beginCredentialSelection`
 * revoca de inmediato cualquier permiso privilegiado anterior. Solo
 * `DemoAuthService`, tras validar credenciales ficticias, llama a
 * `activateProfile`. Aprendiz y Visitante siguen siendo acceso directo.
 *
 * `authenticatedAccountId` identifica la cuenta ficticia validada para poder
 * revocarla al desactivarla. No es una segunda fuente de permisos: nunca debe
 * contener contraseñas ni alterar `state()` ni `profileId`.
 */
@Injectable({ providedIn: 'root' })
export class DemoSessionService {
  private readonly profileIdState = signal<DemoProfileId>(VISITOR_PROFILE_ID);
  private readonly selectedProfileIdState = signal<DemoProfileId>(VISITOR_PROFILE_ID);
  private readonly authenticatedAccountIdState = signal<string | null>(null);

  readonly profileId = this.profileIdState.asReadonly();
  readonly selectedProfileId = this.selectedProfileIdState.asReadonly();
  readonly authenticatedAccountId = this.authenticatedAccountIdState.asReadonly();
  readonly profile = computed<DemoProfile>(() => findDemoProfile(this.profileId()) ?? VISITOR_PROFILE);
  readonly selectedProfile = computed<DemoProfile>(() => findDemoProfile(this.selectedProfileId()) ?? VISITOR_PROFILE);
  readonly isActive = computed(() => this.profileId() !== VISITOR_PROFILE_ID);
  readonly isAdministrative = computed(() => this.profile().administrative);
  readonly state = computed<DemoSessionState>(() => ({
    profileId: this.profileId(),
    profile: this.profile(),
    isActive: this.isActive(),
    isAdministrative: this.isAdministrative(),
  }));

  /**
   * Primitiva interna de activación. Debe usarla `DemoAuthService` después de
   * validar credenciales, o el flujo de acceso directo existente. La interfaz
   * nunca la invoca para perfiles privilegiados antes del inicio de sesión.
   */
  activateProfile(profileId: DemoProfileId, accountId: string | null = null): boolean {
    if (findDemoProfile(profileId) === undefined) {
      return false;
    }

    this.selectedProfileIdState.set(profileId);
    this.profileIdState.set(profileId);
    this.authenticatedAccountIdState.set(accountId);
    return true;
  }

  /** Conserva el comportamiento anterior de selección/activación directa. */
  selectProfile(profileId: DemoProfileId): boolean {
    if (findDemoProfile(profileId) === undefined || profileId === this.profileIdState()) {
      return false;
    }

    return this.activateProfile(profileId);
  }

  /** Indica si el perfil exige el formulario de credenciales simuladas. */
  requiresCredentials(profileId: DemoProfileId): boolean {
    return CREDENTIAL_PROFILE_IDS.includes(profileId);
  }

  /**
   * Fase 5.1: deja el perfil como pendiente de credenciales y revoca
   * inmediatamente los permisos del perfil privilegiado anterior.
   */
  beginCredentialSelection(profileId: DemoProfileId): boolean {
    if (!CREDENTIAL_PROFILE_IDS.includes(profileId)) {
      return false;
    }

    this.selectedProfileIdState.set(profileId);
    this.profileIdState.set(VISITOR_PROFILE_ID);
    this.authenticatedAccountIdState.set(null);
    return true;
  }

  closeSession(): void {
    this.profileIdState.set(VISITOR_PROFILE_ID);
    this.selectedProfileIdState.set(VISITOR_PROFILE_ID);
    this.authenticatedAccountIdState.set(null);
  }
}
