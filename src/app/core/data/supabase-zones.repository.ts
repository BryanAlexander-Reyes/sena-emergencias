import { Injectable, inject } from '@angular/core';

import { SupabaseService } from '../supabase.service';

import type { ZoneConfig } from './zone-config.types';
import { toZoneConfigList, ZoneConfigError } from './zone-config.validators';
import type { ZonesRepository } from './zones-repository.contract';
import { toZonesRepositoryError, ZonesRepositoryError } from './zones-repository.errors';

/** Nombre previsto de la vista/tabla pública; hoy no existe en Supabase Cloud. */
export const ZONES_PUBLIC_SOURCE = 'zonas_publicas';

/** Columnas explícitas: nunca `select('*')`, nunca columnas internas. */
export const ZONES_PUBLIC_COLUMNS = [
  'id',
  'codigo',
  'nombre',
  'capacidad',
  'icono',
  'tipo',
  'segura',
  'activo',
  'publico',
  'map_x',
  'map_y',
  'ancho',
  'alto',
  'etiqueta_x',
  'etiqueta_y',
].join(',');

/**
 * Repositorio de solo lectura para la futura fuente pública de zonas.
 *
 * Usa el cliente Supabase existente, sin `service_role`, sin Edge Functions y
 * sin operaciones de escritura. Las filas se validan con los validadores de
 * ZONAS.2 antes de entrar al estado de la aplicación: una sola fila inválida
 * hace fallar toda la respuesta, sin datos parciales ni sustitución por DEMO.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseZonesRepository implements ZonesRepository {
  private readonly supabase = inject(SupabaseService);

  async list(): Promise<readonly ZoneConfig[]> {
    const client = this.supabase.client;
    if (client === null) {
      throw new ZonesRepositoryError('NOT_CONFIGURED');
    }

    try {
      const { data, error } = await client
        .from(ZONES_PUBLIC_SOURCE)
        .select(ZONES_PUBLIC_COLUMNS)
        .eq('publico', true)
        .eq('activo', true);

      if (error !== null) {
        throw toZonesRepositoryError(error);
      }

      return toZoneConfigList(data);
    } catch (error) {
      if (error instanceof ZonesRepositoryError) {
        throw error;
      }
      if (error instanceof ZoneConfigError) {
        throw new ZonesRepositoryError('INVALID_RESPONSE');
      }

      throw toZonesRepositoryError(error);
    }
  }
}
