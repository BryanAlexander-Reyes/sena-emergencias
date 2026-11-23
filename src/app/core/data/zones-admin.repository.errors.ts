/**
 * SENA CROWD INTELLIGENCE — errores estables del repositorio administrativo
 * de zonas (ZONAS.6).
 *
 * La UI solo recibe códigos y mensajes cerrados de este archivo. Los detalles
 * de PostgREST, SQL, RLS o red nunca llegan a la pantalla.
 */

import { toZonesRepositoryError, type ZonesRepositoryErrorCode } from './zones-repository.errors';

export type ZonesAdminRepositoryErrorCode =
  | 'NOT_CONFIGURED'
  | 'NOT_AUTHENTICATED'
  | 'FORBIDDEN'
  | 'DUPLICATE_ID'
  | 'SAFE_ZONE_CONFLICT'
  | 'VALIDATION_FAILED'
  | 'TARGET_NOT_FOUND'
  | 'TABLE_UNAVAILABLE'
  | 'NETWORK'
  | 'QUERY_FAILED'
  | 'INVALID_RESPONSE';

export const ZONES_ADMIN_REPOSITORY_MESSAGES: Readonly<Record<ZonesAdminRepositoryErrorCode, string>> = {
  NOT_CONFIGURED: 'La administración de zonas no está disponible en este momento.',
  NOT_AUTHENTICATED: 'Debes iniciar sesión con una cuenta de administrador para gestionar zonas.',
  FORBIDDEN: 'No tienes permiso para gestionar la configuración de zonas.',
  DUPLICATE_ID: 'Ya existe una zona con ese identificador. Usa un código distinto.',
  SAFE_ZONE_CONFLICT: 'Solo puede existir una zona segura. Desactiva la zona segura actual antes de asignar otra.',
  VALIDATION_FAILED:
    'Los datos de la zona no cumplen las reglas de configuración. Revisa los campos e inténtalo de nuevo.',
  TARGET_NOT_FOUND: 'La zona ya no existe en el servidor. Actualiza el listado antes de volver a intentarlo.',
  TABLE_UNAVAILABLE: 'La fuente de zonas aún no está disponible en el servidor.',
  NETWORK: 'No fue posible conectar con el servidor de zonas. Revisa tu conexión e inténtalo de nuevo.',
  QUERY_FAILED: 'No fue posible completar la operación. Inténtalo de nuevo más tarde.',
  INVALID_RESPONSE: 'El servidor devolvió una zona inesperada. Inténtalo de nuevo más tarde.',
};

export class ZonesAdminRepositoryError extends Error {
  constructor(readonly code: ZonesAdminRepositoryErrorCode) {
    super(ZONES_ADMIN_REPOSITORY_MESSAGES[code]);
    this.name = 'ZonesAdminRepositoryError';
  }
}

function readField(error: unknown, key: string): string {
  if (typeof error !== 'object' || error === null) {
    return '';
  }

  const value = (error as Record<string, unknown>)[key];

  return typeof value === 'string' ? value.toLowerCase() : '';
}

const SHARED_CODES: Readonly<Partial<Record<ZonesRepositoryErrorCode, ZonesAdminRepositoryErrorCode>>> = {
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  FORBIDDEN: 'FORBIDDEN',
  TABLE_UNAVAILABLE: 'TABLE_UNAVAILABLE',
  NETWORK: 'NETWORK',
  QUERY_FAILED: 'QUERY_FAILED',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
};

/**
 * Traduce cualquier fallo de Supabase a un código seguro y cerrado.
 * El texto del servidor solo se usa para elegir el código: nunca se muestra.
 */
export function toZonesAdminRepositoryError(error: unknown): ZonesAdminRepositoryError {
  if (error instanceof ZonesAdminRepositoryError) {
    return error;
  }

  const code = readField(error, 'code');
  const details = `${readField(error, 'details')} ${readField(error, 'message')}`;

  if (code === '23505') {
    return new ZonesAdminRepositoryError(details.includes('segura') ? 'SAFE_ZONE_CONFLICT' : 'DUPLICATE_ID');
  }

  if (code === '23514' || code === '23502' || code === '22p02' || code === '22003') {
    return new ZonesAdminRepositoryError('VALIDATION_FAILED');
  }

  if (code === 'pgrst116') {
    return new ZonesAdminRepositoryError('TARGET_NOT_FOUND');
  }

  const shared = SHARED_CODES[toZonesRepositoryError(error).code];

  return new ZonesAdminRepositoryError(shared ?? 'QUERY_FAILED');
}
