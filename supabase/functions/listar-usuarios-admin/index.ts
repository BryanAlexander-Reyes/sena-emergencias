/**
 * Fase 5.4.D.3 — Supabase Edge Function `listar-usuarios-admin` (solo preparación local).
 *
 * Punto de entrada de Deno. Configuración esperada en el entorno de ejecución:
 * - `SUPABASE_URL`: inyectada por Supabase.
 * - Clave pública de verificación: `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`
 *   o el diccionario JSON `SUPABASE_PUBLISHABLE_KEYS` (entrada `default`).
 * - Credencial privada: `SUPABASE_SERVICE_ROLE_KEY` o, si falta, el diccionario
 *   JSON `SUPABASE_SECRET_KEYS` (entrada `default`). NUNCA en el frontend ni en el repositorio.
 * - `CORS_ALLOWED_ORIGINS`: orígenes exactos permitidos, separados por comas.
 *
 * No se despliega, no contacta Supabase Cloud, no modifica datos y no cambia la
 * sesión del solicitante. Toda la lógica comprobable sin Deno está en `handler.ts`.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  createHandler,
  ProfileStoreError,
  isRuntimeConfigComplete,
  parseAllowedOrigins,
  readSafeErrorMetadata,
  resolveServerKey,
  resolveVerificationKey,
  type Dependencies,
  type Logger,
} from './handler.ts';

function readEnv(name: string): string {
  return Deno.env.get(name)?.trim() ?? '';
}

const supabaseUrl = readEnv('SUPABASE_URL');
const verificationKey = resolveVerificationKey({
  anonKey: readEnv('SUPABASE_ANON_KEY'),
  publishableKey: readEnv('SUPABASE_PUBLISHABLE_KEY'),
  publishableKeysJson: readEnv('SUPABASE_PUBLISHABLE_KEYS'),
});
const serverKey = resolveServerKey({
  serviceRoleKey: readEnv('SUPABASE_SERVICE_ROLE_KEY'),
  secretKeysJson: readEnv('SUPABASE_SECRET_KEYS'),
});
const allowedOrigins = parseAllowedOrigins(readEnv('CORS_ALLOWED_ORIGINS'));

/** Solo emite códigos fijos: nunca valores de entorno, tokens ni errores del SDK. */
const logger: Logger = {
  warn: (code) => console.warn(code),
  error: (code, metadata) => console.error(metadata === undefined ? code : `${code} ${metadata}`),
};

function createClientOptions() {
  return {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  };
}

function buildDependencies(verificationClient: SupabaseClient, adminClient: SupabaseClient): Dependencies {
  return {
    allowedOrigins,
    logger,

    authVerifier: {
      async verifyAccessToken(token) {
        // getUser valida el token contra el servidor de Auth; no decodifica el JWT.
        const { data, error } = await verificationClient.auth.getUser(token);
        if (error !== null || typeof data.user?.id !== 'string' || data.user.id.length === 0) {
          return null;
        }

        return { id: data.user.id };
      },
    },

    requesterRepository: {
      async findById(id) {
        const { data, error } = await adminClient.from('usuarios').select('id, rol, activo').eq('id', id).maybeSingle();

        if (error !== null) {
          throw new ProfileStoreError(readSafeErrorMetadata(error));
        }
        if (data === null) {
          return null;
        }

        return {
          id: String(data.id),
          rol: String(data.rol),
          activo: data.activo === true,
        };
      },
    },

    adminUserDirectory: {
      async list() {
        // Cliente administrativo exclusivamente en servidor: la RLS del cliente
        // autenticado oculta cuentas inactivas; aquí deben incluirse todas.
        const { data, error } = await adminClient
          .from('usuarios')
          .select('id, nombre, rol, activo')
          .order('nombre', { ascending: true })
          .order('id', { ascending: true });

        if (error !== null) {
          throw new ProfileStoreError(readSafeErrorMetadata(error));
        }

        // Se devuelven filas crudas; `handler.ts` construye el DTO de cuatro
        // campos y descarta cualquier columna adicional que aparezca en el futuro.
        return data;
      },
    },
  };
}

if (!isRuntimeConfigComplete({ supabaseUrl, verificationKey, serverKey })) {
  // No se revela qué variable falta ni ningún valor; la función queda inerte.
  logger.error('CONFIGURATION_MISSING');
} else {
  if (allowedOrigins.length === 0) {
    // CORS sin orígenes es fail-closed: no habilita acceso desde navegador.
    logger.warn('CORS_CONFIGURATION_MISSING');
  }

  const verificationClient = createClient(supabaseUrl, verificationKey, createClientOptions());
  const adminClient = createClient(supabaseUrl, serverKey, createClientOptions());

  Deno.serve(createHandler(buildDependencies(verificationClient, adminClient)));
}
