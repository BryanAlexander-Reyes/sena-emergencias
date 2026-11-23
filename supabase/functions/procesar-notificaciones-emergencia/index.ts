/**
 * Worker de envío FCM para emergencias manuales — CÓDIGO PREPARADO LOCALMENTE.
 *
 * NO se ha desplegado. Procesa filas de `public.notificaciones_emergencia_outbox`
 * (patrón outbox persistente) y envía notificaciones usando FCM HTTP v1.
 *
 * Seguridad:
 * - Solo se invoca con `x-worker-secret` (configurado manualmente en Supabase).
 * - Nunca expone la cuenta de servicio ni la clave de servicio al cliente.
 * - Los tokens FCM y App Check jamás se escriben en logs.
 * - El reclamo y la finalización usan RPC atómicas con arrendamiento (lease).
 *
 * IMPORTANTE: no se puede garantizar entrega exactamente una vez. Si Firebase
 * acepta un mensaje y el proceso falla antes de persistir el resultado, un
 * reintento podría volver a enviarlo. El lease y el detalle de entregas reducen
 * la ventana, pero no la eliminan.
 *
 * El alta en la outbox la realiza la lógica de activación existente, que debe
 * conservar su autorización, idempotencia y reglas de negocio.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { importPKCS8, SignJWT } from 'npm:jose@6';

const OUTBOX_TABLE = 'notificaciones_emergencia_outbox';
const DELIVERIES_TABLE = 'notificaciones_emergencia_envios';
const DEVICES_TABLE = 'dispositivos_fcm';

const CLAIM_RPC = 'reclamar_notificacion_emergencia';
const RENEW_RPC = 'renovar_lease_notificacion_emergencia';
const FINISH_RPC = 'finalizar_notificacion_emergencia';

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

const ERROR_CODES = {
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  CONFIGURATION_MISSING: 'CONFIGURATION_MISSING',
  PROCESSING_FAILED: 'PROCESSING_FAILED',
} as const;

interface ServiceAccount {
  readonly clientEmail: string;
  readonly privateKeyPem: string;
}

interface OutboxJob {
  readonly id: string;
  readonly alarma_id: string;
  readonly tipo: string | null;
  readonly titulo: string | null;
  readonly mensaje: string | null;
  readonly intentos: number;
  readonly leaseId: string;
}

interface SendOutcome {
  readonly ok: boolean;
  readonly invalidToken: boolean;
  readonly code: string;
}

interface DeviceToken {
  readonly token: string;
  readonly tokenHash: string;
}

interface FcmErrorInfo {
  /** Código FcmError/status devuelto por Firebase, sin cuerpos ni tokens. */
  readonly code: string;
  /** true solo si hay evidencia de que el registro/token es el problema. */
  readonly invalidatesToken: boolean;
}

interface FinishTarget {
  readonly estado: 'enviado' | 'pendiente' | 'fallido';
  readonly codigo: string | null;
  readonly proximoIntentoEn: string | null;
}

type DeliveryState = 'enviado' | 'fallido' | 'invalido';

const workerSecret = (Deno.env.get('NOTIFICATION_WORKER_SECRET') ?? '').trim();
const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim();
const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
const secretKeysRaw = Deno.env.get('SUPABASE_SECRET_KEYS') ?? '';
const projectId = (Deno.env.get('FIREBASE_PROJECT_ID') ?? '').trim();

const DEVICE_PAGE_SIZE = readPositiveInt('FCM_DEVICE_PAGE_SIZE', 500, 1000);
const DELIVERY_PAGE_SIZE = readPositiveInt('FCM_DELIVERY_PAGE_SIZE', 500, 1000);
const SEND_CHUNK_SIZE = readPositiveInt('FCM_SEND_CHUNK_SIZE', 200, 1000);
const SEND_CONCURRENCY = readPositiveInt('FCM_SEND_CONCURRENCY', 8, 20);
const MAX_JOBS_PER_RUN = readPositiveInt('FCM_JOBS_PER_RUN', 5, 20);
const MAX_ATTEMPTS = readPositiveInt('FCM_MAX_ATTEMPTS', 5, 10);
const LEASE_SECONDS = readIntInRange('FCM_LEASE_SECONDS', 300, 60, 900);

function readPositiveInt(name: string, fallback: number, max: number): number {
  const raw = Deno.env.get(name)?.trim();
  if (raw === undefined || raw === '' || !/^\d+$/.test(raw)) {
    return fallback;
  }

  const parsed = Number(raw);
  return parsed > 0 && parsed <= max ? parsed : fallback;
}

function readIntInRange(name: string, fallback: number, min: number, max: number): number {
  const raw = Deno.env.get(name)?.trim();
  if (raw === undefined || raw === '' || !/^\d+$/.test(raw)) {
    return fallback;
  }

  const parsed = Number(raw);
  return parsed >= min && parsed <= max ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function resolveServerKey(): string {
  if (serviceRoleKey.length > 0) {
    return serviceRoleKey;
  }

  if (secretKeysRaw.length === 0) {
    return '';
  }

  try {
    const parsed: unknown = JSON.parse(secretKeysRaw);

    if (!isRecord(parsed) || !('default' in parsed)) {
      return '';
    }

    const value = parsed['default'];
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

function parseServiceAccount(): ServiceAccount | null {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') ?? '';
  if (raw.trim().length === 0) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return null;
    }

    const clientEmail = parsed['client_email'];
    const privateKey = parsed['private_key'];

    if (typeof clientEmail !== 'string' || clientEmail.trim().length === 0) {
      return null;
    }

    if (typeof privateKey !== 'string' || !privateKey.includes('BEGIN PRIVATE KEY')) {
      return null;
    }

    return { clientEmail: clientEmail.trim(), privateKeyPem: privateKey };
  } catch {
    return null;
  }
}

/** Comparación de longitud constante para el secreto del worker. */
function safeEqual(candidate: string, expected: string): boolean {
  if (candidate.length !== expected.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < candidate.length; index += 1) {
    difference |= candidate.charCodeAt(index) ^ expected.charCodeAt(index);
  }

  return difference === 0;
}

function jsonResponse(body: Record<string, string | number>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

const serverKey = resolveServerKey();
const serviceAccount = parseServiceAccount();
const configurationComplete =
  workerSecret.length > 0 &&
  supabaseUrl.length > 0 &&
  serverKey.length > 0 &&
  projectId.length > 0 &&
  serviceAccount !== null;

const adminClient = configurationComplete
  ? createClient(supabaseUrl, serverKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'X-Client-Info': 'procesar-notificaciones-emergencia' } },
    })
  : null;

let cachedAccessToken: { value: string; expiresAt: number } | null = null;
let cachedPrivateKey: CryptoKey | null = null;

async function getAccessToken(account: ServiceAccount): Promise<string> {
  if (cachedAccessToken !== null && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }

  if (cachedPrivateKey === null) {
    cachedPrivateKey = await importPKCS8(account.privateKeyPem, 'RS256');
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: OAUTH_SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(account.clientEmail)
    .setAudience(OAUTH_TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(cachedPrivateKey);

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });

  if (!response.ok) {
    // No se registra el cuerpo: podría contener información del proveedor.
    throw new Error('OAUTH_TOKEN_REQUEST_FAILED');
  }

  const payload: unknown = await response.json();

  if (
    !isRecord(payload) ||
    typeof payload['access_token'] !== 'string' ||
    typeof payload['expires_in'] !== 'number'
  ) {
    throw new Error('OAUTH_TOKEN_RESPONSE_INVALID');
  }

  cachedAccessToken = {
    value: payload['access_token'],
    expiresAt: Date.now() + payload['expires_in'] * 1000,
  };

  return cachedAccessToken.value;
}

/**
 * Analiza únicamente metadatos de error. Nunca devuelve mensajes completos ni
 * tokens. Un `INVALID_ARGUMENT` genérico NO invalida un dispositivo: hace falta
 * evidencia de que el campo `message.token` / el registro es el causante.
 */
function parseFcmError(payload: unknown): FcmErrorInfo {
  if (!isRecord(payload)) {
    return { code: 'UNKNOWN_FCM_ERROR', invalidatesToken: false };
  }

  const error: Record<string, unknown> = isRecord(payload['error'])
    ? (payload['error'] as Record<string, unknown>)
    : payload;

  const details = Array.isArray(error['details']) ? error['details'] : [];
  const message = typeof error['message'] === 'string' ? error['message'] : '';

  let fcmCode: string | null = null;
  let tokenFieldViolation = false;

  for (const detail of details) {
    if (!isRecord(detail)) {
      continue;
    }

    const type = typeof detail['@type'] === 'string' ? detail['@type'] : '';
    const code = typeof detail['errorCode'] === 'string' ? detail['errorCode'] : '';

    if (type.includes('FcmError') && code.length > 0) {
      fcmCode = code;
    }

    const fieldViolations = detail['fieldViolations'];
    if (Array.isArray(fieldViolations)) {
      for (const violation of fieldViolations) {
        if (!isRecord(violation)) {
          continue;
        }

        const field = typeof violation['field'] === 'string' ? violation['field'] : '';
        if (/(^|\.)token$|message\.token|registration[ _-]?token/i.test(field)) {
          tokenFieldViolation = true;
        }
      }
    }
  }

  const tokenMessageEvidence =
    /(message\.token|registration[ _-]?token|\btoken\b)/i.test(message) &&
    /(invalid|unregistered|not found|malformed|bad|unknown)/i.test(message);

  const code =
    fcmCode ??
    (typeof error['status'] === 'string' ? error['status'] : 'UNKNOWN_FCM_ERROR');

  const invalidatesToken =
    code === 'UNREGISTERED' ||
    (code === 'INVALID_ARGUMENT' && (tokenFieldViolation || tokenMessageEvidence));

  return { code, invalidatesToken };
}

async function sendToFcm(
  accessToken: string,
  tokenFcm: string,
  job: OutboxJob,
): Promise<SendOutcome> {
  const title = job.titulo?.trim() || 'ALERTA DE EMERGENCIA';
  const body =
    job.mensaje?.trim() || 'Se ha activado una alerta de emergencia. Sigue las indicaciones oficiales.';

  try {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: tokenFcm,
            notification: { title, body },
            data: {
              alarma_id: job.alarma_id,
              tipo: job.tipo ?? '',
              titulo: title,
              mensaje: body,
            },
            android: { priority: 'high' },
          },
        }),
      },
    );

    if (response.ok) {
      return { ok: true, invalidToken: false, code: 'OK' };
    }

    const payload: unknown = await response.json().catch(() => null);
    const parsed = parseFcmError(payload);

    return {
      ok: false,
      invalidToken: parsed.invalidatesToken,
      // Los errores generales de solicitud no se presentan como fallos de token.
      code: parsed.invalidatesToken ? parsed.code : `HTTP_${response.status}`,
    };
  } catch {
    // Error de red/DNS/TLS: reintentable, nunca se trata como token inválido.
    return { ok: false, invalidToken: false, code: 'NETWORK_ERROR' };
  }
}

/** Limita cuántas llamadas a Firebase se hacen a la vez. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  operation: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await operation(items[index] as T);
    }
  });

  await Promise.all(workers);
  return results;
}

/** Hash irreversible del token: permite dedupe por dispositivo sin guardarlo en claro. */
async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function collectActiveDeviceTokens(): Promise<DeviceToken[]> {
  if (adminClient === null) {
    return [];
  }

  const tokens = new Map<string, string>();
  let offset = 0;

  // Se recopila antes de enviar: dar de baja tokens durante la paginación
  // desplazaría las filas y provocaría omisiones. El ORDER BY hace estable
  // la paginación por offset.
  for (;;) {
    const { data, error } = await adminClient
      .from(DEVICES_TABLE)
      .select('token_fcm')
      .eq('activo', true)
      .order('token_fcm', { ascending: true })
      .range(offset, offset + DEVICE_PAGE_SIZE - 1);

    if (error !== null) {
      throw new Error('DEVICE_QUERY_FAILED');
    }

    const rows = data ?? [];
    for (const row of rows) {
      const token = row['token_fcm'];
      if (typeof token === 'string' && token.trim().length > 0) {
        const normalized = token.trim();
        tokens.set(normalized, await hashToken(normalized));
      }
    }

    if (rows.length < DEVICE_PAGE_SIZE) {
      break;
    }

    offset += DEVICE_PAGE_SIZE;
  }

  return [...tokens].map(([token, tokenHash]) => ({ token, tokenHash }));
}

/**
 * PostgREST trunca silenciosamente a 1000 filas por respuesta. Se pagina con
 * ORDER BY estable para que el detalle de entregas tampoco se pierda.
 */
async function loadDeliveryStates(jobId: string): Promise<Map<string, DeliveryState>> {
  const states = new Map<string, DeliveryState>();
  if (adminClient === null) {
    return states;
  }

  let offset = 0;

  for (;;) {
    const { data, error } = await adminClient
      .from(DELIVERIES_TABLE)
      .select('token_hash, estado')
      .eq('notificacion_id', jobId)
      .order('token_hash', { ascending: true })
      .range(offset, offset + DELIVERY_PAGE_SIZE - 1);

    if (error !== null) {
      throw new Error('DELIVERY_QUERY_FAILED');
    }

    const rows = data ?? [];
    for (const row of rows) {
      const hash = row['token_hash'];
      const state = row['estado'];
      if (
        typeof hash === 'string' &&
        (state === 'enviado' || state === 'fallido' || state === 'invalido')
      ) {
        states.set(hash, state);
      }
    }

    if (rows.length < DELIVERY_PAGE_SIZE) {
      break;
    }

    offset += DELIVERY_PAGE_SIZE;
  }

  return states;
}

async function saveDeliveryStates(
  jobId: string,
  results: readonly { tokenHash: string; outcome: SendOutcome }[],
): Promise<void> {
  if (adminClient === null || results.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  const rows = results.map(({ tokenHash, outcome }) => {
    const state: DeliveryState = outcome.ok
      ? 'enviado'
      : outcome.invalidToken
        ? 'invalido'
        : 'fallido';

    return {
      notificacion_id: jobId,
      token_hash: tokenHash,
      estado: state,
      ultimo_error_codigo: outcome.ok ? null : outcome.code,
      actualizado_en: now,
    };
  });

  for (let index = 0; index < rows.length; index += 100) {
    const chunk = rows.slice(index, index + 100);
    const { data, error } = await adminClient
      .from(DELIVERIES_TABLE)
      .upsert(chunk, { onConflict: 'notificacion_id,token_hash' })
      .select('token_hash');

    if (error !== null) {
      throw new Error('DELIVERY_SAVE_FAILED');
    }

    if (!Array.isArray(data) || data.length !== chunk.length) {
      throw new Error('DELIVERY_SAVE_INCOMPLETE');
    }
  }
}

/** Reclamo atómico mediante RPC con SELECT ... FOR UPDATE SKIP LOCKED. */
async function claimNextJob(): Promise<OutboxJob | null> {
  if (adminClient === null) {
    return null;
  }

  const leaseId = crypto.randomUUID();
  const { data, error } = await adminClient.rpc(CLAIM_RPC, {
    p_worker_id: leaseId,
    p_lease_seconds: LEASE_SECONDS,
    // PostgreSQL also enforces the limit so crashed workers cannot recover a
    // job forever after FCM_MAX_ATTEMPTS has been reached.
    p_max_intents: MAX_ATTEMPTS,
  });

  if (error !== null) {
    throw new Error('CLAIM_RPC_FAILED');
  }

  const rows: Record<string, unknown>[] = Array.isArray(data)
    ? (data as Record<string, unknown>[])
    : isRecord(data)
      ? [data]
      : [];

  const claimed = rows[0];
  if (claimed === undefined) {
    return null;
  }

  const id = claimed['id'];
  const alarmaId = claimed['alarma_id'];
  if (typeof id !== 'string' || typeof alarmaId !== 'string') {
    return null;
  }

  return {
    id,
    alarma_id: alarmaId,
    tipo: typeof claimed['tipo'] === 'string' ? claimed['tipo'] : null,
    titulo: typeof claimed['titulo'] === 'string' ? claimed['titulo'] : null,
    mensaje: typeof claimed['mensaje'] === 'string' ? claimed['mensaje'] : null,
    intentos: typeof claimed['intentos'] === 'number' ? claimed['intentos'] : 1,
    leaseId,
  };
}

/** Extiende el lease solo mientras este worker siga siendo el propietario. */
async function renewLease(job: OutboxJob): Promise<void> {
  if (adminClient === null) {
    throw new Error('LEASE_RENEW_UNAVAILABLE');
  }

  const { data, error } = await adminClient.rpc(RENEW_RPC, {
    p_id: job.id,
    p_lease_id: job.leaseId,
    p_lease_seconds: LEASE_SECONDS,
  });

  if (error !== null) {
    throw new Error('LEASE_RENEW_FAILED');
  }

  if (data !== true) {
    throw new Error('LEASE_LOST');
  }
}

/**
 * Cierre protegido por lease_id: un worker cuyo arrendamiento venció no puede
 * sobrescribir el resultado de quien tomó el trabajo.
 */
async function finishJob(job: OutboxJob, target: FinishTarget): Promise<boolean> {
  if (adminClient === null) {
    return false;
  }

  const { data, error } = await adminClient.rpc(FINISH_RPC, {
    p_id: job.id,
    p_lease_id: job.leaseId,
    p_estado: target.estado,
    p_error_codigo: target.codigo,
    p_proximo_intento_en: target.proximoIntentoEn,
  });

  if (error !== null) {
    throw new Error('FINISH_RPC_FAILED');
  }

  return data === true;
}

function backoffMs(attempts: number): number {
  const minutes = Math.min(2 ** Math.max(0, attempts - 1), 60);
  return minutes * 60_000;
}

function failureTarget(job: OutboxJob): FinishTarget {
  return job.intentos >= MAX_ATTEMPTS
    ? { estado: 'fallido', codigo: 'PROCESSING_FAILED', proximoIntentoEn: null }
    : {
        estado: 'pendiente',
        codigo: 'PROCESSING_FAILED',
        proximoIntentoEn: new Date(Date.now() + backoffMs(job.intentos)).toISOString(),
      };
}

async function markInvalidTokens(tokens: readonly string[]): Promise<void> {
  if (adminClient === null || tokens.length === 0) {
    return;
  }

  for (let index = 0; index < tokens.length; index += DEVICE_PAGE_SIZE) {
    const chunk = tokens.slice(index, index + DEVICE_PAGE_SIZE);
    // Lotes pequeños para no saturar PostgREST.
    for (let inner = 0; inner < chunk.length; inner += 50) {
      const batch = chunk.slice(inner, inner + 50);
      const { data, error } = await adminClient
        .from(DEVICES_TABLE)
        .update({ activo: false })
        .in('token_fcm', batch)
        .select('token_fcm');

      if (error !== null) {
        throw new Error('DEVICE_DEACTIVATION_FAILED');
      }

      // No se registran tokens: solo se comprueba que la escritura respondió.
      if (!Array.isArray(data) || data.length === 0) {
        console.warn('[notificaciones-emergencia] DEACTIVATION_NO_ROWS');
      }
    }
  }
}

async function processJobs(): Promise<{ procesados: number; enviados: number }> {
  if (adminClient === null || serviceAccount === null) {
    return { procesados: 0, enviados: 0 };
  }

  let procesados = 0;
  let enviados = 0;
  let fallosPersistencia = 0;

  for (let index = 0; index < MAX_JOBS_PER_RUN; index += 1) {
    const job = await claimNextJob();
    if (job === null) {
      break;
    }

    procesados += 1;
    let finishAttempted = false;

    try {
      const dispositivos = await collectActiveDeviceTokens();
      const estados = await loadDeliveryStates(job.id);
      const tokenPorHash = new Map(dispositivos.map((device) => [device.tokenHash, device.token]));

      // Los dispositivos ya entregados (o dados de baja) no se reenvían nunca.
      const pendientes = dispositivos.filter((device) => {
        const estado = estados.get(device.tokenHash);
        return estado === undefined || estado === 'fallido';
      });

      let accessToken: string | null = null;
      let errores = 0;
      let codigoRepresentativo = 'SEND_FAILED';

      // Renovar antes de cada bloque evita que un envío largo pierda el lease.
      for (let start = 0; start < pendientes.length; start += SEND_CHUNK_SIZE) {
        await renewLease(job);

        const chunk = pendientes.slice(start, start + SEND_CHUNK_SIZE);

        // Solo se solicita el token OAuth cuando existe al menos un dispositivo
        // pendiente de envío en este bloque.
        if (accessToken === null) {
          accessToken = await getAccessToken(serviceAccount);
        }
        const tokenForChunk = accessToken;

        const outcomes = await mapWithConcurrency(chunk, SEND_CONCURRENCY, (device) =>
          sendToFcm(tokenForChunk, device.token, job),
        );

        const chunkResults = chunk.map((device, position) => ({
          tokenHash: device.tokenHash,
          outcome:
            outcomes[position] ??
            ({ ok: false, invalidToken: false, code: 'MISSING_OUTCOME' } satisfies SendOutcome),
        }));

        // Persistir inmediatamente este bloque: si la función se interrumpe, el
        // siguiente reintento ya conoce las entregas confirmadas hasta aquí.
        await saveDeliveryStates(job.id, chunkResults);

        const chunkInvalidTokens: string[] = [];
        for (const resultado of chunkResults) {
          if (resultado.outcome.ok) {
            continue;
          }

          errores += 1;
          codigoRepresentativo = resultado.outcome.code;

          if (resultado.outcome.invalidToken) {
            const token = tokenPorHash.get(resultado.tokenHash);
            if (token !== undefined) {
              chunkInvalidTokens.push(token);
            }
          }
        }

        // Solo se desactiva con evidencia específica de token inválido.
        await markInvalidTokens(chunkInvalidTokens);
      }

      const target: FinishTarget =
        errores === 0
          ? { estado: 'enviado', codigo: null, proximoIntentoEn: null }
          : job.intentos >= MAX_ATTEMPTS
            ? { estado: 'fallido', codigo: codigoRepresentativo, proximoIntentoEn: null }
            : {
                estado: 'pendiente',
                codigo: codigoRepresentativo,
                proximoIntentoEn: new Date(Date.now() + backoffMs(job.intentos)).toISOString(),
              };

      const applied = await finishJob(job, target);
      finishAttempted = true;

      if (!applied) {
        throw new Error('LEASE_LOST');
      }

      if (errores === 0) {
        enviados += 1;
      }

      console.log(
        `[notificaciones-emergencia] JOB_FINISHED alarma=${job.alarma_id} ` +
          `destinatarios=${pendientes.length} errores=${errores}`,
      );
    } catch (error) {
      const name = error instanceof Error ? error.name : 'UNKNOWN';
      console.error(`[notificaciones-emergencia] JOB_ERROR name=${name}`);

      if (!finishAttempted) {
        try {
          const applied = await finishJob(job, failureTarget(job));
          finishAttempted = true;
          if (!applied) {
            fallosPersistencia += 1;
          }
        } catch {
          fallosPersistencia += 1;
        }
      } else {
        // El cierre se intentó pero no fue aplicado (lease perdido).
        fallosPersistencia += 1;
      }
    }
  }

  if (fallosPersistencia > 0) {
    // Evita devolver 200 cuando alguna escritura final no se pudo confirmar.
    throw new Error('PERSISTENCE_FAILURES');
  }

  return { procesados, enviados };
}

async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: ERROR_CODES.METHOD_NOT_ALLOWED }, 405);
  }

  const providedSecret = request.headers.get('x-worker-secret') ?? '';
  if (workerSecret.length === 0 || !safeEqual(providedSecret, workerSecret)) {
    return jsonResponse({ error: ERROR_CODES.UNAUTHORIZED }, 401);
  }

  if (!configurationComplete || adminClient === null) {
    console.error('[notificaciones-emergencia] CONFIGURATION_MISSING');
    return jsonResponse({ error: ERROR_CODES.CONFIGURATION_MISSING }, 503);
  }

  try {
    const result = await processJobs();
    return jsonResponse({ status: 'OK', ...result }, 200);
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UNKNOWN';
    console.error(`[notificaciones-emergencia] PROCESSING_FAILED name=${name}`);
    return jsonResponse({ error: ERROR_CODES.PROCESSING_FAILED }, 500);
  }
}

Deno.serve(handler);
