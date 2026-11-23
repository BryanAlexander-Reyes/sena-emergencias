/**
 * Fase 5.4.B.1 — Supabase Edge Function `crear-instructor` (solo preparación local).
 *
 * Punto de entrada de Deno. Configuración esperada en el entorno de ejecución:
 * - `SUPABASE_URL`: inyectada por Supabase.
 * - Clave pública de verificación: `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`
 *   o el diccionario JSON `SUPABASE_PUBLISHABLE_KEYS` (entrada `default`).
 * - Credencial privada: `SUPABASE_SERVICE_ROLE_KEY` o, si falta, el diccionario
 *   JSON `SUPABASE_SECRET_KEYS` (entrada `default`). NUNCA en el frontend ni en el repositorio.
 * - `CORS_ALLOWED_ORIGINS`: orígenes exactos permitidos, separados por comas.
 *
 * No se despliega, no crea usuarios reales y no modifica la sesión del solicitante.
 * Toda la lógica comprobable sin Deno está en `handler.ts`.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  createHandler,
  DuplicateError,
  IdentityProvisionError,
  ProfileStoreError,
  escapeLikePattern,
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

/**
 * Clasifica el error de Auth sin registrar ni devolver su mensaje. El correo
 * ya existente es el único caso que se transforma en conflicto; el resto se
 * trata como fallo de integración.
 */
function isEmailExistsError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
  if (candidate.code === 'email_exists' || candidate.status === 409) {
    return true;
  }
  if (candidate.status !== 422 || typeof candidate.message !== 'string') {
    return false;
  }

  return /already|registered|exists/i.test(candidate.message);
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

    instructorDirectory: {
      async findByNormalizedName(normalizedName) {
        const { data, error } = await adminClient
          .from('usuarios')
          .select('id')
          .ilike('nombre', escapeLikePattern(normalizedName))
          .limit(1);

        if (error !== null) {
          throw new ProfileStoreError();
        }

        return data.length > 0 ? { id: String(data[0].id) } : null;
      },

      async insertProfile(profile) {
        const { error } = await adminClient.from('usuarios').insert({
          id: profile.id,
          nombre: profile.nombre,
          rol: profile.rol,
          activo: profile.activo,
        });

        if (error !== null) {
          // 23505: carrera contra el índice único sobre lower(nombre).
          if (error.code === '23505') {
            throw new DuplicateError('nombre');
          }
          throw new ProfileStoreError();
        }
      },
    },

    identityProvisioner: {
      async createIdentity({ email, password }) {
        const { data, error } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

        if (error !== null) {
          if (isEmailExistsError(error)) {
            throw new DuplicateError('email');
          }
          throw new IdentityProvisionError();
        }
        if (typeof data.user?.id !== 'string' || data.user.id.length === 0) {
          throw new IdentityProvisionError();
        }

        return { id: data.user.id };
      },

      async deleteIdentity(id) {
        const { error } = await adminClient.auth.admin.deleteUser(id);
        if (error !== null) {
          throw new IdentityProvisionError();
        }
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
