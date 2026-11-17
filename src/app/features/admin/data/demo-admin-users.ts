export type DemoAdminRole = 'administrador' | 'instructor' | 'aprendiz' | 'visitante';
export type DemoAdminUserStatus = 'activo' | 'solo-lectura';

export interface DemoAdminUser {
  readonly id: string;
  readonly name: string;
  readonly role: DemoAdminRole;
  readonly status: DemoAdminUserStatus;
  readonly scope: string;
}

export const DEMO_ADMIN_ROLES: readonly DemoAdminRole[] = ['administrador', 'instructor', 'aprendiz', 'visitante'];

export const DEMO_ADMIN_ROLE_LABELS: Readonly<Record<DemoAdminRole, string>> = {
  administrador: 'Administrador',
  instructor: 'Instructor',
  aprendiz: 'Aprendiz',
  visitante: 'Visitante',
};

export const DEMO_ADMIN_STATUS_LABELS: Readonly<Record<DemoAdminUserStatus, string>> = {
  activo: 'Activo (demo)',
  'solo-lectura': 'Solo lectura',
};

export const DEMO_ADMIN_USERS: readonly DemoAdminUser[] = [
  {
    id: 'USR-DMO-001',
    name: 'Administrador Demo',
    role: 'administrador',
    status: 'activo',
    scope: 'Supervisión general del prototipo',
  },
  {
    id: 'USR-DMO-002',
    name: 'Instructor Demo',
    role: 'instructor',
    status: 'activo',
    scope: 'Seguimiento de zonas y alertas simuladas',
  },
  {
    id: 'USR-DMO-003',
    name: 'Aprendiz Demo',
    role: 'aprendiz',
    status: 'activo',
    scope: 'Exploración guiada del monitoreo',
  },
  {
    id: 'USR-DMO-004',
    name: 'Visitante Demo',
    role: 'visitante',
    status: 'solo-lectura',
    scope: 'Consulta de información general',
  },
];
