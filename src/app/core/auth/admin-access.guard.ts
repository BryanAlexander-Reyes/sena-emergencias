import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';

import { DemoPermissionsService } from './demo-permissions.service';

export const ADMIN_ACCESS_DENIED_PARAM = 'acceso';
export const ADMIN_ACCESS_DENIED_VALUE = 'denegado';
export const ADMIN_ACCESS_DENIED_QUERY_PARAMS = {
  [ADMIN_ACCESS_DENIED_PARAM]: ADMIN_ACCESS_DENIED_VALUE,
} as const;

export const adminAccessGuard: CanActivateFn = () => {
  const permissions = inject(DemoPermissionsService);
  const router = inject(Router);

  if (permissions.can('admin:access')) {
    return true;
  }

  void router.navigate(['/tabs/mas'], {
    queryParams: ADMIN_ACCESS_DENIED_QUERY_PARAMS,
    replaceUrl: true,
  });

  return false;
};
