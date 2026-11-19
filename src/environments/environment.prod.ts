export const environment = {
  production: true,
  // Producción no consume .env local; el pipeline debe inyectar la configuración real.
  supabaseUrl: 'https://REEMPLAZAR.supabase.co',
  // Solo clave publicable sb_publishable_...; nunca claves privadas ni secretos.
  supabasePublishableKey: 'sb_publishable_REEMPLAZAR_AQUI',
};
