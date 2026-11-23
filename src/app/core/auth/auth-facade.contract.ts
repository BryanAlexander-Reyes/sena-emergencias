import { InjectionToken } from '@angular/core';

import type { AuthCredentials, AuthenticatedAccount, AuthenticatedRole } from './auth-domain.types';

/** Inicio y cierre de sesión de cuentas autenticadas (Admin/Instructor). */
export interface AuthFacade {
  signIn(credentials: AuthCredentials, requestedRole: AuthenticatedRole): Promise<AuthenticatedAccount>;
  signOut(): Promise<void>;
}

/** Permite inyectar la implementación activa sin acoplar la UI a una clase concreta. */
export const AUTH_FACADE = new InjectionToken<AuthFacade>('AUTH_FACADE');
