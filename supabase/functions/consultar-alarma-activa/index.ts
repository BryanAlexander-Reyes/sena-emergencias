import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Consulta pública de avisos, también para Aprendiz. Nunca devuelve identidad
// del operador, claves de idempotencia, tokens ni el resto de la fila interna.
const origins = new Set([
  'http://localhost:8100', 'http://localhost:4200', 'https://localhost', 'capacitor://localhost',
  ...(Deno.env.get('CORS_ALLOWED_ORIGINS') ?? '').split(',').map(value => value.trim()).filter(Boolean),
]);

Deno.serve(async request => {
  const origin = request.headers.get('Origin');
  const headers = {
    'Access-Control-Allow-Origin': origin && origins.has(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Cache-Control': 'no-store', Vary: 'Origin',
  };
  const json = (body: unknown, status: number) => Response.json(body, { status, headers });
  if (origin && !origins.has(origin)) return json({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !key) return json({ error: 'SERVER_CONFIGURATION_ERROR' }, 503);
  try {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await client.from('eventos_alarma_manual').select('*')
      .eq('tipo', 'alarma_manual').eq('estado', 'activa')
      .order('fecha_activacion', { ascending: true }).order('id', { ascending: true }).limit(1000);
    // No mostrar una lista parcial como si representara todas las emergencias.
    if (error || !data || data.length >= 1000) return json({ error: 'ALARM_QUERY_FAILED' }, 503);
    const alarmas = data.map(row => ({
      id: row.id, tipo: row.tipo, titulo: row.titulo, mensaje: row.mensaje,
      severidad: row.severidad, estado: row.estado, fecha_activacion: row.fecha_activacion,
      evento: typeof row.evento === 'string' ? row.evento : null,
      origen: typeof row.origen === 'string' ? row.origen : 'cliente',
      eventoReportado: typeof row.evento === 'string',
    }));
    return json({ status: 'SUCCESS', hay_alarma_activa: alarmas.length > 0, alarmas }, 200);
  } catch {
    return json({ error: 'ALARM_QUERY_FAILED' }, 503);
  }
});
