import { Injectable, inject } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SupabaseService } from '../supabase.service';

import type { ZoneConfig, ZoneId } from './zone-config.types';
import { isZoneId, toZoneConfig, toZoneConfigList, ZoneConfigError } from './zone-config.validators';
import { validateZoneAdminWrite, zoneConfigToRow, ZONES_ADMIN_COLUMNS, ZONES_ADMIN_TABLE } from './zones-admin.input';
import type { ZonesAdminRepository } from './zones-admin.repository.contract';
import { toZonesAdminRepositoryError, ZonesAdminRepositoryError } from './zones-admin.repository.errors';

/**
 * Repositorio administrativo de zonas sobre `public.zonas`.
 *
 * Usa exclusivamente el cliente Supabase público (`SupabaseService.client`) con
 * la sesión autenticada: no hay service_role, claves privadas ni Edge Functions.
 * RLS en PostgreSQL decide si la cuenta puede escribir. Solo INSERT y UPDATE;
 * no existe ninguna operación DELETE.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseZonesAdminRepository implements ZonesAdminRepository {
  private readonly supabase = inject(SupabaseService);

  async listAll(): Promise<readonly ZoneConfig[]> {
    const client = this.requireClient();

    try {
      await this.requireSession(client);

      const { data, error } = await client
        .from(ZONES_ADMIN_TABLE)
        .select(ZONES_ADMIN_COLUMNS)
        .order('id', { ascending: true });

      if (error !== null) {
        throw toZonesAdminRepositoryError(error);
      }

      return toZoneConfigList(data);
    } catch (error) {
      throw this.translate(error);
    }
  }

  async create(input: ZoneConfig): Promise<ZoneConfig> {
    const config = this.validateInput(input);
    const client = this.requireClient();

    try {
      await this.requireSession(client);
      await this.assertIdAvailable(client, config.id);
      if (config.segura) {
        await this.assertSafeZoneAvailable(client, null);
      }

      const { data, error } = await client
        .from(ZONES_ADMIN_TABLE)
        .insert(zoneConfigToRow(config, true))
        .select(ZONES_ADMIN_COLUMNS)
        .single();

      if (error !== null) {
        throw toZonesAdminRepositoryError(error);
      }

      return validateZoneAdminWrite(toZoneConfig(data), config.id);
    } catch (error) {
      throw this.translate(error);
    }
  }

  async update(id: ZoneId, input: ZoneConfig): Promise<ZoneConfig> {
    if (!isZoneId(id)) {
      throw new ZonesAdminRepositoryError('VALIDATION_FAILED');
    }

    const config = this.validateInput(input, id);
    const client = this.requireClient();

    try {
      await this.requireSession(client);
      if (config.segura) {
        await this.assertSafeZoneAvailable(client, id);
      }

      const { data, error } = await client
        .from(ZONES_ADMIN_TABLE)
        .update(zoneConfigToRow(config, false))
        .eq('id', id)
        .select(ZONES_ADMIN_COLUMNS)
        .single();

      if (error !== null) {
        throw toZonesAdminRepositoryError(error);
      }

      return validateZoneAdminWrite(toZoneConfig(data), id);
    } catch (error) {
      throw this.translate(error);
    }
  }

  async setActive(id: ZoneId, activo: boolean): Promise<ZoneConfig> {
    if (!isZoneId(id) || typeof activo !== 'boolean') {
      throw new ZonesAdminRepositoryError('VALIDATION_FAILED');
    }

    const client = this.requireClient();

    try {
      await this.requireSession(client);

      const { data, error } = await client
        .from(ZONES_ADMIN_TABLE)
        .update({ activo })
        .eq('id', id)
        .select(ZONES_ADMIN_COLUMNS)
        .single();

      if (error !== null) {
        throw toZonesAdminRepositoryError(error);
      }

      return validateZoneAdminWrite(toZoneConfig(data), id);
    } catch (error) {
      throw this.translate(error);
    }
  }

  /** Los errores de campo se traducen al código cerrado del repositorio. */
  private validateInput(input: unknown, expectedId?: ZoneId): ZoneConfig {
    try {
      return validateZoneAdminWrite(input, expectedId);
    } catch (error) {
      if (error instanceof ZoneConfigError) {
        throw new ZonesAdminRepositoryError('VALIDATION_FAILED');
      }

      throw error;
    }
  }

  private requireClient(): SupabaseClient {
    const client = this.supabase.client;
    if (client === null) {
      throw new ZonesAdminRepositoryError('NOT_CONFIGURED');
    }

    return client;
  }

  /** Las escrituras solo se envían con una sesión real ya iniciada. */
  private async requireSession(client: SupabaseClient): Promise<void> {
    const { data, error } = await client.auth.getSession();

    if (error !== null) {
      throw toZonesAdminRepositoryError(error);
    }
    if (data.session === null) {
      throw new ZonesAdminRepositoryError('NOT_AUTHENTICATED');
    }
  }

  /** Comprobación local previa al INSERT: evita enviar IDs repetidos. */
  private async assertIdAvailable(client: SupabaseClient, id: ZoneId): Promise<void> {
    const { data, error } = await client.from(ZONES_ADMIN_TABLE).select('id').eq('id', id);

    if (error !== null) {
      throw toZonesAdminRepositoryError(error);
    }
    if (Array.isArray(data) && data.length > 0) {
      throw new ZonesAdminRepositoryError('DUPLICATE_ID');
    }
  }

  /** Comprobación local previa: solo una zona puede tener `segura = true`. */
  private async assertSafeZoneAvailable(client: SupabaseClient, exceptId: ZoneId | null): Promise<void> {
    let query = client.from(ZONES_ADMIN_TABLE).select('id').eq('segura', true);
    if (exceptId !== null) {
      query = query.neq('id', exceptId);
    }

    const { data, error } = await query;

    if (error !== null) {
      throw toZonesAdminRepositoryError(error);
    }
    if (Array.isArray(data) && data.length > 0) {
      throw new ZonesAdminRepositoryError('SAFE_ZONE_CONFLICT');
    }
  }

  private translate(error: unknown): ZonesAdminRepositoryError {
    if (error instanceof ZonesAdminRepositoryError) {
      return error;
    }
    if (error instanceof ZoneConfigError) {
      return new ZonesAdminRepositoryError('INVALID_RESPONSE');
    }

    return toZonesAdminRepositoryError(error);
  }
}
