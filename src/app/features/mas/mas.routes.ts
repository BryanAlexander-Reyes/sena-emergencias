import type { Routes } from '@angular/router';

import { adminAccessGuard } from '../../core/auth/admin-access.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./mas.page').then((m) => m.MasPage),
  },
  {
    path: 'zona-segura',
    loadComponent: () => import('./zona-segura/zona-segura.page').then((m) => m.ZonaSeguraPage),
  },
  {
    path: 'estadisticas',
    loadComponent: () => import('./estadisticas/estadisticas.page').then((m) => m.EstadisticasPage),
  },
  {
    path: 'sensores',
    loadComponent: () => import('./sensores/sensores.page').then((m) => m.SensoresPage),
  },
  {
    path: 'monitoreo-iot',
    loadComponent: () => import('../monitoreo-iot/monitoreo-iot.page').then((m) => m.MonitoreoIotPage),
  },
  {
    path: 'asistente',
    loadComponent: () => import('./asistente/asistente.page').then((m) => m.AsistentePage),
  },
  {
    path: 'configuracion',
    loadComponent: () => import('./configuracion/configuracion.page').then((m) => m.ConfiguracionPage),
  },
  {
    path: 'administracion',
    canActivate: [adminAccessGuard],
    loadComponent: () => import('../admin/admin.page').then((m) => m.AdminPage),
  },
];
