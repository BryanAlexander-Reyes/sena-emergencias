import { type SupabaseClient } from '@supabase/supabase-js';

import type { AuthenticatedAccount, AuthenticatedRole } from './auth-domain.types';

/** Dominio interno no entregable: nunca se usa para correo real ni recuperación. */
export const SUPABASE_INTERNAL_EMAIL_DOMAIN = '@sena.local.invalid';
export const SUPABASE_USERNAME_MIN_LENGTH = 3;
export const SUPABASE_USERNAME_MAX_LENGTH = 32;

const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const AUTHENTICATED_ROLES: readonly AuthenticatedRole[] = ['administrador', 'instructor'];

/**
 * Subconjunto de `JwtPayload` que necesita la aplicación. Se obtiene siempre de
 * `auth.getClaims(token)`, nunca de `user.app_metadata` ni de `user_metadata`.
 */
export interface AccessTokenClaims {
  readonly sub?: string;
  readonly email?: string;
  readonly app_metadata?: {
    readonly app_role?: unknown;
  };
}

/**
 * Claims con una marca.runtime creada únicamente por `readVerifiedAccessTokenClaims`.
 * El tipo solo documenta la intención: la comprobación real es `WeakSet`.
 */
export type VerifiedAccessTokenClaims = AccessTokenClaims;

/** Identidad construida a partir de claims verificados. Su marca también es runtime. */
export interface VerifiedIdentity {
  readonly account: AuthenticatedAccount;
}

const VERIFIED_CLAIMS = new WeakSet<object>();
const VERIFIED_IDENTITIES = new WeakSet<object>();

/** Normaliza el nombre de usuario con la misma regla de `public.usuarios`. */
export function normalizeAuthUsername(username: string): string | null {
  const normalized = username.trim();

  if (
    normalized.length < SUPABASE_USERNAME_MIN_LENGTH ||
    normalized.length > SUPABASE_USERNAME_MAX_LENGTH ||
    !USERNAME_PATTERN.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

/** Deriva el correo interno; nunca se usa para registro ni recuperación. */
export function deriveInternalEmail(username: string): string | null {
  const normalized = normalizeAuthUsername(username);

  return normalized === null ? null : `${normalized.toLowerCase()}${SUPABASE_INTERNAL_EMAIL_DOMAIN}`;
}

export function isAuthenticatedRole(value: unknown): value is AuthenticatedRole {
  return typeof value === 'string' && (AUTHENTICATED_ROLES as readonly string[]).includes(value);
}

/**
 * Verifica el access token y devuelve sus claims marcados como validados. Lanza
 * ante cualquier error de validación; el llamador decide cómo degradar a Aprendiz.
 */
export async function readVerifiedAccessTokenClaims(
  client: SupabaseClient,
  accessToken: string,
): Promise<VerifiedAccessTokenClaims> {
  const result = await client.auth.getClaims(accessToken);
  const claims = result.data?.claims;

  if (result.error !== null || typeof claims !== 'object' || claims === null) {
    throw new Error('No se pudieron validar las claims del token de acceso.');
  }

  VERIFIED_CLAIMS.add(claims);
  return claims as VerifiedAccessTokenClaims;
}

/** Comprobación.runtime de la marca de claims verificados. */
export function isVerifiedAccessTokenClaims(value: unknown): value is VerifiedAccessTokenClaims {
  return typeof value === 'object' && value !== null && VERIFIED_CLAIMS.has(value);
}

export function authenticatedRoleFromClaims(claims: AccessTokenClaims): AuthenticatedRole | null {
  const role = claims.app_metadata?.app_role;

  return isAuthenticatedRole(role) ? role : null;
}

/**
 * Reconstruye el nombre de usuario únicamente desde el claim `email` verificado.
 * El correo interno se deriva del username, por lo que su parte local es una
 * fuente confiable. Se normaliza en minúsculas: el caso original no viaja en el
 * JWT y no debe inventarse.
 */
export function usernameFromVerifiedEmail(email: unknown): string | null {
  if (typeof email !== 'string') {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  if (!normalized.endsWith(SUPABASE_INTERNAL_EMAIL_DOMAIN)) {
    return null;
  }

  return normalizeAuthUsername(normalized.slice(0, -SUPABASE_INTERNAL_EMAIL_DOMAIN.length));
}

export interface AccountFromClaimsOptions {
  /** Solo para el login: username normalizado introducido en el formulario. */
  readonly fallbackUsername?: string;
  /** Solo para el login: id del usuario devuelto por Supabase en la respuesta. */
  readonly fallbackUserId?: string;
}

/**
 * Construye la identidad mínima del contrato y la marca como verificada. Devuelve
 * `null` cuando el token no permite reconstruir un rol, un id o un nombre de
 * forma confiable. Solo acepta claims obtenidos de `getClaims()`.
 *
 * LIMITACIÓN 5.3.4.C: la restauración depende de que el JWT incluya el claim
 * `email` (comportamiento estándar de Supabase Auth para login con correo). Si
 * el hook de tokens dejara de incluirlo, la sesión se degradaría a Aprendiz en
 * lugar de inventar un nombre. Solución segura propuesta: añadir un claim
 * `app_metadata.nombre` (o `app_metadata.username`) validado por el hook y
 * usarlo aquí como fuente preferida, sin tocar SQL/RLS en esta fase.
 */
export function authenticatedAccountFromClaims(
  claims: VerifiedAccessTokenClaims,
  options: AccountFromClaimsOptions = {},
): VerifiedIdentity | null {
  if (!isVerifiedAccessTokenClaims(claims)) {
    return null;
  }

  const role = authenticatedRoleFromClaims(claims);
  if (role === null) {
    return null;
  }

  const id = claims.sub ?? options.fallbackUserId;
  if (typeof id !== 'string' || id.length === 0) {
    return null;
  }

  const nombre = usernameFromVerifiedEmail(claims.email) ?? options.fallbackUsername ?? null;
  if (nombre === null) {
    return null;
  }

  const account: AuthenticatedAccount = Object.freeze({ id, nombre, role });
  const identity: VerifiedIdentity = Object.freeze({ account });
  VERIFIED_IDENTITIES.add(identity);

  return identity;
}

/** Comprobación.runtime de la marca de identidad publicable. */
export function isVerifiedIdentity(value: unknown): value is VerifiedIdentity {
  return typeof value === 'object' && value !== null && VERIFIED_IDENTITIES.has(value);
}
