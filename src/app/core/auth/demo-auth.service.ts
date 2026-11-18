import { computed, Injectable, inject, signal } from '@angular/core';

import { DEMO_CREDENTIALS } from './demo-credentials';
import { DemoPermissionsService } from './demo-permissions.service';
import type { DemoProfileId } from './demo-profiles';
import { DemoSessionService } from './demo-session.service';

/** Mensaje único e explícito para cualquier credencial rechazada en la demo. */
export const DEMO_LOGIN_ERROR = 'Credenciales incorrectas. Verifica el perfil seleccionado.';
export const DEMO_INACTIVE_INSTRUCTOR_ERROR = 'Esta cuenta de Instructor está inactiva. No puede iniciar sesión.';

export const DEMO_INSTRUCTOR_SUCCESS = 'Instructor registrado correctamente.';
export const DEMO_INSTRUCTOR_DEACTIVATED_SUCCESS = 'Instructor desactivado correctamente.';
export const DEMO_INSTRUCTOR_PERMISSION_ERROR = 'No tienes permiso para gestionar instructores.';
export const DEMO_INSTRUCTOR_USERNAME_REQUIRED_ERROR = 'El nombre de usuario es obligatorio.';
export const DEMO_INSTRUCTOR_USERNAME_SPACES_ERROR = 'El nombre de usuario no puede empezar ni terminar con espacios.';
export const DEMO_INSTRUCTOR_USERNAME_FORMAT_ERROR =
  'El nombre de usuario debe tener entre 3 y 32 caracteres y usar letras, números, punto, guion o guion bajo.';
export const DEMO_INSTRUCTOR_DUPLICATE_ERROR = 'Ya existe una cuenta con ese nombre de usuario.';
export const DEMO_INSTRUCTOR_PASSWORD_REQUIRED_ERROR = 'La contraseña es obligatoria.';
export const DEMO_INSTRUCTOR_PASSWORD_LENGTH_ERROR = 'La contraseña debe tener al menos 8 caracteres.';
export const DEMO_INSTRUCTOR_CONFIRMATION_REQUIRED_ERROR = 'Debes confirmar la contraseña.';
export const DEMO_INSTRUCTOR_PASSWORD_MATCH_ERROR = 'Las contraseñas no coinciden.';
export const DEMO_INSTRUCTOR_NOT_FOUND_ERROR = 'No se encontró la cuenta de Instructor.';
export const DEMO_INSTRUCTOR_ALREADY_INACTIVE_ERROR = 'La cuenta ya está inactiva.';

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 32;
const PASSWORD_MIN_LENGTH = 8;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;

export type DemoInstructorStatus = 'activo' | 'inactivo';

/** Vista pública de una cuenta: nunca incluye la credencial. */
export interface DemoInstructorAccount {
  readonly id: string;
  readonly username: string;
  readonly role: 'Instructor';
  readonly status: DemoInstructorStatus;
}

export type DemoAuthResult =
  { readonly ok: true; readonly profileId: DemoProfileId } | { readonly ok: false; readonly error: string };

export type DemoInstructorMutationResult =
  | { readonly ok: true; readonly message: string; readonly account: DemoInstructorAccount }
  | { readonly ok: false; readonly error: string };

interface DemoStoredAccount {
  readonly id: string;
  readonly username: string;
  readonly usernameKey: string;
  readonly password: string;
  readonly profileId: DemoProfileId;
  readonly role: 'Administrador' | 'Instructor';
  readonly status: DemoInstructorStatus;
}

function usernameKey(username: string): string {
  return username.toLowerCase();
}

function toPublicInstructor(account: DemoStoredAccount): DemoInstructorAccount {
  return {
    id: account.id,
    username: account.username,
    role: 'Instructor',
    status: account.status,
  };
}

const INITIAL_ACCOUNTS: readonly DemoStoredAccount[] = DEMO_CREDENTIALS.map((credential) => ({
  id: credential.profileId === 'administrador' ? 'ADM-DMO-001' : 'INS-DMO-001',
  username: credential.username,
  usernameKey: usernameKey(credential.username),
  password: credential.password,
  profileId: credential.profileId,
  role: credential.profileId === 'administrador' ? 'Administrador' : 'Instructor',
  status: 'activo',
}));

/**
 * Autenticación SIMULADA de la Fase 5.1 ampliada en la Fase 5.1.1.
 *
 * No es seguridad real: compara valores quemados en el cliente y solo activa
 * el perfil en la sesión cuando coinciden usuario, contraseña y perfil
 * solicitado. Las cuentas de Instructores registrados viven únicamente en una
 * signal de memoria: desaparecen al recargar. No emite tokens, no consulta
 * APIs, no persiste en localStorage/sessionStorage/IndexedDB, no escribe
 * contraseñas en logs ni las expone en el listado público. Debe seguir siendo
 * solo una demostración académica; nunca debe proteger hardware ni datos reales.
 */
@Injectable({ providedIn: 'root' })
export class DemoAuthService {
  private readonly session = inject(DemoSessionService);
  private readonly permissions = inject(DemoPermissionsService);
  private nextInstructorNumber = 2;

  private readonly accounts = signal<readonly DemoStoredAccount[]>(INITIAL_ACCOUNTS.map((account) => ({ ...account })));

  /** Listado reactivo y público: deliberadamente no contiene credenciales. */
  readonly instructorAccounts = computed<readonly DemoInstructorAccount[]>(() =>
    this.accounts()
      .filter((account) => account.role === 'Instructor')
      .map(toPublicInstructor),
  );

  authenticate(username: string, password: string, requestedProfileId: DemoProfileId): DemoAuthResult {
    const normalizedUsername = username.trim();
    const account = this.accounts().find(
      (candidate) => candidate.username === normalizedUsername && candidate.profileId === requestedProfileId,
    );

    if (account === undefined) {
      return { ok: false, error: DEMO_LOGIN_ERROR };
    }

    if (account.status === 'inactivo') {
      return { ok: false, error: DEMO_INACTIVE_INSTRUCTOR_ERROR };
    }

    if (account.password !== password) {
      return { ok: false, error: DEMO_LOGIN_ERROR };
    }

    this.session.activateProfile(account.profileId, account.id);
    return { ok: true, profileId: account.profileId };
  }

  registerInstructor(username: string, password: string, confirmation: string): DemoInstructorMutationResult {
    const denied = this.requireManagementPermission();
    if (denied !== null) {
      return { ok: false, error: denied };
    }

    const normalizedUsername = username.trim();

    if (normalizedUsername.length === 0) {
      return { ok: false, error: DEMO_INSTRUCTOR_USERNAME_REQUIRED_ERROR };
    }

    if (username !== normalizedUsername) {
      return { ok: false, error: DEMO_INSTRUCTOR_USERNAME_SPACES_ERROR };
    }

    if (
      normalizedUsername.length < USERNAME_MIN_LENGTH ||
      normalizedUsername.length > USERNAME_MAX_LENGTH ||
      !USERNAME_PATTERN.test(normalizedUsername)
    ) {
      return { ok: false, error: DEMO_INSTRUCTOR_USERNAME_FORMAT_ERROR };
    }

    if (this.accounts().some((account) => account.usernameKey === usernameKey(normalizedUsername))) {
      return { ok: false, error: DEMO_INSTRUCTOR_DUPLICATE_ERROR };
    }

    if (password.length === 0) {
      return { ok: false, error: DEMO_INSTRUCTOR_PASSWORD_REQUIRED_ERROR };
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      return { ok: false, error: DEMO_INSTRUCTOR_PASSWORD_LENGTH_ERROR };
    }

    if (confirmation.length === 0) {
      return { ok: false, error: DEMO_INSTRUCTOR_CONFIRMATION_REQUIRED_ERROR };
    }

    if (password !== confirmation) {
      return { ok: false, error: DEMO_INSTRUCTOR_PASSWORD_MATCH_ERROR };
    }

    const account: DemoStoredAccount = {
      id: `INS-${String(this.nextInstructorNumber).padStart(3, '0')}`,
      username: normalizedUsername,
      usernameKey: usernameKey(normalizedUsername),
      password,
      profileId: 'instructor',
      role: 'Instructor',
      status: 'activo',
    };

    this.nextInstructorNumber += 1;
    this.accounts.update((accounts) => [...accounts, account]);

    return { ok: true, message: DEMO_INSTRUCTOR_SUCCESS, account: toPublicInstructor(account) };
  }

  deactivateInstructor(accountId: string): DemoInstructorMutationResult {
    const denied = this.requireManagementPermission();
    if (denied !== null) {
      return { ok: false, error: denied };
    }

    const account = this.accounts().find((candidate) => candidate.id === accountId && candidate.role === 'Instructor');

    if (account === undefined) {
      return { ok: false, error: DEMO_INSTRUCTOR_NOT_FOUND_ERROR };
    }

    if (account.status === 'inactivo') {
      return { ok: false, error: DEMO_INSTRUCTOR_ALREADY_INACTIVE_ERROR };
    }

    const deactivated: DemoStoredAccount = { ...account, status: 'inactivo' };
    this.accounts.update((accounts) =>
      accounts.map((candidate) => (candidate.id === accountId ? deactivated : candidate)),
    );

    if (this.session.authenticatedAccountId() === accountId) {
      this.session.closeSession();
    }

    return {
      ok: true,
      message: DEMO_INSTRUCTOR_DEACTIVATED_SUCCESS,
      account: toPublicInstructor(deactivated),
    };
  }

  private requireManagementPermission(): string | null {
    if (!this.permissions.can('instructors:manage') || this.session.profileId() !== 'administrador') {
      return DEMO_INSTRUCTOR_PERMISSION_ERROR;
    }

    return null;
  }
}
