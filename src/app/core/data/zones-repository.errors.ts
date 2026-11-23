/**
 * Errores estables de la fuente de configuración de zonas.
 *
 * La UI y el store solo reciben códigos y mensajes de este archivo: nunca se
 * propagan mensajes de PostgREST, SQL, tokens ni detalles del servidor.
 */

export type ZonesRepositoryErrorCode =
  'NOT_CONFIGURED' | 'NETWORK' | 'FORBIDDEN' | 'TABLE_UNAVAILABLE' | 'QUERY_FAILED' | 'INVALID_RESPONSE';

export const ZONES_REPOSITORY_MESSAGES: Readonly<Record<ZonesRepositoryErrorCode, string>> = {
  NOT_CONFIGURED: 'La configuración de zonas no está disponible en este momento.',
  NETWORK: 'No fue posible conectar con la fuente de zonas. Revisa tu conexión e inténtalo de nuevo.',
  FORBIDDEN: 'No tienes permiso para consultar la configuración de zonas.',
  TABLE_UNAVAILABLE: 'La fuente pública de zonas aún no está disponible en el servidor.',
  QUERY_FAILED: 'No fue posible cargar la configuración de zonas. Inténtalo de nuevo más tarde.',
  INVALID_RESPONSE: 'La fuente de zonas devolvió datos inesperados. Inténtalo de nuevo más tarde.',
};

export class ZonesRepositoryError extends Error {
  constructor(readonly code: ZonesRepositoryErrorCode) {
    super(ZONES_REPOSITORY_MESSAGES[code]);
    this.name = 'ZonesRepositoryError';
  }
}

function readField(error: unknown, key: string): string {
  if (typeof error !== 'object' || error === null) {
    return '';
  }

  const value = (error as Record<string, unknown>)[key];

  return typeof value === 'string' ? value.toLowerCase() : '';
}

function includesAny(message: string, fragments: readonly string[]): boolean {
  return fragments.some((fragment) => message.includes(fragment));
}

/** Traduce cualquier fallo de Supabase a un código seguro y cerrado. */
export function toZonesRepositoryError(error: unknown): ZonesRepositoryError {
  if (error instanceof ZonesRepositoryError) {
    return error;
  }

  const code = readField(error, 'code');
  const message = readField(error, 'message');

  if (
    code === '42p01' ||
    code === 'pgrst205' ||
    includesAny(message, ['does not exist', 'no such table', 'schema cache'])
  ) {
    return new ZonesRepositoryError('TABLE_UNAVAILABLE');
  }

  if (
    code === '42501' ||
    code === '401' ||
    code === '403' ||
    includesAny(message, ['permission denied', 'row-level security', 'jwt', 'not authorized'])
  ) {
    return new ZonesRepositoryError('FORBIDDEN');
  }

  if (
    error instanceof TypeError ||
    includesAny(message, ['failed to fetch', 'fetch failed', 'network', 'load failed'])
  ) {
    return new ZonesRepositoryError('NETWORK');
  }

  return new ZonesRepositoryError('QUERY_FAILED');
}
