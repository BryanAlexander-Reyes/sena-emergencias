import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'tabs',
    loadChildren: () => import('./tabs/tabs.routes').then((m) => m.routes),
  },
  {
    path: 'acceso',
    loadComponent: () => import('./features/acceso/acceso.page').then((m) => m.AccesoPage),
  },
  {
    path: '',
    redirectTo: 'tabs/inicio',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'tabs/inicio',
  },
];
