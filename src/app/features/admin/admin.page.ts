import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, IonButton, IonIcon, IonInput } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  bookOutline,
  informationCircleOutline,
  peopleOutline,
  schoolOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';

import { ADMIN_ACCESS_DENIED_QUERY_PARAMS } from '../../core/auth/admin-access.guard';
import type { AdminUserAccount, AuthenticatedRole } from '../../core/auth/auth-domain.types';
import { DemoPermissionsService } from '../../core/auth/demo-permissions.service';
import { INSTRUCTOR_ACCOUNT_REPOSITORY } from '../../core/auth/instructor-account-repository.contract';
import { isAdminUserAccount } from '../../core/auth/instructor-account.validators';
import {
  INSTRUCTOR_REPOSITORY_MESSAGES,
  InstructorRepositoryError,
} from '../../core/auth/supabase-instructor-account.repository';
import { SecondaryPageComponent } from '../../shared/secondary-page/secondary-page.component';

type RoleFilter = AuthenticatedRole | 'all';
type StatusFilter = 'activo' | 'inactivo' | 'all';

/** `public.usuarios` solo registra cuentas autenticadas: nunca aprendices. */
const ACCOUNT_ROLES: readonly AuthenticatedRole[] = ['administrador', 'instructor'];

const ROLE_LABELS: Readonly<Record<AuthenticatedRole, string>> = {
  administrador: 'Administrador',
  instructor: 'Instructor',
};

const INSTRUCTOR_NAME_MIN_LENGTH = 3;
const INSTRUCTOR_NAME_MAX_LENGTH = 32;
const INSTRUCTOR_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const INSTRUCTOR_PASSWORD_MIN_LENGTH = 8;

const INSTRUCTOR_NAME_REQUIRED_ERROR = 'El nombre de usuario es obligatorio.';
const INSTRUCTOR_NAME_SPACES_ERROR = 'El nombre de usuario no puede empezar ni terminar con espacios.';
const INSTRUCTOR_NAME_FORMAT_ERROR =
  'El nombre de usuario debe tener entre 3 y 32 caracteres y usar letras, números, punto, guion o guion bajo.';
const INSTRUCTOR_PASSWORD_REQUIRED_ERROR = 'La contraseña es obligatoria.';
const INSTRUCTOR_PASSWORD_LENGTH_ERROR = 'La contraseña debe tener al menos 8 caracteres.';
const INSTRUCTOR_CONFIRMATION_REQUIRED_ERROR = 'Debes confirmar la contraseña.';
const INSTRUCTOR_PASSWORD_MATCH_ERROR = 'Las contraseñas no coinciden.';

export const INSTRUCTOR_MANAGE_PERMISSION_ERROR = 'No tienes permiso para gestionar instructores.';
export const INSTRUCTOR_CREATED_SUCCESS = 'Instructor creado correctamente.';
export const INSTRUCTOR_DEACTIVATED_SUCCESS = 'Instructor desactivado correctamente.';
export const INSTRUCTOR_REACTIVATED_SUCCESS = 'Instructor reactivado correctamente.';
const INSTRUCTOR_CREATION_UNKNOWN_ERROR = INSTRUCTOR_REPOSITORY_MESSAGES.SERVER;

const LIST_LOADING_MESSAGE = 'Cargando usuarios…';
const LIST_EMPTY_MESSAGE = 'No hay usuarios registrados en el servidor.';
const LIST_FILTERED_EMPTY_MESSAGE = 'No hay usuarios para los filtros seleccionados.';
const STATUS_UPDATING_MESSAGE = 'Actualizando estado del instructor…';

interface RoleSummary {
  readonly role: AuthenticatedRole;
  readonly label: string;
  readonly count: number;
}

@Component({
  selector: 'app-admin',
  templateUrl: './admin.page.html',
  styleUrls: ['./admin.page.scss'],
  imports: [IonButton, IonIcon, IonInput, SecondaryPageComponent],
})
export class AdminPage {
  private readonly permissions = inject(DemoPermissionsService);
  private readonly instructorRepository = inject(INSTRUCTOR_ACCOUNT_REPOSITORY);
  private readonly alertController = inject(AlertController);
  private readonly router = inject(Router);

  /** Generación de carga: descarta respuestas de solicitudes anteriores. */
  private loadGeneration = 0;

  /** Evita abrir dos diálogos de confirmación para la misma acción. */
  private confirmationInProgress = false;

  readonly canAccess = computed(() => this.permissions.can('admin:access'));
  readonly canManageInstructors = computed(() => this.permissions.can('instructors:manage'));

  readonly users = signal<readonly AdminUserAccount[]>([]);
  readonly usersLoading = signal(false);
  readonly usersError = signal<string | null>(null);

  readonly totalUsers = computed(() => this.users().length);
  readonly activeUsers = computed(() => this.users().filter((user) => user.activo).length);
  readonly inactiveUsers = computed(() => this.totalUsers() - this.activeUsers());
  readonly roleSummaries = computed<readonly RoleSummary[]>(() =>
    ACCOUNT_ROLES.map((role) => ({
      role,
      label: ROLE_LABELS[role],
      count: this.users().filter((user) => user.rol === role).length,
    })),
  );

  readonly roleFilters: readonly { readonly value: RoleFilter; readonly label: string }[] = [
    { value: 'all', label: 'Todos' },
    ...ACCOUNT_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] })),
  ];
  readonly statusFilters: readonly { readonly value: StatusFilter; readonly label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'activo', label: 'Activos' },
    { value: 'inactivo', label: 'Inactivos' },
  ];

  readonly roleFilter = signal<RoleFilter>('all');
  readonly statusFilter = signal<StatusFilter>('all');

  readonly filteredUsers = computed(() => {
    if (!this.canAccess()) {
      return [];
    }

    const role = this.roleFilter();
    const status = this.statusFilter();

    return this.users().filter(
      (user) =>
        (role === 'all' || user.rol === role) &&
        (status === 'all' || (status === 'activo' ? user.activo : !user.activo)),
    );
  });
  readonly emptyUsersMessage = computed(() =>
    this.roleFilter() === 'all' && this.statusFilter() === 'all' ? LIST_EMPTY_MESSAGE : LIST_FILTERED_EMPTY_MESSAGE,
  );
  readonly listLoadingMessage = LIST_LOADING_MESSAGE;
  readonly statusUpdatingMessage = STATUS_UPDATING_MESSAGE;

  /** Identificador en curso: hay una sola operación de estado a la vez. */
  readonly updatingUserId = signal<string | null>(null);
  readonly statusUpdateSuccess = signal<string | null>(null);
  readonly statusUpdateError = signal<string | null>(null);
  readonly failedStatusUserId = signal<string | null>(null);

  readonly registeringInstructor = signal(false);
  readonly instructorUsername = signal('');
  readonly instructorPassword = signal('');
  readonly instructorConfirmation = signal('');
  readonly registrationError = signal<string | null>(null);
  readonly registrationSuccess = signal<string | null>(null);

  constructor() {
    addIcons({
      bookOutline,
      informationCircleOutline,
      peopleOutline,
      schoolOutline,
      shieldCheckmarkOutline,
    });

    effect(() => {
      if (!this.canAccess()) {
        void this.router.navigate(['/tabs/mas'], {
          queryParams: ADMIN_ACCESS_DENIED_QUERY_PARAMS,
          replaceUrl: true,
        });
      }
    });

    effect(() => {
      if (this.canAccess()) {
        // `loadUsers()` lee estados reactivos internos; sin `untracked` el propio
        // efecto se volvería a disparar al cambiar `usersLoading` y generaría un bucle.
        void untracked(() => this.loadUsers());
      } else {
        // Invalida respuestas en vuelo antes de limpiar la vista restringida.
        this.loadGeneration += 1;
        this.users.set([]);
        this.usersLoading.set(false);
        this.usersError.set(null);
        this.updatingUserId.set(null);
        this.statusUpdateSuccess.set(null);
        this.statusUpdateError.set(null);
        this.failedStatusUserId.set(null);
      }
    });
  }

  /** Carga real. Reentradas se ignoran y respuestas anteriores se descartan. */
  async loadUsers(): Promise<void> {
    if (!this.canAccess() || this.usersLoading()) {
      return;
    }

    const generation = ++this.loadGeneration;
    this.usersLoading.set(true);
    this.usersError.set(null);

    try {
      const response = await this.instructorRepository.list();
      if (generation !== this.loadGeneration) {
        return;
      }

      const accounts: AdminUserAccount[] = [];
      for (const row of response) {
        if (!isAdminUserAccount(row)) {
          throw new InstructorRepositoryError('INVALID_RESPONSE');
        }
        accounts.push({ id: row.id, nombre: row.nombre, rol: row.rol, activo: row.activo });
      }

      this.users.set(accounts);
    } catch (error) {
      if (generation !== this.loadGeneration) {
        return;
      }

      this.users.set([]);
      this.usersError.set(
        error instanceof InstructorRepositoryError ? error.message : INSTRUCTOR_REPOSITORY_MESSAGES.LIST_FAILED,
      );
    } finally {
      if (generation === this.loadGeneration) {
        this.usersLoading.set(false);
      }
    }
  }

  setRoleFilter(value: RoleFilter): void {
    if (!this.canAccess()) {
      return;
    }

    this.roleFilter.set(value);
  }

  clearRoleFilter(): void {
    this.setRoleFilter('all');
  }

  setStatusFilter(value: StatusFilter): void {
    if (!this.canAccess()) {
      return;
    }

    this.statusFilter.set(value);
  }

  clearStatusFilter(): void {
    this.setStatusFilter('all');
  }

  roleLabel(role: AuthenticatedRole): string {
    return ROLE_LABELS[role];
  }

  statusLabel(activo: boolean): string {
    return activo ? 'Activo' : 'Inactivo';
  }

  iconForRole(role: AuthenticatedRole): string {
    return role === 'administrador' ? 'shield-checkmark-outline' : 'school-outline';
  }

  /**
   * Punto de entrada de la interfaz: nunca muta el listado ni envía nada al
   * servidor hasta que la confirmación explícita devuelve `confirm`.
   */
  async confirmStatusChange(user: AdminUserAccount, activo: boolean): Promise<void> {
    if (
      !this.canAccess() ||
      !this.canManageInstructors() ||
      user.rol !== 'instructor' ||
      this.updatingUserId() !== null ||
      this.confirmationInProgress
    ) {
      return;
    }

    this.confirmationInProgress = true;
    let role: string | undefined;

    try {
      const action = activo ? 'reactivar' : 'desactivar';
      const alert = await this.alertController.create({
        header: activo ? 'Reactivar instructor' : 'Desactivar instructor',
        message: `¿Deseas ${action} la cuenta de ${user.nombre}? El cambio se aplicará en el servidor y el listado se actualizará con la respuesta real.`,
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          { text: activo ? 'Reactivar' : 'Desactivar', role: 'confirm' },
        ],
      });

      await alert.present();
      role = (await alert.onDidDismiss()).role;
    } finally {
      this.confirmationInProgress = false;
    }

    if (role !== 'confirm' || this.updatingUserId() !== null || !this.canAccess() || !this.canManageInstructors()) {
      return;
    }

    await this.applyStatusChange(user, activo);
  }

  /** Un reintento vuelve a pedir confirmación; no dispara la operación a ciegas. */
  retryStatusChange(user: AdminUserAccount): void {
    if (user.rol !== 'instructor') {
      return;
    }

    void this.confirmStatusChange(user, !user.activo);
  }

  private async applyStatusChange(user: AdminUserAccount, activo: boolean): Promise<void> {
    if (this.updatingUserId() !== null) {
      return;
    }

    this.updatingUserId.set(user.id);
    this.statusUpdateSuccess.set(null);
    this.statusUpdateError.set(null);
    this.failedStatusUserId.set(null);

    try {
      await this.instructorRepository.setActive(user.id, activo);
      this.statusUpdateSuccess.set(activo ? INSTRUCTOR_REACTIVATED_SUCCESS : INSTRUCTOR_DEACTIVATED_SUCCESS);
    } catch (error) {
      this.statusUpdateError.set(
        error instanceof InstructorRepositoryError
          ? error.message
          : INSTRUCTOR_REPOSITORY_MESSAGES.STATUS_UPDATE_FAILED,
      );
      this.failedStatusUserId.set(user.id);
    } finally {
      this.updatingUserId.set(null);
    }

    // La recarga es best-effort: el resultado de la operación ya fue confirmado
    // por el servidor y no debe borrarse si el listado falla después.
    if (this.statusUpdateSuccess() !== null) {
      await this.loadUsers();
    }
  }

  onInstructorUsernameInput(event: CustomEvent<{ value?: string | null }>): void {
    this.instructorUsername.set(event.detail.value ?? '');
  }

  onInstructorPasswordInput(event: CustomEvent<{ value?: string | null }>): void {
    this.instructorPassword.set(event.detail.value ?? '');
  }

  onInstructorConfirmationInput(event: CustomEvent<{ value?: string | null }>): void {
    this.instructorConfirmation.set(event.detail.value ?? '');
  }

  async registerInstructor(event?: Event): Promise<void> {
    event?.preventDefault();

    // El guard se activa antes de cualquier espera: evita dobles envíos.
    if (this.registeringInstructor()) {
      return;
    }

    if (!this.canManageInstructors()) {
      this.registrationError.set(INSTRUCTOR_MANAGE_PERMISSION_ERROR);
      this.registrationSuccess.set(null);
      return;
    }

    const validationError = this.validateInstructorInput();
    if (validationError !== null) {
      this.registrationError.set(validationError);
      this.registrationSuccess.set(null);
      return;
    }

    this.registeringInstructor.set(true);
    this.registrationError.set(null);
    this.registrationSuccess.set(null);

    try {
      await this.instructorRepository.create({
        nombre: this.instructorUsername(),
        password: this.instructorPassword(),
      });

      // Solo se limpian los campos cuando el servidor confirmó la creación.
      this.registrationError.set(null);
      this.registrationSuccess.set(INSTRUCTOR_CREATED_SUCCESS);
      this.instructorUsername.set('');
      this.instructorPassword.set('');
      this.instructorConfirmation.set('');
    } catch (error) {
      this.registrationError.set(
        error instanceof InstructorRepositoryError ? error.message : INSTRUCTOR_CREATION_UNKNOWN_ERROR,
      );
      this.registrationSuccess.set(null);
    } finally {
      this.registeringInstructor.set(false);
    }

    // La recarga es best-effort y va fuera del alta: nunca altera su resultado.
    if (this.registrationSuccess() !== null) {
      await this.loadUsers();
    }
  }

  private validateInstructorInput(): string | null {
    const nombre = this.instructorUsername();
    const password = this.instructorPassword();
    const confirmation = this.instructorConfirmation();

    if (nombre.trim().length === 0) {
      return INSTRUCTOR_NAME_REQUIRED_ERROR;
    }
    if (nombre !== nombre.trim()) {
      return INSTRUCTOR_NAME_SPACES_ERROR;
    }
    if (
      nombre.length < INSTRUCTOR_NAME_MIN_LENGTH ||
      nombre.length > INSTRUCTOR_NAME_MAX_LENGTH ||
      !INSTRUCTOR_NAME_PATTERN.test(nombre)
    ) {
      return INSTRUCTOR_NAME_FORMAT_ERROR;
    }
    if (password.length === 0) {
      return INSTRUCTOR_PASSWORD_REQUIRED_ERROR;
    }
    if (password.length < INSTRUCTOR_PASSWORD_MIN_LENGTH) {
      return INSTRUCTOR_PASSWORD_LENGTH_ERROR;
    }
    if (confirmation.length === 0) {
      return INSTRUCTOR_CONFIRMATION_REQUIRED_ERROR;
    }
    if (password !== confirmation) {
      return INSTRUCTOR_PASSWORD_MATCH_ERROR;
    }

    return null;
  }
}
