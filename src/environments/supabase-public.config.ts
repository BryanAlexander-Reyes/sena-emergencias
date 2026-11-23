import {
  SUPABASE_PUBLISHABLE_KEY_PLACEHOLDER,
  SUPABASE_URL_PLACEHOLDER,
  type SupabasePublicConfig,
} from './supabase-public.config.validator';

export type { SupabasePublicConfig } from './supabase-public.config.validator';

/**
 * Valores versionados por defecto. En desarrollo y producción, Angular
 * sustituye este módulo por `supabase-public.config.generated.ts`, creado desde
 * las dos variables públicas del entorno de compilación.
 */
export const supabasePublicConfig: SupabasePublicConfig = {
  supabaseUrl: SUPABASE_URL_PLACEHOLDER,
  supabasePublishableKey: SUPABASE_PUBLISHABLE_KEY_PLACEHOLDER,
};
