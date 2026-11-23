/**
 * Validación de identidad real para el endpoint de comandos.
 *
 * - `auth.getUser(jwt)` valida el token contra Supabase Auth (no decodifica el JWT).
 * - El rol y el estado ACTIVO se leen de `public.usuarios` en cada solicitud.
 * - Nunca se confía en `app_metadata` ni en campos enviados por el cliente.
 * - Sin configuración de servidor, la validación falla cerrada: devuelve null.
 * - No imprime tokens ni claves.
 */

import { createClient } from '@supabase/supabase-js';

import { ACTORES } from '../src/app/core/data/alarm-incident-contract.ts';
import { normalizarUrlSupabase } from './supabase-url.mjs';

const OPCIONES_CLIENTE = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

/**
 * @param {{
 *   url?: string,
 *   publishableKey?: string,
 *   serviceRoleKey?: string,
 *   clientFactory?: Function,
 * }} opciones
 * @returns {(jwt: string) => Promise<{activo: boolean, rol: string, id: string}|null>}
 */
export function crearValidadorIdentidadSupabase({
  url = '',
  publishableKey = '',
  serviceRoleKey = '',
  clientFactory = createClient,
} = {}) {
  const baseUrl = normalizarUrlSupabase(url);
  const clienteVerificacion =
    baseUrl && publishableKey ? clientFactory(baseUrl, publishableKey, OPCIONES_CLIENTE) : null;
  const clienteAdmin = baseUrl && serviceRoleKey ? clientFactory(baseUrl, serviceRoleKey, OPCIONES_CLIENTE) : null;

  return async function validarJwt(jwt) {
    if (clienteVerificacion === null || clienteAdmin === null) return null;
    if (typeof jwt !== 'string' || jwt.length === 0) return null;

    try {
      const { data: autenticacion, error: errorAuth } = await clienteVerificacion.auth.getUser(jwt);
      if (errorAuth || typeof autenticacion?.user?.id !== 'string' || autenticacion.user.id.length === 0) {
        return null;
      }

      const { data: perfil, error: errorPerfil } = await clienteAdmin
        .from('usuarios')
        .select('id, rol, activo')
        .eq('id', autenticacion.user.id)
        .maybeSingle();

      if (errorPerfil || perfil === null) return null;

      const rol = String(perfil.rol ?? '');
      if (!ACTORES.includes(rol)) return null;

      return {
        activo: perfil.activo === true,
        rol,
        id: String(perfil.id),
      };
    } catch {
      return null;
    }
  };
}
