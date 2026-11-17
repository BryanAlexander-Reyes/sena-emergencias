import { computed, Injectable, inject } from '@angular/core';

import { type DemoProfileId } from './demo-profiles';
import { DemoSessionService } from './demo-session.service';

export type DemoPermission =
  'occupancy:update' | 'occupancy:reset' | 'sensors:control' | 'sensors:reset' | 'alerts:review' | 'admin:access';

export const DEMO_PERMISSIONS: readonly DemoPermission[] = [
  'occupancy:update',
  'occupancy:reset',
  'sensors:control',
  'sensors:reset',
  'alerts:review',
  'admin:access',
];

const ADMINISTRATOR_PERMISSIONS: readonly DemoPermission[] = DEMO_PERMISSIONS;
const READ_ONLY_PERMISSIONS: readonly DemoPermission[] = [];

const PERMISSIONS_BY_PROFILE: Readonly<Record<DemoProfileId, readonly DemoPermission[]>> = {
  administrador: ADMINISTRATOR_PERMISSIONS,
  instructor: READ_ONLY_PERMISSIONS,
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
