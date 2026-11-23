import { InjectionToken } from '@angular/core';

import type { AdminUserAccount, CreateInstructorInput, InstructorAccount } from './auth-domain.types';

/**
 * Consulta y gestión futura de cuentas de Instructor.
 *
 * El contrato es asíncrono a propósito: la implementación deberá resolver estas
 * operaciones en el servidor, sin asumir privilegios de escritura del cliente
 * sobre `public.usuarios`.
 */
export interface InstructorAccountRepository {
  list(): Promise<readonly InstructorAccount[]>;
  create(input: CreateInstructorInput): Promise<InstructorAccount>;
  setActive(id: string, activo: boolean): Promise<InstructorAccount>;
}

/**
 * Contrato de lectura y gestión administrativa.
 *
 * Reutiliza `create()` del contrato base y refinana solo las operaciones que
 * necesitan el rol: el listado y el cambio de estado devuelven cuentas con los
 * cuatro campos mínimos del modelo administrativo. La implementación real y su
 * inyección se conectarán en microfases posteriores.
 */
export interface AdminUserAccountRepository extends InstructorAccountRepository {
  list(): Promise<readonly AdminUserAccount[]>;
  setActive(id: string, activo: boolean): Promise<AdminUserAccount>;
}

/** Permite inyectar la implementación activa sin acoplar la UI a una clase concreta. */
export const INSTRUCTOR_ACCOUNT_REPOSITORY = new InjectionToken<InstructorAccountRepository>(
  'INSTRUCTOR_ACCOUNT_REPOSITORY',
);
