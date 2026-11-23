import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

// ==========================================
// CONFIGURACIÓN DE SUPABASE
// ==========================================

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

const notificationWorkerSecret = Deno.env.get('NOTIFICATION_WORKER_SECRET') ?? '';
const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim() || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')?.trim() || '';

const serverKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || '';

// ==========================================
// CONFIGURACIÓN DE CORS
// ==========================================

const allowedOrigins = [
  'http://localhost:8100',
  'https://localhost',
  // Agregar aquí el dominio de producción.
];

function getCorsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && allowedOrigins.includes(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    Vary: 'Origin',
  };
}

// ==========================================
// RESPUESTAS JSON
// ==========================================

function jsonResponse(body: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return Response.json(body, {
    status,
    headers: {
      ...corsHeaders,
      'Cache-Control': 'no-store',
    },
  });
}

// ==========================================
// FUNCIÓN PRINCIPAL
// ==========================================

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  // ----------------------------------------
  // VALIDAR CORS
  // ----------------------------------------

  if (request.method === 'OPTIONS') {
    if (!origin || !allowedOrigins.includes(origin)) {
      return jsonResponse({ error: 'ORIGIN_NOT_ALLOWED' }, 403, corsHeaders);
    }

    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (origin && !allowedOrigins.includes(origin)) {
    return jsonResponse({ error: 'ORIGIN_NOT_ALLOWED' }, 403, corsHeaders);
  }

  // ----------------------------------------
  // VALIDAR MÉTODO
  // ----------------------------------------

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405, corsHeaders);
  }

  // ----------------------------------------
  // VALIDAR TOKEN
  // ----------------------------------------

  const authorization = request.headers.get('Authorization');
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);

  if (!match) {
    return jsonResponse({ error: 'UNAUTHENTICATED' }, 401, corsHeaders);
  }

  // ----------------------------------------
  // VALIDAR CONFIGURACIÓN
  // ----------------------------------------

  if (!supabaseUrl || !supabaseKey || !serverKey) {
    return jsonResponse({ error: 'SERVER_CONFIGURATION_ERROR' }, 503, corsHeaders);
  }

  try {
    // --------------------------------------
    // VALIDAR SESIÓN
    // --------------------------------------

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data, error } = await supabase.auth.getUser(match[1]);

    if (error || !data.user) {
      return jsonResponse({ error: 'UNAUTHENTICATED' }, 401, corsHeaders);
    }

    // --------------------------------------
    // CLIENTE ADMINISTRATIVO
    // --------------------------------------

    const adminClient = createClient(supabaseUrl, serverKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    // --------------------------------------
    // CONSULTAR PERFIL
    // --------------------------------------

    const { data: perfil, error: perfilError } = await adminClient
      .from('usuarios')
      .select('id, rol, activo')
      .eq('id', data.user.id)
      .maybeSingle();

    if (perfilError) {
      console.error('ERROR_CONSULTAR_PERFIL', {
        code: perfilError.code,
      });

      return jsonResponse({ error: 'INTERNAL_ERROR' }, 500, corsHeaders);
    }

    // --------------------------------------
    // VALIDAR PERMISOS
    // --------------------------------------

    if (!perfil || perfil.activo !== true || !['administrador', 'instructor'].includes(perfil.rol)) {
      return jsonResponse({ error: 'FORBIDDEN' }, 403, corsHeaders);
    }

    // --------------------------------------
    // VALIDAR JSON
    // --------------------------------------

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'INVALID_JSON' }, 400, corsHeaders);
    }

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return jsonResponse({ error: 'INVALID_BODY' }, 400, corsHeaders);
    }

    // --------------------------------------
    // VALIDAR CLAVE DE IDEMPOTENCIA
    // --------------------------------------

    const { clave_idempotencia } = body as {
      clave_idempotencia?: unknown;
    };

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (typeof clave_idempotencia !== 'string' || !uuidRegex.test(clave_idempotencia)) {
      return jsonResponse({ error: 'INVALID_IDEMPOTENCY_KEY' }, 400, corsHeaders);
    }

    // --------------------------------------
    // FUNCIÓN AUXILIAR DE IDEMPOTENCIA
    // --------------------------------------

    async function buscarSolicitudExistente() {
      return await adminClient
        .from('eventos_alarma_manual')
        .select('id, tipo, titulo, mensaje, severidad, ' + 'estado, fecha_activacion, activado_por')
        .eq('clave_idempotencia', clave_idempotencia)
        .maybeSingle();
    }

    // --------------------------------------
    // VERIFICAR SI YA EXISTE ESTA SOLICITUD
    // --------------------------------------

    const { data: solicitudExistente, error: solicitudError } = await buscarSolicitudExistente();

    if (solicitudError) {
      console.error('ERROR_CONSULTAR_IDEMPOTENCIA', {
        code: solicitudError.code,
      });

      return jsonResponse({ error: 'INTERNAL_ERROR' }, 500, corsHeaders);
    }

    if (solicitudExistente) {
      if (solicitudExistente.activado_por !== data.user.id) {
        return jsonResponse({ error: 'IDEMPOTENCY_CONFLICT' }, 409, corsHeaders);
      }

      const { activado_por: _activadoPor, ...alarmaOriginal } = solicitudExistente;

      return jsonResponse(
        {
          status: 'ACTIVATED',
          alarma: alarmaOriginal,
        },
        200,
        corsHeaders,
      );
    }

    // --------------------------------------
    // REGISTRAR ALARMA MANUAL
    // --------------------------------------

    const { data: alarma, error: insertError } = await adminClient
      .from('eventos_alarma_manual')
      .insert({
        tipo: 'alarma_manual',
        titulo: '⚠️ PRECAUCIÓN',
        mensaje: 'Diríjase con calma a la zona segura y siga las indicaciones del personal autorizado.',
        severidad: 'critical',
        activado_por: data.user.id,
        clave_idempotencia,
      })
      .select('id, tipo, titulo, mensaje, severidad, ' + 'estado, fecha_activacion')
      .single();

    // --------------------------------------
    // MANEJAR CONFLICTOS DE INSERCIÓN
    // --------------------------------------

    if (insertError) {
      // 23505: violación de restricción UNIQUE.
      if (insertError.code === '23505') {
        // Puede haber una carrera entre solicitudes
        // con la misma clave. Consultamos primero
        // la solicitud original.
        const { data: existente, error: consultaError } = await buscarSolicitudExistente();

        if (consultaError) {
          console.error('ERROR_RECONSULTAR_IDEMPOTENCIA', {
            code: consultaError.code,
          });

          return jsonResponse({ error: 'INTERNAL_ERROR' }, 500, corsHeaders);
        }

        if (existente) {
          if (existente.activado_por !== data.user.id) {
            return jsonResponse({ error: 'IDEMPOTENCY_CONFLICT' }, 409, corsHeaders);
          }

          const { activado_por: _activadoPor, ...alarmaOriginal } = existente;

          return jsonResponse(
            {
              status: 'ACTIVATED',
              alarma: alarmaOriginal,
            },
            200,
            corsHeaders,
          );
        }

        // La clave no existe: comprobar si el
        // conflicto corresponde a la alarma activa.
        const { data: alarmasActivas, error: activasError } = await adminClient
          .from('eventos_alarma_manual')
          .select('id')
          .eq('estado', 'activa')
          .limit(1);

        if (activasError) {
          console.error('ERROR_CONSULTAR_ALARMA_ACTIVA', {
            code: activasError.code,
          });

          return jsonResponse({ error: 'INTERNAL_ERROR' }, 500, corsHeaders);
        }

        if (alarmasActivas && alarmasActivas.length > 0) {
          return jsonResponse({ error: 'ACTIVE_ALARM_EXISTS' }, 409, corsHeaders);
        }

        // Si no se identifica el conflicto,
        // no asumir que fue por la alarma activa.
        console.error('UNIDENTIFIED_UNIQUE_CONFLICT', {
          code: insertError.code,
        });

        return jsonResponse({ error: 'INTERNAL_ERROR' }, 500, corsHeaders);
      }

      console.error('ERROR_INSERTAR_ALARMA', {
        code: insertError.code,
        message: insertError.message,
      });

      return jsonResponse({ error: 'INTERNAL_ERROR' }, 500, corsHeaders);
    }

    // --------------------------------------
    // ACTIVACIÓN EXITOSA
    // --------------------------------------
    // --------------------------------------
    // EJECUTAR WORKER DE NOTIFICACIONES FCM
    // --------------------------------------

    if (notificationWorkerSecret && supabaseUrl) {
      const workerUrl = `${supabaseUrl}/functions/v1/procesar-notificaciones-emergencia`;

      const envioFCM = fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-worker-secret': notificationWorkerSecret,
        },
        body: JSON.stringify({}),
      })
        .then(async (respuesta) => {
          if (!respuesta.ok) {
            console.error('ERROR_WORKER_FCM', {
              status: respuesta.status,
            });
          }
        })
        .catch((error) => {
          console.error('ERROR_CONEXION_WORKER_FCM', error instanceof Error ? error.message : 'Unknown error');
        });

      EdgeRuntime.waitUntil(envioFCM);
    } else {
      console.error('CONFIGURACION_WORKER_FCM_INCOMPLETA');
    }
    
    return jsonResponse(
      {
        status: 'ACTIVATED',
        alarma,
      },
      201,
      corsHeaders,
    );
  } catch (error) {
    console.error('ERROR_ACTIVAR_ALARMA', error instanceof Error ? error.message : 'Unknown error');

    return jsonResponse({ error: 'INTERNAL_ERROR' }, 500, corsHeaders);
  }
});
