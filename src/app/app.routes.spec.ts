import { routes } from './app.routes';
import { adminAccessGuard } from './core/auth/admin-access.guard';
import { AccesoPage } from './features/acceso/acceso.page';
import { AdminPage } from './features/admin/admin.page';
import { routes as masRoutes } from './features/mas/mas.routes';
import { routes as tabsRoutes } from './tabs/tabs.routes';

describe('app routes', () => {
  it('should keep the root and wildcard redirects to the dashboard', () => {
    expect(routes.map((route) => route.path)).toEqual(['tabs', 'acceso', '', '**']);

    const root = routes.find((route) => route.path === '');
    const wildcard = routes.find((route) => route.path === '**');

    expect(root?.redirectTo).toBe('tabs/inicio');
    expect(root?.pathMatch).toBe('full');
    expect(wildcard?.redirectTo).toBe('tabs/inicio');
  });

  it('should expose the demo access route as an independent lazy page', async () => {
    const acceso = routes.find((route) => route.path === 'acceso');

    expect(acceso?.redirectTo).toBeUndefined();
    expect(acceso?.children).toBeUndefined();
    expect(await acceso?.loadComponent?.()).toBe(AccesoPage);
  });

  it('should keep the five dashboard tabs', () => {
    const children = tabsRoutes[0].children ?? [];

    expect(children.map((route) => route.path)).toEqual(['', 'inicio', 'zonas', 'mapa', 'alertas', 'mas']);
  });

  it('should keep the existing secondary Más routes, MQTT monitoring and the protected admin route', () => {
    expect(masRoutes.map((route) => route.path)).toEqual([
      '',
      'zona-segura',
      'estadisticas',
      'sensores',
      'monitoreo-iot',
      'asistente',
      'configuracion',
      'administracion',
    ]);
  });

  it('should protect the admin route with the admin access guard', async () => {
    const admin = masRoutes.find((route) => route.path === 'administracion');

    expect(admin?.canActivate).toEqual([adminAccessGuard]);
    expect(await admin?.loadComponent?.()).toBe(AdminPage);
  });
});
