import { computed, Injectable, signal } from '@angular/core';

import type { AuthenticatedAccount, PublicRole, SessionSnapshot, SessionStatus } from './auth-domain.types';
import {
  DEFAULT_PROFILE,
  DEFAULT_PROFILE_ID,
  findDemoProfile,
  type DemoProfile,
  type DemoProfileId,
} from './demo-profiles';
import type { SessionFacade } from './session-facade.contract';
import { isAuthenticatedRole, isVerifiedIdentity, type VerifiedIdentity } from './supabase-auth-claims';

export interface DemoSessionState {
  readonly profileId: DemoProfileId;
  readonly profile: DemoProfile;
  readonly isActive: boolean;
  readonly isAdministrative: boolean;
}

/** Perfiles que requieren el formulario de credenciales de Supabase Auth. */
const CREDENTIAL_PROFILE_IDS: readonly DemoProfileId[] = ['administrador', 'instructor'];

/**
 * Única fuente de verdad de Signals,rol e identidad.
 *
 * Fase 5.3.4.D: los métodos heredados `activateProfile`, `selectProfile` y
 * `setAuthenticatedAccount` ya NO pueden conceder roles privilegiados. Solo
 * `publishVerifiedIdentity` acepta una identidad construida desde claims
 * validados por Supabase y comprueba su marca en runtime. Aprendiz conserva su
 * acceso público; cualquier otra transición deja el estado en Aprendiz.
 */
@Injectable({ providedIn: 'root' })
export class DemoSessionService implements SessionFacade {
  private readonly profileIdState = signal<DemoProfileId>(DEFAULT_PROFILE_ID);
  private readonly selectedProfileIdState = signal<DemoProfileId>(DEFAULT_PROFILE_ID);
  private readonly authenticatedAccountIdState = signal<string | null>(null);
  private readonly authenticatedAccountState = signal<AuthenticatedAccount | null>(null);

  /**
   * Arranca en `inicializando` para que ningún consumidor pueda mostrar
   * privilegios antes de validar el token. `SupabaseSessionService` solo orquesta
   * Supabase y delega aquí cada transición.
   */
  private readonly statusState = signal<SessionStatus>('inicializando');
  private readonly readyResolvers: ((snapshot: SessionSnapshot) => void)[] = [];

  readonly profileId = this.profileIdState.asReadonly();
  readonly selectedProfileId = this.selectedProfileIdState.asReadonly();
  readonly authenticatedAccountId = this.authenticatedAccountIdState.asReadonly();
  readonly authenticatedAccount = this.authenticatedAccountState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly profile = computed<DemoProfile>(() => findDemoProfile(this.profileId()) ?? DEFAULT_PROFILE);
  readonly selectedProfile = computed<DemoProfile>(() => findDemoProfile(this.selectedProfileId()) ?? DEFAULT_PROFILE);
  readonly isActive = computed(() => this.profileId() !== DEFAULT_PROFILE_ID);
  readonly isAdministrative = computed(() => this.profile().administrative);
  readonly state = computed<DemoSessionState>(() => ({
    profileId: this.profileId(),
    profile: this.profile(),
    isActive: this.isActive(),
    isAdministrative: this.isAdministrative(),
  }));

  /** Vista reactiva interna del contrato, coherente con el ciclo de vida real. */
  private readonly snapshotState = computed<SessionSnapshot>(() => ({
    status: this.statusState(),
    role: this.profileId(),
    account: this.authenticatedAccount(),
  }));

  /** Acceso puntual al contrato; la reactividad pública sigue en las signals anteriores. */
  get snapshot(): SessionSnapshot {
    return this.snapshotState();
  }

  /** Se resuelve cuando la restauración/validación en curso termina en `lista`. */
  whenReady(): Promise<SessionSnapshot> {
    if (this.statusState() === 'lista') {
      return Promise.resolve(this.snapshot);
    }

    return new Promise<SessionSnapshot>((resolve) => {
      this.readyResolvers.push(resolve);
    });
  }

  /** Marca el inicio de una restauración o revalidación sin tocar la identidad. */
  beginInitialization(): void {
    this.statusState.set('inicializando');
  }

  /** Cierra el ciclo de espera. Idempotente; no concede permisos por sí mismo. */
  finishInitialization(): void {
    if (this.statusState() === 'lista') {
      return;
    }

    this.statusState.set('lista');
    for (const resolve of this.readyResolvers.splice(0)) {
      resolve(this.snapshot);
    }
  }

  /**
   * Revoca de forma sincrónica la identidad privilegiada mientras se valida un
   * token nuevo. Así nunca queda un rol visible durante la revalidación.
   */
  suspendForValidation(): void {
    this.statusState.set('inicializando');
    this.profileIdState.set(DEFAULT_PROFILE_ID);
    this.selectedProfileIdState.set(DEFAULT_PROFILE_ID);
    this.authenticatedAccountIdState.set(null);
    this.authenticatedAccountState.set(null);
  }

  /** Cancela una selección pendiente del formulario sin cerrar una sesión real. */
  cancelCredentialSelection(): void {
    this.selectedProfileIdState.set(DEFAULT_PROFILE_ID);
  }

  selectPublicRole(role: PublicRole): void {
    this.activateProfile(role);
  }

  clear(): void {
    this.closeSession();
  }

  /**
   * Único mecanismo de publicación de una identidad privilegiada.
   *
   * La marca se comprueba en runtime (no basta el tipo de TypeScript) y se
   * validan las invariantes del propio estado: rol autenticado, id y nombre
   * presentes. Todo se publica en un único grupo de señales para evitar una
   * identidad a medias entre `profileId` y `authenticatedAccount`.
   */
  publishVerifiedIdentity(identity: VerifiedIdentity): boolean {
    if (!isVerifiedIdentity(identity)) {
      return false;
    }

    const account = identity.account;
    if (!isAuthenticatedRole(account.role) || account.id.length === 0 || account.nombre.length === 0) {
      return false;
    }

    this.profileIdState.set(account.role);
    this.selectedProfileIdState.set(account.role);
    this.authenticatedAccountIdState.set(account.id);
    this.authenticatedAccountState.set(account);
    this.finishInitialization();
    return true;
  }

  /**
   * API heredada conservada solo para el acceso público de Aprendiz.
   * Cualquier rol privilegiado se rechaza aunque se invoque directamente.
   */
  activateProfile(profileId: DemoProfileId): boolean {
    if (profileId !== DEFAULT_PROFILE_ID) {
      return false;
    }

    this.selectedProfileIdState.set(DEFAULT_PROFILE_ID);
    this.profileIdState.set(DEFAULT_PROFILE_ID);
    this.authenticatedAccountIdState.set(null);
    this.authenticatedAccountState.set(null);
    this.finishInitialization();
    return true;
  }

  /** Selección visual/heredada: nunca activa Administrador ni Instructor. */
  selectProfile(profileId: DemoProfileId): boolean {
    if (findDemoProfile(profileId) === undefined) {
      return false;
    }

    if (profileId === this.profileIdState()) {
      // Aprendiz ya es el estado público: no cambia el rol, pero sí cierra
      // cualquier espera de inicialización para no bloquear guards asíncronos.
      this.finishInitialization();
      return false;
    }

    return this.activateProfile(profileId);
  }

  /** Indica si el perfil exige Supabase Auth. */
  requiresCredentials(profileId: DemoProfileId): boolean {
    return CREDENTIAL_PROFILE_IDS.includes(profileId);
  }

  /**
   * Deja el perfil como pendiente de credenciales y revoca inmediatamente los
   * permisos del perfil privilegiado anterior.
   */
  beginCredentialSelection(profileId: DemoProfileId): boolean {
    if (!CREDENTIAL_PROFILE_IDS.includes(profileId)) {
      return false;
    }

    this.selectedProfileIdState.set(profileId);
    this.profileIdState.set(DEFAULT_PROFILE_ID);
    this.authenticatedAccountIdState.set(null);
    this.authenticatedAccountState.set(null);
    this.finishInitialization();
    return true;
  }

  /**
   * Compatibilidad con consumidores antiguos: `null` limpia la identidad.
   * Un objeto plano nunca se acepta como identidad; debe publicarse con
   * `publishVerifiedIdentity` después de validar los claims del JWT.
   */
  setAuthenticatedAccount(account: AuthenticatedAccount | null): void {
    if (account === null) {
      this.closeSession();
    }
  }

  closeSession(): void {
    this.profileIdState.set(DEFAULT_PROFILE_ID);
    this.selectedProfileIdState.set(DEFAULT_PROFILE_ID);
    this.authenticatedAccountIdState.set(null);
    this.authenticatedAccountState.set(null);
    this.finishInitialization();
  }
}
