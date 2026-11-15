import { MasPage } from './mas.page';
import { routes } from './mas.routes';

describe('mas routes', () => {
  it('should expose the menu and the five secondary destinations', () => {
    const paths = routes.map((route) => route.path);

    expect(paths).toEqual(['', 'zona-segura', 'estadisticas', 'sensores', 'asistente', 'configuracion']);
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
});
