import { adminAccessGuard } from '../../core/auth/admin-access.guard';
import { AdminPage } from '../admin/admin.page';
import { MonitoreoIotPage } from '../monitoreo-iot/monitoreo-iot.page';

import { MasPage } from './mas.page';
import { routes } from './mas.routes';

describe('mas routes', () => {
  it('should expose the menu, the original destinations, MQTT monitoring and the protected admin route', () => {
    const paths = routes.map((route) => route.path);

    expect(paths).toEqual([
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

  it('should lazy load every destination', () => {
    routes.forEach((route) => {
      expect(typeof route.loadComponent).toBe('function');
      expect(route.loadChildren).toBeUndefined();
    });
  });

  it('should resolve the menu route to MasPage', async () => {
    const route = routes.find((candidate) => candidate.path === '');
    const loaded = await route?.loadComponent?.();

    expect(loaded).toBe(MasPage);
  });

  it('should resolve the MQTT monitoring route to MonitoreoIotPage', async () => {
    const route = routes.find((candidate) => candidate.path === 'monitoreo-iot');

    expect(await route?.loadComponent?.()).toBe(MonitoreoIotPage);
  });

  it('should resolve the admin route to AdminPage behind the guard', async () => {
    const route = routes.find((candidate) => candidate.path === 'administracion');
    const loaded = await route?.loadComponent?.();

    expect(route?.canActivate).toEqual([adminAccessGuard]);
    expect(loaded).toBe(AdminPage);
  });
});
