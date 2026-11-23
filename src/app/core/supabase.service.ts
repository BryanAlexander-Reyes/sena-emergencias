import { Injectable } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { environment } from '../../environments/environment';
import { isSupabasePublicConfigValid } from '../../environments/supabase-public.config.validator';

function createConfiguredClient(): SupabaseClient | null {
  const config = {
    supabaseUrl: environment.supabaseUrl.trim(),
    supabasePublishableKey: environment.supabasePublishableKey.trim(),
  };

  return isSupabasePublicConfigValid(config) ? createClient(config.supabaseUrl, config.supabasePublishableKey) : null;
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
