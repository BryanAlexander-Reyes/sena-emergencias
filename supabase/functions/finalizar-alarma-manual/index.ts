import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

// ==========================================
// CONFIGURACIÓN DE SUPABASE
// ==========================================

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim() || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')?.trim() || '';

const serverKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || '';

// ==========================================
// CONFIGURACIÓN DE CORS
// ==========================================

const allowedOrigins = [
  'http://localhost:8100',
  'https://localhost',
  // WebView de Capacitor 8 (androidScheme https) y esquema clásico.
  'capacitor://localhost',
  // Dominios adicionales de producción, separados por comas.
  ...(Deno.env.get('CORS_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== ''),
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
// CONTRATO DE RESPUESTA
// ==========================================

/**
 * Normaliza la fila sin inventar campos: las alarmas históricas anteriores a
 * MQTT.3B no tienen `evento`/`origen` y se devuelven con evento null y origen
 * cliente, igual que en el resto del sistema. `select('*')` tolera ambos
 * esquemas (con y sin las columnas nuevas del SQL manual).
 */
function construirAlarma(fila: Record<string, unknown>) {
  const evento = typeof fila['evento'] === 'string' ? fila['evento'] : null;

  return {
    id: fila['id'],
    tipo: fila['tipo'],
    titulo: fila['titulo'],
    mensaje: fila['mensaje'],
    severidad: fila['severidad'],
    estado: fila['estado'],
    fecha_activacion: fila['fecha_activacion'],
    fecha_finalizacion: fila['fecha_finalizacion'] ?? null,
    evento,
    origen: typeof fila['origen'] === 'string' ? fila['origen'] : 'cliente',
    eventoReportado: evento !== null,
  };
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
    // Administrador e Instructor son idénticos para alarmas; Aprendiz no
    // puede finalizar. El perfil debe existir y estar activo.

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
    // VALIDAR IDENTIFICADOR DE ALARMA
    // --------------------------------------

    const { alarma_id } = body as {
      alarma_id?: unknown;
    };

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (typeof alarma_id !== 'string' || !uuidRegex.test(alarma_id)) {
      return jsonResponse({ error: 'INVALID_ALARM_ID' }, 400, corsHeaders);
    }

    // --------------------------------------
    // CONSULTAR LA ALARMA
    // --------------------------------------
    // select('*') funciona tanto con el esquema histórico como con el que
    // añade evento/origen mediante el SQL manual. No se asume ninguna columna.

    const { data: fila, error: consultaError } = await adminClient
      .from('eventos_alarma_manual')
      .select('*')
      .eq('id', alarma_id)
      .maybeSingle();

    if (consultaError) {
      console.error('ERROR_CONSULTAR_ALARMA', {
        code: consultaError.code,
      });

      return jsonResponse({ error: 'INTERNAL_ERROR' }, 500, corsHeaders);
    }

    if (!fila) {
      return jsonResponse({ error: 'ALARM_NOT_FOUND' }, 404, corsHeaders);
    }

    // --------------------------------------
    // IDEMPOTENCIA: YA FINALIZADA
    // --------------------------------------
    // Repetir la finalización devuelve el mismo resultado sin escribir nada.
    // Compatible con alarmas históricas evento=null.

    if (fila['estado'] === 'finalizada') {
      return jsonResponse(
        {
          status: 'FINALIZED',
          alarma: construirAlarma(fila),
        },
        200,
        corsHeaders,
      );
    }

    if (fila['estado'] !== 'activa') {
      return jsonResponse({ error: 'INVALID_ALARM_STATE' }, 409, corsHeaders);
    }

    // --------------------------------------
    // FINALIZAR DE FORMA CONDICIONAL
    // --------------------------------------
    // El filtro estado='activa' evita pisar una finalización concurrente.
    // fecha_finalizacion solo se escribe si la columna existe en el esquema.

    const cambios: Record<string, unknown> = { estado: 'finalizada' };

    if ('fecha_finalizacion' in fila) {
      cambios['fecha_finalizacion'] = new Date().toISOString();
    }

    const { data: actualizada, error: updateError } = await adminClient
      .from('eventos_alarma_manual')
      .update(cambios)
      .eq('id', alarma_id)
      .eq('estado', 'activa')
      .select('*')
      .maybeSingle();

    if (updateError) {
      console.error('ERROR_FINALIZAR_ALARMA', {
        code: updateError.code,
      });

      return jsonResponse({ error: 'INTERNAL_ERROR' }, 500, corsHeaders);
    }

    // --------------------------------------
    // CARRERA: OTRA SOLICITUD FINALIZÓ PRIMERO
    // --------------------------------------

    if (!actualizada) {
      const { data: releida, error: relecturaError } = await adminClient
        .from('eventos_alarma_manual')
        .select('*')
        .eq('id', alarma_id)
        .maybeSingle();

      if (relecturaError) {
        console.error('ERROR_RELEER_ALARMA', {
          code: relecturaError.code,
        });

        return jsonResponse({ error: 'INTERNAL_ERROR' }, 500, corsHeaders);
      }

      if (!releida) {
        return jsonResponse({ error: 'ALARM_NOT_FOUND' }, 404, corsHeaders);
      }

      if (releida['estado'] === 'finalizada') {
        return jsonResponse(
          {
            status: 'FINALIZED',
            alarma: construirAlarma(releida),
          },
          200,
          corsHeaders,
        );
      }

      return jsonResponse({ error: 'INVALID_ALARM_STATE' }, 409, corsHeaders);
    }

    // --------------------------------------
    // FINALIZACIÓN EXITOSA
    // --------------------------------------
    // Esta función SOLO persiste. El comando MQTT de apagado lo publica el
    // backend autorizado después de esta respuesta; no se afirma ninguna
    // confirmación física del ESP32 (no existe ACK de hardware).

    return jsonResponse(
      {
        status: 'FINALIZED',
        alarma: construirAlarma(actualizada),
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    console.error('ERROR_FINALIZAR_ALARMA', error instanceof Error ? error.message : 'Unknown error');

    return jsonResponse({ error: 'INTERNAL_ERROR' }, 500, corsHeaders);
  }
});
