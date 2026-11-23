import { InjectionToken } from '@angular/core';

import type { ZoneConfig } from './zone-config.types';
import { ZonesRepositoryError } from './zones-repository.errors';

/**
 * Contrato de SOLO LECTURA de la futura fuente pública de zonas.
 *
 * No existe todavía una tabla en Supabase Cloud. Este contrato prepara la
 * consulta sin crear, actualizar ni borrar nada, y sin resistencia de lectura.
 */
export interface ZonesRepository {
  list(): Promise<readonly ZoneConfig[]>;
}

/** Implementación por defecto: falla de forma segura si no se proporciona una real. */
class UnavailableZonesRepository implements ZonesRepository {
  async list(): Promise<readonly ZoneConfig[]> {
    throw new ZonesRepositoryError('NOT_CONFIGURED');
  }
}

export const ZONES_REPOSITORY = new InjectionToken<ZonesRepository>('ZONES_REPOSITORY', {
  providedIn: 'root',
  factory: () => new UnavailableZonesRepository(),
});
