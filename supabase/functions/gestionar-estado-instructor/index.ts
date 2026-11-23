/**
 * Fase 5.4.D.5.A — Supabase Edge Function `gestionar-estado-instructor` (solo preparación local).
 *
 * Punto de entrada de Deno. Configuración esperada en el entorno de ejecución:
 * - `SUPABASE_URL`: inyectada por Supabase.
 * - Clave pública de verificación: `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`
 *   o el diccionario JSON `SUPABASE_PUBLISHABLE_KEYS` (entrada `default`).
 * - Credencial privada: `SUPABASE_SERVICE_ROLE_KEY` o, si falta, el diccionario
 *   JSON `SUPABASE_SECRET_KEYS` (entrada `default`). NUNCA en el frontend ni en el repositorio.
 * - `CORS_ALLOWED_ORIGINS`: orígenes exactos permitidos, separados por comas.
 *
 * ANTES DE DESPLEGAR: verificar manualmente que la credencial de servidor tiene
 * permiso UPDATE sobre `public.usuarios`. Este código NO ejecuta GRANT, NO
 * modifica RLS ni cambia privilegios; conceder el permiso queda fuera de alcance
 * y requiere autorización explícita.
 *
 * Toda la lógica comprobable sin Deno está en `handler.ts`.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  createHandler,
  isRuntimeConfigComplete,
  parseAllowedOrigins,
  ProfileStoreError,
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

    instructorStateStore: {
      async findTarget(id) {
        const { data, error } = await adminClient
          .from('usuarios')
          .select('id, nombre, rol, activo')
          .eq('id', id)
          .maybeSingle();

        if (error !== null) {
          throw new ProfileStoreError(readSafeErrorMetadata(error));
        }

        // Se devuelve la fila cruda; `handler.ts` construye el DTO de cuatro
        // campos y descarta columnas adicionales que aparezcan en el futuro.
        return data;
      },

      async updateActive({ id, expectedRol, expectedActivo, nextActivo }) {
        // UPDATE condicional: el estado previo y el rol forman parte del filtro.
        // Solo se escribe `activo`; nunca contraseñas, roles, Auth ni otras tablas.
        const { data, error } = await adminClient
          .from('usuarios')
          .update({ activo: nextActivo })
          .eq('id', id)
          .eq('rol', expectedRol)
          .eq('activo', expectedActivo)
          .select('id, nombre, rol, activo')
          .maybeSingle();

        if (error !== null) {
          throw new ProfileStoreError(readSafeErrorMetadata(error));
        }

        // `data === null` significa que otra operación cambió la condición; el
        // handler relee la fila para responder 404/403/409 sin reintentar a ciegas.
        return data === null ? { updated: false } : { updated: true, row: data };
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

/*
 * Sesiones y JWT ya emitidos:
 * - Cambiar `public.usuarios.activo` no revoca tokens existentes por sí solo.
 * - Esta función vuelve a consultar el perfil del solicitante en cada petición,
 *   por lo que un Administrador desactivado queda rechazado aunque su JWT siga
 *   vigente hasta expirar.
 * - Un Instructor desactivado puede conservar un JWT vigente hasta su caducidad;
 *   el Custom Access Token Hook impide refrescarlo y las operaciones sensibles
 *   deben volver a verificar `activo` en servidor. Mantener la expiración corta
 *   del JWT es una decisión de configuración pendiente, no un cambio de código aquí.
 */
