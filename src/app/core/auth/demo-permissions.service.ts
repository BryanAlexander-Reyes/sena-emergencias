import { computed, Injectable, inject } from '@angular/core';

import { type DemoProfileId } from './demo-profiles';
import { DemoSessionService } from './demo-session.service';

export type DemoPermission =
  | 'occupancy:update'
  | 'occupancy:reset'
  | 'sensors:control'
  | 'sensors:reset'
  | 'alerts:review'
  | 'alarm:control'
  | 'admin:access'
  | 'instructors:manage'
  | 'zones:manage';

export const DEMO_PERMISSIONS: readonly DemoPermission[] = [
  'occupancy:update',
  'occupancy:reset',
  'sensors:control',
  'sensors:reset',
  'alerts:review',
  'alarm:control',
  'admin:access',
  'instructors:manage',
  'zones:manage',
];

const ADMINISTRATOR_PERMISSIONS: readonly DemoPermission[] = DEMO_PERMISSIONS;
const READ_ONLY_PERMISSIONS: readonly DemoPermission[] = [];

/**
 * Fase 4.6 / 5.1.1, ZONAS.2: el Instructor controla únicamente la alarma
 * simulada. No recibe `admin:access`, `instructors:manage`, `zones:manage` ni
 * permisos de ocupación, sensores o revisión de alertas.
 */
const INSTRUCTOR_PERMISSIONS: readonly DemoPermission[] = ['alarm:control'];

const PERMISSIONS_BY_PROFILE: Readonly<Record<DemoProfileId, readonly DemoPermission[]>> = {
  administrador: ADMINISTRATOR_PERMISSIONS,
  instructor: INSTRUCTOR_PERMISSIONS,
  aprendiz: READ_ONLY_PERMISSIONS,
};

@Injectable({ providedIn: 'root' })
export class DemoPermissionsService {
  private readonly session = inject(DemoSessionService);

  /**
   * Fase 5.3.4.D: el perfil por sí solo no basta. Se exige estado `lista`,
   * identidad publicada y coherencia entre el rol del snapshot y el de la
   * cuenta validada. Durante restauración/renovación o tras cierre no hay
   * privilegios, aunque quede un rol visual pendiente.
   */
  readonly granted = computed<readonly DemoPermission[]>(() => {
    const status = this.session.status();
    const role = this.session.profileId();
    const account = this.session.authenticatedAccount();

    if (status !== 'lista' || account === null || account.role !== role) {
      return READ_ONLY_PERMISSIONS;
    }

    return PERMISSIONS_BY_PROFILE[role] ?? READ_ONLY_PERMISSIONS;
  });

  can(permission: DemoPermission): boolean {
    return this.granted().includes(permission);
  }
}
