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
  | 'instructors:manage';

export const DEMO_PERMISSIONS: readonly DemoPermission[] = [
  'occupancy:update',
  'occupancy:reset',
  'sensors:control',
  'sensors:reset',
  'alerts:review',
  'alarm:control',
  'admin:access',
  'instructors:manage',
];

const ADMINISTRATOR_PERMISSIONS: readonly DemoPermission[] = DEMO_PERMISSIONS;
const READ_ONLY_PERMISSIONS: readonly DemoPermission[] = [];

/**
 * Fase 4.6 / 5.1.1: el Instructor controla únicamente la alarma simulada. No
 * recibe `admin:access`, `instructors:manage` ni permisos de ocupación,
 * sensores o revisión de alertas.
 */
const INSTRUCTOR_PERMISSIONS: readonly DemoPermission[] = ['alarm:control'];

const PERMISSIONS_BY_PROFILE: Readonly<Record<DemoProfileId, readonly DemoPermission[]>> = {
  administrador: ADMINISTRATOR_PERMISSIONS,
  instructor: INSTRUCTOR_PERMISSIONS,
  aprendiz: READ_ONLY_PERMISSIONS,
  visitante: READ_ONLY_PERMISSIONS,
};

@Injectable({ providedIn: 'root' })
export class DemoPermissionsService {
  private readonly session = inject(DemoSessionService);

  readonly granted = computed<readonly DemoPermission[]>(
    () => PERMISSIONS_BY_PROFILE[this.session.profileId()] ?? READ_ONLY_PERMISSIONS,
  );

  can(permission: DemoPermission): boolean {
    return this.granted().includes(permission);
  }
}
