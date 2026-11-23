import type { DemoProfileId } from './demo-profiles';

export interface DemoCredential {
  readonly username: string;
  readonly password: string;
  readonly profileId: DemoProfileId;
}

/**
 * AUTENTICACIÓN SIMULADA — SOLO DEMOSTRACIÓN / NO SEGURA PARA PRODUCCIÓN.
 *
 * Estas credenciales son ficticias y están quemadas en el cliente a propósito
 * para el prototipo SENA CROWD INTELLIGENCE (Fase 5.1). No verifican identidad,
 * no se envían a ningún servidor, no se persisten en localStorage/sessionStorage
 * y no deben utilizarse nunca como autorización de dispositivos físicos ni en
 * un entorno real. No se agregaron usuarios reales ni registro público.
 */
export const DEMO_CREDENTIALS: readonly DemoCredential[] = [
  {
    username: 'admin_demo',
    password: 'Admin1234!',
    profileId: 'administrador',
  },
  {
    username: 'instructor_demo',
    password: 'Instructor1234!',
    profileId: 'instructor',
  },
];
