import { Injectable, inject } from '@angular/core';
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';

import { SupabaseService } from '../supabase.service';

import type { AdminUserAccount, CreateInstructorInput, InstructorAccount } from './auth-domain.types';
import type { InstructorAccountRepository } from './instructor-account-repository.contract';
import { isAdminUserAccount, isInstructorAccount, isInstructorStateResponse } from './instructor-account.validators';

/** Códigos internos estables: la UI solo muestra los mensajes de este mapa. */
export type InstructorRepositoryErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_DATA'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'FUNCTION_UNAVAILABLE'
  | 'NETWORK'
  | 'SERVER'
  | 'PENDING_INTEGRATION'
  | 'INVALID_RESPONSE'
  | 'LIST_FAILED'
  | 'STATUS_UPDATE_FAILED'
  | 'TARGET_NOT_FOUND'
  | 'ALREADY_INACTIVE'
  | 'ALREADY_ACTIVE'
  | 'INVALID_STATUS_REQUEST'
  | 'OPERATION_NOT_ALLOWED'
  | 'LIST_FORBIDDEN'
  | 'LIST_FUNCTION_UNAVAILABLE';

export const INSTRUCTOR_REPOSITORY_MESSAGES: Readonly<Record<InstructorRepositoryErrorCode, string>> = {
  NOT_CONFIGURED: 'El registro de instructores no está disponible en este momento.',
  INVALID_DATA: 'Revisa el nombre de usuario y la contraseña e inténtalo de nuevo.',
  UNAUTHENTICATED: 'Tu sesión no es válida o ha caducado. Vuelve a iniciar sesión para continuar.',
  FORBIDDEN: 'No tienes permiso para crear instructores.',
  CONFLICT: 'Ya existe una cuenta con ese nombre de usuario.',
  FUNCTION_UNAVAILABLE: 'El servicio de creación de instructores no está disponible. Inténtalo más tarde.',
  NETWORK: 'No fue posible conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
  SERVER: 'No fue posible crear el instructor. Inténtalo de nuevo más tarde.',
  PENDING_INTEGRATION:
    'El listado y la desactivación de instructores aún no están disponibles en el servidor. Las cuentas creadas aquí no aparecen en un listado local.',
  INVALID_RESPONSE: 'El servidor devolvió datos inesperados. Inténtalo de nuevo más tarde.',
  LIST_FAILED: 'No fue posible cargar el listado de instructores. Inténtalo de nuevo más tarde.',
  STATUS_UPDATE_FAILED: 'No fue posible actualizar el estado del instructor. Inténtalo de nuevo más tarde.',
  TARGET_NOT_FOUND: 'No se encontró la cuenta seleccionada.',
  ALREADY_INACTIVE: 'La cuenta ya está inactiva.',
  ALREADY_ACTIVE: 'La cuenta ya está activa.',
  INVALID_STATUS_REQUEST: 'La solicitud de cambio de estado no es válida. Inténtalo de nuevo más tarde.',
  OPERATION_NOT_ALLOWED: 'No se puede realizar esta acción sobre la cuenta seleccionada.',
  LIST_FORBIDDEN: 'No tienes permiso para ver el listado de usuarios.',
  LIST_FUNCTION_UNAVAILABLE: 'El servicio de listado de usuarios no está disponible. Inténtalo más tarde.',
};

export class InstructorRepositoryError extends Error {
  constructor(readonly code: InstructorRepositoryErrorCode) {
    super(INSTRUCTOR_REPOSITORY_MESSAGES[code]);
    this.name = 'InstructorRepositoryError';
  }
}

/** Lee solo el estado HTTP del error; nunca inspecciona ni propaga su cuerpo. */
function httpStatus(error: FunctionsHttpError): number | null {
  const context = error.context as { status?: unknown } | null | undefined;
  return typeof context?.status === 'number' ? context.status : null;
}

function toRepositoryError(error: unknown): InstructorRepositoryError {
  if (error instanceof InstructorRepositoryError) {
    return error;
  }

  if (error instanceof FunctionsHttpError) {
    switch (httpStatus(error)) {
      case 400:
        return new InstructorRepositoryError('INVALID_DATA');
      case 401:
        return new InstructorRepositoryError('UNAUTHENTICATED');
      case 403:
        return new InstructorRepositoryError('FORBIDDEN');
      case 404:
        return new InstructorRepositoryError('FUNCTION_UNAVAILABLE');
      case 409:
        return new InstructorRepositoryError('CONFLICT');
      default:
        return new InstructorRepositoryError('SERVER');
    }
  }

  if (error instanceof FunctionsFetchError) {
    return new InstructorRepositoryError('NETWORK');
  }
  if (error instanceof FunctionsRelayError) {
    return new InstructorRepositoryError('FUNCTION_UNAVAILABLE');
  }

  return new InstructorRepositoryError('SERVER');
}

/**
 * Traducción específica del listado. No reutiliza `toRepositoryError` porque
 * esa función pertenece al alta: cambiar sus códigos alteraría `create()`.
 */
function toListRepositoryError(error: unknown): InstructorRepositoryError {
  if (error instanceof InstructorRepositoryError) {
    return error;
  }

  if (error instanceof FunctionsHttpError) {
    switch (httpStatus(error)) {
      case 401:
        return new InstructorRepositoryError('UNAUTHENTICATED');
      case 403:
        return new InstructorRepositoryError('LIST_FORBIDDEN');
      case 404:
        return new InstructorRepositoryError('LIST_FUNCTION_UNAVAILABLE');
      default:
        return new InstructorRepositoryError('LIST_FAILED');
    }
  }

  if (error instanceof FunctionsFetchError) {
    return new InstructorRepositoryError('NETWORK');
  }
  if (error instanceof FunctionsRelayError) {
    return new InstructorRepositoryError('LIST_FUNCTION_UNAVAILABLE');
  }

  return new InstructorRepositoryError('LIST_FAILED');
}

/**
 * Traducción específica del cambio de estado. No reutiliza `toRepositoryError`
 * porque sus códigos pertenecen al alta y sus mensajes hablan de credenciales.
 * Solo se lee el estado HTTP; nunca el cuerpo, que podría contener datos
 * internos del servidor.
 */
function toStatusRepositoryError(error: unknown, activo: boolean): InstructorRepositoryError {
  if (error instanceof InstructorRepositoryError) {
    return error;
  }

  if (error instanceof FunctionsHttpError) {
    switch (httpStatus(error)) {
      case 400:
        return new InstructorRepositoryError('INVALID_STATUS_REQUEST');
      case 401:
        return new InstructorRepositoryError('UNAUTHENTICATED');
      case 403:
        return new InstructorRepositoryError('OPERATION_NOT_ALLOWED');
      case 404:
        return new InstructorRepositoryError('TARGET_NOT_FOUND');
      case 409:
        return new InstructorRepositoryError(activo ? 'ALREADY_ACTIVE' : 'ALREADY_INACTIVE');
      default:
        return new InstructorRepositoryError('STATUS_UPDATE_FAILED');
    }
  }

  if (error instanceof FunctionsFetchError) {
    return new InstructorRepositoryError('NETWORK');
  }
  if (error instanceof FunctionsRelayError) {
    return new InstructorRepositoryError('STATUS_UPDATE_FAILED');
  }

  return new InstructorRepositoryError('STATUS_UPDATE_FAILED');
}

/**
 * Valida el envelope completo antes de devolver cualquier fila: una sola
 * entrada inválida hace fallar toda la respuesta, sin datos parciales. La copia
 * final se construye campo por campo para no propagar columnas adicionales.
 */
function toAdminUserAccounts(data: unknown): readonly AdminUserAccount[] {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new InstructorRepositoryError('INVALID_RESPONSE');
  }

  const usuarios = (data as Record<string, unknown>)['usuarios'];
  if (!Array.isArray(usuarios)) {
    throw new InstructorRepositoryError('INVALID_RESPONSE');
  }

  const accounts: AdminUserAccount[] = [];
  for (const row of usuarios) {
    if (!isAdminUserAccount(row)) {
      throw new InstructorRepositoryError('INVALID_RESPONSE');
    }

    accounts.push({ id: row.id, nombre: row.nombre, rol: row.rol, activo: row.activo });
  }

  return accounts;
}

/**
 * Implementación real de `InstructorAccountRepository`.
 *
 * Usa el cliente Supabase existente: `functions.invoke()` adjunta el JWT de la
 * sesión actual sin exponerlo a la UI, y este repositorio no guarda contraseñas,
 * tokens ni lee sesión, inicio o cierre de sesión.
 *
 * `list()` consume `listar-usuarios-admin` con GET y `setActive()` consume
 * `gestionar-estado-instructor` con POST. Ninguna de las dos operaciones
 * simula resultados, recurre al repositorio demo ni guarda sesión, tokens o
 * credenciales en el navegador.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseInstructorAccountRepository implements InstructorAccountRepository {
  private readonly supabase = inject(SupabaseService);

  async create(input: CreateInstructorInput): Promise<InstructorAccount> {
    const client = this.supabase.client;
    if (client === null) {
      throw new InstructorRepositoryError('NOT_CONFIGURED');
    }

    try {
      const { data, error } = await client.functions.invoke('crear-instructor', {
        body: { nombre: input.nombre, password: input.password },
      });

      if (error !== null) {
        throw toRepositoryError(error);
      }
      if (!isInstructorAccount(data)) {
        throw new InstructorRepositoryError('SERVER');
      }

      // Se devuelve una copia mínima: nunca el cuerpo completo del servidor.
      return { id: data.id, nombre: data.nombre, activo: true };
    } catch (error) {
      throw toRepositoryError(error);
    }
  }

  /**
   * Listado real con HTTP GET explícito. El cliente Supabase existente conserva
   * la sesión del solicitante; aquí no se introducen credenciales de servidor.
   */
  async list(): Promise<readonly AdminUserAccount[]> {
    const client = this.supabase.client;
    if (client === null) {
      throw new InstructorRepositoryError('NOT_CONFIGURED');
    }

    try {
      const { data, error } = await client.functions.invoke('listar-usuarios-admin', { method: 'GET' });

      if (error !== null) {
        throw toListRepositoryError(error);
      }

      return toAdminUserAccounts(data);
    } catch (error) {
      throw toListRepositoryError(error);
    }
  }

  /**
   * Cambia el estado real de un Instructor en servidor. La sesión autenticada
   * existente se adjunta mediante `functions.invoke()`; aquí no se lee, copia
   * ni envía ninguna credencial privada.
   */
  async setActive(id: string, activo: boolean): Promise<InstructorAccount> {
    const client = this.supabase.client;
    if (client === null) {
      throw new InstructorRepositoryError('NOT_CONFIGURED');
    }

    try {
      const { data, error } = await client.functions.invoke('gestionar-estado-instructor', {
        method: 'POST',
        body: { id, activo },
      });

      if (error !== null) {
        throw toStatusRepositoryError(error, activo);
      }
      if (!isInstructorStateResponse(data, id, activo)) {
        throw new InstructorRepositoryError('INVALID_RESPONSE');
      }

      // Copia minima: el contrato de Instructor no expone el rol ni campos extra.
      return { id: data.id, nombre: data.nombre, activo: data.activo };
    } catch (error) {
      throw toStatusRepositoryError(error, activo);
    }
  }
}
