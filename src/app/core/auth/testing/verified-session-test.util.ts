import { type SupabaseClient } from '@supabase/supabase-js';

import type { AuthenticatedRole } from '../auth-domain.types';
import type { DemoSessionService } from '../demo-session.service';
import {
  authenticatedAccountFromClaims,
  readVerifiedAccessTokenClaims,
  type VerifiedIdentity,
} from '../supabase-auth-claims';

/**
 * Utilidad exclusiva de pruebas unitarias. No forma parte del arranque de la
 * aplicación: simula `auth.getClaims()` para construir identidades a través del
 * mismo camino.runtime que usa Supabase Auth, sin red ni credenciales reales.
 */
export interface VerifiedTestIdentities {
  readonly administrador: VerifiedIdentity;
  readonly instructor: VerifiedIdentity;
}

const EMAILS: Readonly<Record<AuthenticatedRole, string>> = {
  administrador: 'admin_demo@sena.local.invalid',
  instructor: 'instructor_demo@sena.local.invalid',
};

async function buildIdentity(role: AuthenticatedRole, id: string): Promise<VerifiedIdentity> {
  const client = {
    auth: {
      getClaims: async () => ({
        data: {
          claims: {
            sub: id,
            email: EMAILS[role],
            app_metadata: { app_role: role },
          },
        },
        error: null,
      }),
    },
  } as unknown as SupabaseClient;

  const claims = await readVerifiedAccessTokenClaims(client, 'token-simulado-verificado');
  const identity = authenticatedAccountFromClaims(claims);
  if (identity === null) {
    throw new Error('No fue posible construir una identidad verificada de prueba.');
  }

  return identity;
}

let cached: Promise<VerifiedTestIdentities> | null = null;

export function verifiedTestIdentities(): Promise<VerifiedTestIdentities> {
  cached ??= Promise.all([
    buildIdentity('administrador', 'admin-id-verificado'),
    buildIdentity('instructor', 'instructor-id-verificado'),
  ]).then(([administrador, instructor]) => ({ administrador, instructor }));

  return cached;
}

export function publishVerifiedRole(
  session: DemoSessionService,
  role: AuthenticatedRole,
  identities: VerifiedTestIdentities,
): boolean {
  return session.publishVerifiedIdentity(identities[role]);
}
