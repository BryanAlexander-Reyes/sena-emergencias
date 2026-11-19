import { Injectable, inject } from '@angular/core';
import { type SupabaseClient } from '@supabase/supabase-js';

import { SupabaseService } from '../supabase.service';

import type { AuthCredentials, AuthenticatedAccount, AuthenticatedRole } from './auth-domain.types';
import type { AuthFacade } from './auth-facade.contract';
import {
  authenticatedAccountFromClaims,
  authenticatedRoleFromClaims,
  deriveInternalEmail,
  normalizeAuthUsername,
  readVerifiedAccessTokenClaims,
} from './supabase-auth-claims';
import { SupabaseSessionService } from './supabase-session.service';

export { deriveInternalEmail, normalizeAuthUsername } from './supabase-auth-claims';

export const SUPABASE_LOGIN_ERROR = 'No fue posible iniciar sesión. Verifica tus credenciales e inténtalo de nuevo.';
export const SUPABASE_NOT_CONFIGURED_ERROR = 'El acceso privilegiado no está disponible en este momento.';
export const SUPABASE_USERNAME_ERROR =
  'El nombre de usuario debe tener entre 3 y 32 caracteres y usar letras, números, punto, guion o guion bajo.';

/**
 * Implementación real de `AuthFacade` para Administrador e Instructor.
 *
 * `SupabaseSessionService` es el único orquestador del ciclo de sesión y
 * `DemoSessionService` sigue siendo el único depósito del estado de Angular.
 * El rol se lee del JWT verificado por `getClaims()`, nunca de
 * `user.app_metadata`, `user_metadata` ni de la selección visual del perfil.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseAuthService implements AuthFacade {
  private readonly supabase = inject(SupabaseService);
  private readonly sessionManager = inject(SupabaseSessionService);

  async signIn(credentials: AuthCredentials, requestedRole: AuthenticatedRole): Promise<AuthenticatedAccount> {
    const client = this.supabase.client;

    if (client === null) {
      this.sessionManager.invalidateSession();
      throw new Error(SUPABASE_NOT_CONFIGURED_ERROR);
    }

    const username = normalizeAuthUsername(credentials.username);
    if (username === null) {
      throw new Error(SUPABASE_USERNAME_ERROR);
    }

    const email = deriveInternalEmail(username);
    if (email === null) {
      throw new Error(SUPABASE_USERNAME_ERROR);
    }

    let signInResult: Awaited<ReturnType<typeof client.auth.signInWithPassword>>;
    try {
      signInResult = await client.auth.signInWithPassword({ email, password: credentials.password });
    } catch {
      throw new Error(SUPABASE_LOGIN_ERROR);
    }

    const supabaseSession = signInResult.data.session;
    if (signInResult.error !== null || supabaseSession === null) {
      throw new Error(SUPABASE_LOGIN_ERROR);
    }

    let claims;
    try {
      claims = await readVerifiedAccessTokenClaims(client, supabaseSession.access_token);
    } catch {
      await this.clearAttempt(client);
      throw new Error(SUPABASE_LOGIN_ERROR);
    }

    // El correo del token debe corresponder al derivado del usuario solicitado.
    if (claims.email !== undefined && claims.email.trim().toLowerCase() !== email.toLowerCase()) {
      await this.clearAttempt(client);
      throw new Error(SUPABASE_LOGIN_ERROR);
    }

    const authenticatedRole = authenticatedRoleFromClaims(claims);
    if (authenticatedRole === null || authenticatedRole !== requestedRole) {
      await this.clearAttempt(client);
      throw new Error(SUPABASE_LOGIN_ERROR);
    }

    const identity = authenticatedAccountFromClaims(claims, {
      fallbackUsername: username,
      fallbackUserId: supabaseSession.user.id,
    });
    if (identity === null) {
      await this.clearAttempt(client);
      throw new Error(SUPABASE_LOGIN_ERROR);
    }

    this.sessionManager.applyVerifiedToken(supabaseSession.access_token, identity);

    return identity.account;
  }

  async signOut(): Promise<void> {
    await this.sessionManager.signOut();
  }

  /** Cierra la sesión creada por el intento y fuerza el perfil público Aprendiz. */
  private async clearAttempt(client: SupabaseClient): Promise<void> {
    this.sessionManager.invalidateSession();

    try {
      await client.auth.signOut();
    } catch {
      // La sesión local se limpia aunque Supabase no pueda cerrar la remota.
    }
  }
}
