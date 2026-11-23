import {
  isSupabasePublicConfigValid,
  SUPABASE_PUBLISHABLE_KEY_PLACEHOLDER,
  SUPABASE_URL_PLACEHOLDER,
  type SupabasePublicConfig,
} from './supabase-public.config.validator';

const VALID_URL = 'https://proyecto-qa.supabase.co';
const VALID_KEY = 'sb_publishable_TEST_VALIDA_123';

function config(overrides: Partial<SupabasePublicConfig> = {}): SupabasePublicConfig {
  return {
    supabaseUrl: VALID_URL,
    supabasePublishableKey: VALID_KEY,
    ...overrides,
  };
}

describe('isSupabasePublicConfigValid', () => {
  it('acepta una configuración pública válida', () => {
    expect(isSupabasePublicConfigValid(config())).toBe(true);
  });

  it('rechaza configuración ausente', () => {
    expect(isSupabasePublicConfigValid(config({ supabaseUrl: '', supabasePublishableKey: '' }))).toBe(false);
    expect(isSupabasePublicConfigValid(config({ supabasePublishableKey: '   ' }))).toBe(false);
  });

  it('rechaza marcadores REEMPLAZAR', () => {
    expect(isSupabasePublicConfigValid(config({ supabaseUrl: SUPABASE_URL_PLACEHOLDER }))).toBe(false);
    expect(isSupabasePublicConfigValid(config({ supabasePublishableKey: SUPABASE_PUBLISHABLE_KEY_PLACEHOLDER }))).toBe(
      false,
    );
  });

  for (const supabaseUrl of [
    'http://proyecto.supabase.co',
    'https://proyecto.supabase.co/ruta',
    'https://usuario@proyecto.supabase.co',
    'https://proyecto.ejemplo.com',
    'https://proyecto.supabase.co?x=1',
  ]) {
    it(`rechaza URL inválida: ${supabaseUrl}`, () => {
      expect(isSupabasePublicConfigValid(config({ supabaseUrl }))).toBe(false);
    });
  }

  for (const supabasePublishableKey of [
    'sb_secret_privada',
    'eyJhbGciOiJIUzI1NiJ9.payload.firma',
    'service_role_key',
    'sb_publishable_',
    'otra_clave',
  ]) {
    it(`rechaza clave inválida o privada: ${supabasePublishableKey}`, () => {
      expect(isSupabasePublicConfigValid(config({ supabasePublishableKey }))).toBe(false);
    });
  }
});
