import type { AdminUserAccount, InstructorAccount } from './auth-domain.types';
import { isAuthenticatedRole } from './supabase-auth-claims';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function readAccountFields(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (!isNonEmptyString(candidate['id']) || !isNonEmptyString(candidate['nombre'])) {
    return null;
  }

  return candidate;
}

/**
 * Validador de la respuesta de creación. Conserva el comportamiento anterior:
 * una cuenta recién creada debe estar activa.
 */
export function isInstructorAccount(value: unknown): value is InstructorAccount {
  const candidate = readAccountFields(value);

  return candidate !== null && candidate['activo'] === true;
}

/**
 * Validador de lectura. Acepta tanto cuentas activas como inactivas, porque el
 * `activo: boolean` es el estado real almacenado en servidor.
 */
export function isInstructorAccountRead(value: unknown): value is InstructorAccount {
  const candidate = readAccountFields(value);

  return candidate !== null && typeof candidate['activo'] === 'boolean';
}

/**
 * Validador de lectura administrativa. Exige los cuatro campos mínimos del
 * modelo y un rol de cuenta válido; ignora cualquier campo adicional.
 */
export function isAdminUserAccount(value: unknown): value is AdminUserAccount {
  const candidate = readAccountFields(value);

  return candidate !== null && typeof candidate['activo'] === 'boolean' && isAuthenticatedRole(candidate['rol']);
}

/**
 * Validador estricto de la respuesta al cambiar el estado de un Instructor.
 *
 * A diferencia de la creación, aquí se aceptan tanto cuentas activas como
 * inactivas, pero se exige rol de Instructor, el mismo id solicitado y el
 * estado pedido. Los campos adicionales se ignoran y el repositorio devuelve
 * solo la vista mínima; cualquier desviación en los campos obligatorios se
 * trata como respuesta malformada o inconsistente.
 */
export function isInstructorStateResponse(
  value: unknown,
  expectedId: string,
  expectedActivo: boolean,
): value is InstructorAccount {
  const candidate = readAccountFields(value);
  if (candidate === null) {
    return false;
  }

  const expectedKeys = ['id', 'nombre', 'rol', 'activo'];
  if (!expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(candidate, key))) {
    return false;
  }

  return candidate['id'] === expectedId && candidate['rol'] === 'instructor' && candidate['activo'] === expectedActivo;
}
