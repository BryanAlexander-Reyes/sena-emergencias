import type { DemoProfileId } from './demo-profiles';

/** Roles de la aplicación. Reutiliza la unión existente para no duplicarla. */
export type AppRole = DemoProfileId;

/** Cuentas con identidad verificable en Supabase Auth. */
export type AuthenticatedRole = Extract<AppRole, 'administrador' | 'instructor'>;

/** Perfiles de acceso directo, sin cuenta ni credenciales. */
export type PublicRole = Extract<AppRole, 'aprendiz'>;

/** Identidad mínima de una cuenta autenticada. No expone secretos ni claims. */
export interface AuthenticatedAccount {
  readonly id: string;
  readonly nombre: string;
  readonly role: AuthenticatedRole;
}

/** Credenciales introducidas por el usuario para Administrador o Instructor. */
export interface AuthCredentials {
  readonly username: string;
  readonly password: string;
}

/** Estado de inicialización de una sesión potencialmente asíncrona. */
export type SessionStatus = 'inicializando' | 'lista';

/** Snapshot inmutable del estado de sesión. */
export interface SessionSnapshot {
  readonly status: SessionStatus;
  readonly role: AppRole;
  readonly account: AuthenticatedAccount | null;
}

/** Campos mínimos compartidos por cualquier cuenta de la aplicación. */
export interface ApplicationAccount {
  readonly id: string;
  readonly nombre: string;
  readonly activo: boolean;
}

/** Vista pública de una cuenta de Instructor. Nunca incluye credenciales. */
export type InstructorAccount = ApplicationAccount;

/**
 * Vista de lectura administrativa. Reutiliza los campos mínimos de cuenta y
 * añade solo el rol almacenado en servidor; nunca incluye credenciales ni
 * metadatos de Supabase Auth.
 */
export interface AdminUserAccount extends ApplicationAccount {
  readonly rol: AuthenticatedRole;
}

/** Datos necesarios para solicitar al servidor la creación de un Instructor. */
export interface CreateInstructorInput {
  readonly nombre: string;
  readonly password: string;
}
