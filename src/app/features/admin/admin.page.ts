import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, IonButton, IonIcon, IonInput } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  bookOutline,
  informationCircleOutline,
  peopleOutline,
  personOutline,
  schoolOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';

import { ADMIN_ACCESS_DENIED_QUERY_PARAMS } from '../../core/auth/admin-access.guard';
import {
  DEMO_INSTRUCTOR_PERMISSION_ERROR,
  DemoAuthService,
  type DemoInstructorAccount,
} from '../../core/auth/demo-auth.service';
import { DemoPermissionsService } from '../../core/auth/demo-permissions.service';
import { DemoSessionService } from '../../core/auth/demo-session.service';
import { SecondaryPageComponent } from '../../shared/secondary-page/secondary-page.component';

import {
  DEMO_ADMIN_ROLE_LABELS,
  DEMO_ADMIN_ROLES,
  DEMO_ADMIN_STATUS_LABELS,
  DEMO_ADMIN_USERS,
  type DemoAdminRole,
  type DemoAdminUserStatus,
} from './data/demo-admin-users';

type RoleFilter = DemoAdminRole | 'all';
type StatusFilter = DemoAdminUserStatus | 'all';

const DEMO_ADMIN_STATUSES: readonly DemoAdminUserStatus[] = ['activo', 'solo-lectura'];

interface RoleSummary {
  readonly role: DemoAdminRole;
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
  private readonly session = inject(DemoSessionService);
  private readonly auth = inject(DemoAuthService);
  private readonly alertController = inject(AlertController);
  private readonly router = inject(Router);
  private readonly confirmingDeactivation = signal(false);

  readonly activeProfile = this.session.profile;
  readonly canAccess = computed(() => this.permissions.can('admin:access'));
  readonly canManageInstructors = computed(() => this.permissions.can('instructors:manage'));
  readonly instructorAccounts = this.auth.instructorAccounts;
  readonly users = DEMO_ADMIN_USERS;
  readonly totalUsers = DEMO_ADMIN_USERS.length;
  readonly activeUsers = DEMO_ADMIN_USERS.filter((user) => user.status === 'activo').length;
  readonly readOnlyUsers = DEMO_ADMIN_USERS.filter((user) => user.status === 'solo-lectura').length;
  readonly roleSummaries: readonly RoleSummary[] = DEMO_ADMIN_ROLES.map((role) => ({
    role,
    label: DEMO_ADMIN_ROLE_LABELS[role],
    count: DEMO_ADMIN_USERS.filter((user) => user.role === role).length,
  }));
  readonly roleFilters: readonly { readonly value: RoleFilter; readonly label: string }[] = [
    { value: 'all', label: 'Todos' },
    ...DEMO_ADMIN_ROLES.map((role) => ({ value: role, label: DEMO_ADMIN_ROLE_LABELS[role] })),
  ];
  readonly statusFilters: readonly { readonly value: StatusFilter; readonly label: string }[] = [
    { value: 'all', label: 'Todos' },
    ...DEMO_ADMIN_STATUSES.map((status) => ({ value: status, label: DEMO_ADMIN_STATUS_LABELS[status] })),
  ];
  readonly roleFilter = signal<RoleFilter>('all');
  readonly statusFilter = signal<StatusFilter>('all');
  readonly instructorUsername = signal('');
  readonly instructorPassword = signal('');
  readonly instructorConfirmation = signal('');
  readonly registrationError = signal<string | null>(null);
  readonly registrationSuccess = signal<string | null>(null);
  readonly deactivationError = signal<string | null>(null);
  readonly deactivationNotice = signal<string | null>(null);
  readonly filteredUsers = computed(() => {
    if (!this.canAccess()) {
      return [];
    }

    const role = this.roleFilter();
    const status = this.statusFilter();

    return this.users.filter(
      (user) => (role === 'all' || user.role === role) && (status === 'all' || user.status === status),
    );
  });

  constructor() {
    addIcons({
      bookOutline,
      informationCircleOutline,
      peopleOutline,
      personOutline,
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
  }

  setRoleFilter(value: RoleFilter): void {
    if (!this.canAccess()) {
      return;
    }

    this.roleFilter.set(value);
  }

  clearRoleFilter(): void {
    if (!this.canAccess()) {
      return;
    }

    this.roleFilter.set('all');
  }

  setStatusFilter(value: StatusFilter): void {
    if (!this.canAccess()) {
      return;
    }

    this.statusFilter.set(value);
  }

  clearStatusFilter(): void {
    if (!this.canAccess()) {
      return;
    }

    this.statusFilter.set('all');
  }

  roleLabel(role: DemoAdminRole): string {
    return DEMO_ADMIN_ROLE_LABELS[role];
  }

  statusLabel(status: DemoAdminUserStatus): string {
    return DEMO_ADMIN_STATUS_LABELS[status];
  }

  iconForRole(role: DemoAdminRole): string {
    switch (role) {
      case 'administrador':
        return 'shield-checkmark-outline';
      case 'instructor':
        return 'school-outline';
      case 'aprendiz':
        return 'book-outline';
      case 'visitante':
        return 'person-outline';
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

  registerInstructor(event?: Event): void {
    event?.preventDefault();

    if (!this.canManageInstructors()) {
      this.registrationError.set(DEMO_INSTRUCTOR_PERMISSION_ERROR);
      this.registrationSuccess.set(null);
      return;
    }

    const result = this.auth.registerInstructor(
      this.instructorUsername(),
      this.instructorPassword(),
      this.instructorConfirmation(),
    );

    if (!result.ok) {
      this.registrationError.set(result.error);
      this.registrationSuccess.set(null);
      return;
    }

    this.registrationError.set(null);
    this.registrationSuccess.set(result.message);
    this.instructorUsername.set('');
    this.instructorPassword.set('');
    this.instructorConfirmation.set('');
  }

  async deactivateInstructor(account: DemoInstructorAccount): Promise<void> {
    if (!this.canManageInstructors() || this.confirmingDeactivation() || account.status === 'inactivo') {
      return;
    }

    const accountId = account.id;
    this.confirmingDeactivation.set(true);
    this.deactivationError.set(null);
    this.deactivationNotice.set(null);

    try {
      const confirmation = await this.alertController.create({
        header: 'Desactivar instructor',
        message: '¿Deseas desactivar esta cuenta de Instructor? No podrá iniciar sesión mientras permanezca inactiva.',
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          {
            text: 'Desactivar',
            handler: () => this.confirmDeactivation(accountId),
          },
        ],
      });

      await confirmation.present();
      await confirmation.onDidDismiss();
    } finally {
      this.confirmingDeactivation.set(false);
    }
  }

  private confirmDeactivation(accountId: string): void {
    // El permiso se comprueba de nuevo tras el diálogo y también dentro del
    // servicio, por si el perfil cambió mientras la confirmación estaba abierta.
    if (!this.canManageInstructors()) {
      return;
    }

    const result = this.auth.deactivateInstructor(accountId);

    if (!result.ok) {
      this.deactivationError.set(result.error);
      return;
    }

    this.deactivationError.set(null);
    this.deactivationNotice.set(result.message);
  }
}
