import { inject, InjectionToken } from '@angular/core';

import { SupabaseZonesAdminRepository } from './supabase-zones-admin.repository';
import type { ZoneConfig, ZoneId } from './zone-config.types';

/**
 * Contrato de ADMINISTRACIÓN de zonas, separado del repositorio público de
 * solo lectura (`ZonesRepository`). Solo operaciones list/create/update/
 * setActive: NO existe DELETE y ningún método cambia el identificador de una
 * zona ya creada.
 *
 * El permiso `zones:manage` se comprueba en la UI y se refuerza en PostgreSQL
 * mediante RLS. Este contrato no modifica Auth ni permisos.
 */
export interface ZonesAdminRepository {
  /** Todas las zonas visibles para un administrador, activas o no. */
  listAll(): Promise<readonly ZoneConfig[]>;

  /** Inserta una zona con el ID indicado. El ID se conserva tal cual. */
  create(input: ZoneConfig): Promise<ZoneConfig>;

  /** Actualiza una zona existente. El `id` de la fila nunca se modifica. */
  update(id: ZoneId, input: ZoneConfig): Promise<ZoneConfig>;

  /** Activa o desactiva una zona sin tocar el resto de su configuración. */
  setActive(id: ZoneId, activo: boolean): Promise<ZoneConfig>;
}

/**
 * Implementación por defecto: el repositorio Supabase con el cliente público
 * y la sesión autenticada. No requiere service_role ni claves privadas.
 */
export const ZONES_ADMIN_REPOSITORY = new InjectionToken<ZonesAdminRepository>('ZONES_ADMIN_REPOSITORY', {
  providedIn: 'root',
  factory: () => inject(SupabaseZonesAdminRepository),
});
