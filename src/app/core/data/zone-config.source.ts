import { InjectionToken } from '@angular/core';

/**
 * Origen de la configuración de zonas.
 *
 * `demo` usa `DEMO_ZONES` adaptados y nunca consulta la red. `remote` habilita
 * el repositorio Supabase de solo lectura. Hasta ZONAS.4 el valor por defecto
 * es `demo` porque la fuente pública todavía no existe.
 */
export type ZoneConfigMode = 'demo' | 'remote';

export const ZONE_CONFIG_MODE = new InjectionToken<ZoneConfigMode>('ZONE_CONFIG_MODE', {
  providedIn: 'root',
  factory: () => 'demo',
});
