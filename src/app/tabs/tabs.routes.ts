import type { Routes } from '@angular/router';

import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      {
        path: '',
        redirectTo: 'inicio',
        pathMatch: 'full',
      },
      {
        path: 'inicio',
        loadComponent: () => import('../features/inicio/inicio.page').then((m) => m.InicioPage),
      },
      {
        path: 'zonas',
        loadComponent: () => import('../features/zonas/zonas.page').then((m) => m.ZonasPage),
      },
      {
        path: 'mapa',
        loadComponent: () => import('../features/mapa/mapa.page').then((m) => m.MapaPage),
      },
      {
        path: 'alertas',
        loadComponent: () => import('../features/alertas/alertas.page').then((m) => m.AlertasPage),
      },
      {
        path: 'mas',
        loadChildren: () => import('../features/mas/mas.routes').then((m) => m.routes),
      },
    ],
  },
];
