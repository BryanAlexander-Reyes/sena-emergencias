import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';

import { DemoSessionService } from './demo-session.service';

export const ADMIN_ACCESS_DENIED_PARAM = 'acceso';
export const ADMIN_ACCESS_DENIED_VALUE = 'denegado';
export const ADMIN_ACCESS_DENIED_QUERY_PARAMS = {
  [ADMIN_ACCESS_DENIED_PARAM]: ADMIN_ACCESS_DENIED_VALUE,
} as const;

/**
 * Guard asíncrono de la ruta administrativa. Espera a que la restauración de
 * Supabase termine y exige un Administrador con identidad validada coherente.
 * El rol seleccionado en la interfaz nunca se considera autorización.
 */
export const adminAccessGuard: CanActivateFn = async () => {
  const session = inject(DemoSessionService);
  const router = inject(Router);

  const snapshot = await session.whenReady();
  const account = snapshot.account;
  const authorized =
    snapshot.status === 'lista' && snapshot.role === 'administrador' && account?.role === 'administrador';

  if (authorized) {
    return true;
  }

  await router.navigate(['/tabs/mas'], {
    queryParams: ADMIN_ACCESS_DENIED_QUERY_PARAMS,
    replaceUrl: true,
  });

  return false;
};
