import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { supabasePublicConfig } from '../../environments/supabase-public.config';

import { SupabaseService } from './supabase.service';

describe('SupabaseService', () => {
  it('recibe la configuración pública del entorno sin exponer secretos', () => {
    expect(environment.supabaseUrl).toBe(supabasePublicConfig.supabaseUrl);
    expect(environment.supabasePublishableKey).toBe(supabasePublicConfig.supabasePublishableKey);

    const configuredUrl: string = environment.supabaseUrl;
    const configuredKey: string = environment.supabasePublishableKey;

    const looksConfigured =
      configuredUrl !== 'https://REEMPLAZAR.supabase.co' &&
      configuredKey !== 'sb_publishable_REEMPLAZAR_AQUI' &&
      /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(configuredUrl) &&
      configuredKey.startsWith('sb_publishable_');

    const service = TestBed.inject(SupabaseService);

    expect(service.isConfigured).toBe(looksConfigured);
    expect(service.client !== null).toBe(looksConfigured);
  });
});
