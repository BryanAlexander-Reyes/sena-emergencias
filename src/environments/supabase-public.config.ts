export interface SupabasePublicConfig {
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
}

/**
 * Valores versionados por defecto. En desarrollo, Angular sustituye este módulo
 * por `supabase-public.config.generated.ts`, generado desde las dos variables
 * públicas de `.env`. Producción no consume `.env`.
 */
export const supabasePublicConfig: SupabasePublicConfig = {
  supabaseUrl: 'https://REEMPLAZAR.supabase.co',
  supabasePublishableKey: 'sb_publishable_REEMPLAZAR_AQUI',
};
