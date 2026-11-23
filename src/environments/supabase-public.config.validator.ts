/**
 * Contrato y validación de la configuración pública de Supabase.
 *
 * Solo se permiten datos públicos: la URL base del proyecto y una clave
 * `sb_publishable_...`. La seguridad no depende de ocultar estos valores, sino
 * de RLS; por eso nunca se acepta `service_role` ni otra credencial privada.
 */

export const SUPABASE_URL_PLACEHOLDER = 'https://REEMPLAZAR.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY_PLACEHOLDER = 'sb_publishable_REEMPLAZAR_AQUI';

export interface SupabasePublicConfig {
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
}

function hasProjectUrlShape(value: string): boolean {
  try {
    const parsed = new URL(value);

    return (
      parsed.protocol === 'https:' &&
      /^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname) &&
      parsed.username === '' &&
      parsed.password === '' &&
      (parsed.pathname === '/' || parsed.pathname === '') &&
      parsed.search === '' &&
      parsed.hash === ''
    );
  } catch {
    return false;
  }
}

function hasPublishableKeyShape(value: string): boolean {
  return /^sb_publishable_[A-Za-z0-9_.-]+$/.test(value);
}

/**
 * Comprueba que la configuración pueda publicarse con seguridad. Devuelve
 * `false` para marcadores, valores ausentes, formatos inválidos y credenciales
 * privadas, sin inspeccionar ni revelar el contenido de otros secretos.
 */
export function isSupabasePublicConfigValid(config: SupabasePublicConfig): boolean {
  const url = config.supabaseUrl.trim();
  const publishableKey = config.supabasePublishableKey.trim();

  if (!url || !publishableKey) {
    return false;
  }

  if (url === SUPABASE_URL_PLACEHOLDER || /REEMPLAZAR/i.test(url)) {
    return false;
  }

  if (
    publishableKey === SUPABASE_PUBLISHABLE_KEY_PLACEHOLDER ||
    /REEMPLAZAR/i.test(publishableKey) ||
    /^eyJ/.test(publishableKey)
  ) {
    return false;
  }

  return hasProjectUrlShape(url) && hasPublishableKeyShape(publishableKey);
}
