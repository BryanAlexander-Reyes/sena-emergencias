import { Injectable } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { environment } from '../../environments/environment';

const SUPABASE_URL_PLACEHOLDER = 'https://REEMPLAZAR.supabase.co';
const SUPABASE_PUBLISHABLE_KEY_PLACEHOLDER = 'sb_publishable_REEMPLAZAR_AQUI';
const PUBLISHABLE_KEY_PREFIX = 'sb_publishable_';

function hasProjectUrlShape(value: string): boolean {
  try {
    const parsed = new URL(value);

    return (
      parsed.protocol === 'https:' &&
      parsed.hostname.endsWith('.supabase.co') &&
      parsed.pathname === '/' &&
      parsed.search === '' &&
      parsed.hash === ''
    );
  } catch {
    return false;
  }
}

function hasPublishableKeyShape(value: string): boolean {
  return value.startsWith(PUBLISHABLE_KEY_PREFIX) && value.length > PUBLISHABLE_KEY_PREFIX.length;
}

function createConfiguredClient(): SupabaseClient | null {
  const url = environment.supabaseUrl.trim();
  const publishableKey = environment.supabasePublishableKey.trim();

  const hasRealValues =
    url !== SUPABASE_URL_PLACEHOLDER &&
    publishableKey !== SUPABASE_PUBLISHABLE_KEY_PLACEHOLDER &&
    hasProjectUrlShape(url) &&
    hasPublishableKeyShape(publishableKey);

  return hasRealValues ? createClient(url, publishableKey) : null;
}

/**
 * Punto único de acceso futuro a Supabase. Sin configuración pública válida el
 * cliente permanece `null`, de modo que la aplicación demo sigue funcionando
 * sin inicializar el SDK con marcadores.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient | null = createConfiguredClient();

  get isConfigured(): boolean {
    return this.client !== null;
  }
}
