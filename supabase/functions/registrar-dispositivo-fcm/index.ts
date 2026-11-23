/**
 * Edge Function `registrar-dispositivo-fcm`.
 *
 * Registro automático de dispositivos FCM para APK distribuidas fuera de
 * Google Play. Firebase App Check es una señal opcional: cuando se envía, se
 * verifica criptográficamente; cuando no está disponible, se usa un desafío
 * FCM data-only para demostrar posesión del token, además de límites de abuso.
 *
 * Seguridad:
 * - CORS no es autenticación; es solo un filtro de navegador.
 * - La Publishable Key de Supabase no autoriza nada y se ignora.
 * - service_role y las credenciales Firebase permanecen solo en Supabase.
 * - La APK nunca envía hashes: esta función calcula todos los hashes.
 * - installation_id es solo una dimensión de rate limit, nunca una identidad.
 * - Recibir un desafío demuestra control del token FCM, NO autenticidad de la APK.
 *
 * Contrato RPC confirmado en PostgreSQL:
 * - registrar_intento_fcm(p_ip_hash text, p_token_hash text,
 *     p_installation_hash text, p_accion text) RETURNS boolean
 * - crear_desafio_fcm(p_token_hash text, p_challenge_hash text)
 *     RETURNS boolean
 * - confirmar_registro_fcm(p_token_fcm text, p_token_hash text,
 *     p_challenge_hash text, p_plataforma text) RETURNS boolean
 *
 * `consumir_desafio_fcm` existe, pero NO se invoca aquí:
 * `confirmar_registro_fcm` consume el desafío y registra en la misma
 * transacción. PostgreSQL valida que `p_token_hash` corresponda a
 * `p_token_fcm`; esta función solo calcula el SHA-256 y lo reenvía.
 *
 * Las RPC no devuelven tiempos de reintento, por lo que se usa una espera
 * conservadora documentada. App Check se verifica si se envía, pero no habilita
 * registro directo mientras no exista protección contra reutilización.
 *
 * Si la firma o el tipo de respuesta no coincide, la función falla cerrada.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'npm:jose@6';

const JWKS_URL = 'https://firebaseappcheck.googleapis.com/v1/jwks';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const FCM_MESSAGES_BASE_URL = 'https://fcm.googleapis.com/v1/projects';

const MAX_BODY_BYTES = 16 * 1024;
const TOKEN_MIN_LENGTH = 20;
const TOKEN_MAX_LENGTH = 4096;
const APP_CHECK_MIN_LENGTH = 50;
const APP_CHECK_MAX_LENGTH = 8192;
const CHALLENGE_MIN_LENGTH = 32;
const CHALLENGE_MAX_LENGTH = 256;
const CHALLENGE_BYTES = 32;
const EXTERNAL_TIMEOUT_MS = 8000;

/**
 * Las RPC no devuelven `retry_after_seconds`. Esta espera es conservadora y
 * documentada; no pretende reflejar una ventana exacta de la base de datos.
 */
const CONSERVATIVE_RETRY_SECONDS = 60;

/** Evita reemplazar un desafío aún no entregado dentro de esta instancia. */
const CHALLENGE_RESEND_COOLDOWN_SECONDS = CONSERVATIVE_RETRY_SECONDS;
const MAX_COOLDOWN_ENTRIES = 10_000;

const ERROR_CODES = {
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_APP_CHECK_TOKEN: 'INVALID_APP_CHECK_TOKEN',
  APP_CHECK_UNAVAILABLE: 'APP_CHECK_UNAVAILABLE',
  INVALID_CHALLENGE: 'INVALID_CHALLENGE',
  RATE_LIMITED: 'RATE_LIMITED',
  CHALLENGE_REQUIRED: 'CHALLENGE_REQUIRED',
  CHALLENGE_PENDING: 'CHALLENGE_PENDING',
  CONFIGURATION_MISSING: 'CONFIGURATION_MISSING',
  RPC_FAILED: 'RPC_FAILED',
  FCM_DELIVERY_FAILED: 'FCM_DELIVERY_FAILED',
} as const;

type Accion = 'solicitar' | 'confirmar';

interface ParsedRegistration {
  readonly accion: Accion;
  readonly tokenFcm: string;
  readonly plataforma: 'android';
  readonly appCheckToken: string | null;
  readonly challengeToken: string | null;
  readonly installationId: string | null;
}

interface ServiceAccount {
  readonly clientEmail: string;
  readonly privateKeyPem: string;
}

interface RateLimitDecision {
  readonly permitido: boolean;
}

interface FcmSendResult {
  readonly ok: boolean;
  readonly code: string;
}

const projectNumber = (Deno.env.get('FIREBASE_PROJECT_NUMBER') ?? '').trim();
const projectId = (Deno.env.get('FIREBASE_PROJECT_ID') ?? '').trim();
const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim();
const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
const secretKeysRaw = Deno.env.get('SUPABASE_SECRET_KEYS') ?? '';
const rateLimitPepper = (Deno.env.get('REGISTRATION_RATE_LIMIT_PEPPER') ?? '').trim();
const challengeTtlSeconds = readIntInRange(
  'REGISTRO_FCM_CHALLENGE_TTL_SECONDS',
  300,
  60,
  900,
);

/** App IDs permitidos solo se aplican cuando se envía un token App Check. */
const allowedAppIds = (Deno.env.get('FIREBASE_APP_ID') ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

const allowedOrigins = parseAllowedOrigins(Deno.env.get('CORS_ALLOWED_ORIGINS') ?? '');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readIntInRange(name: string, fallback: number, min: number, max: number): number {
  const raw = Deno.env.get(name)?.trim();
  if (raw === undefined || raw === '' || !/^\d+$/.test(raw)) {
    return fallback;
  }

  const parsed = Number(raw);
  return parsed >= min && parsed <= max ? parsed : fallback;
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

/** Orígenes exactos; comodines y valores relativos se descartan (fail-closed). */
function parseAllowedOrigins(raw: string): readonly string[] {
  const origins: string[] = [];

  for (const candidate of raw.split(',')) {
    const origin = candidate.trim();

    if (origin.length === 0 || origin === '*' || /\s/.test(origin)) {
      continue;
    }

    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(origin)) {
      continue;
    }

    try {
      const parsed = new URL(origin);

      if (
        parsed.username !== '' ||
        parsed.password !== '' ||
        parsed.search !== '' ||
        parsed.hash !== ''
      ) {
        continue;
      }

      if (parsed.pathname !== '' && parsed.pathname !== '/') {
        continue;
      }
    } catch {
      continue;
    }

    origins.push(origin);
  }

  return origins;
}

function buildCorsHeaders(origin: string | null): Record<string, string> {
  if (origin === null || !allowedOrigins.includes(origin)) {
    // CORS nunca se usa como mecanismo de autenticación.
    return {};
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, apikey',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function jsonResponse(
  body: Record<string, string | number>,
  status: number,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...cors,
    },
  });
}

async function readLimitedText(request: Request, maxBytes: number): Promise<string> {
  const declaredLength = request.headers.get('content-length');
  if (
    declaredLength !== null &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > maxBytes
  ) {
    throw new Error('BODY_TOO_LARGE');
  }

  if (request.body === null) {
    return '';
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('BODY_TOO_LARGE');
    }

    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
}

function parseRegistrationBody(raw: unknown): ParsedRegistration | null {
  if (!isRecord(raw)) {
    return null;
  }

  // La APK nunca debe enviar hashes ni IP: se calculan en el servidor.
  const forbiddenFields = ['token_hash', 'ip_hash', 'challenge_hash', 'installation_hash'];
  if (forbiddenFields.some((field) => field in raw)) {
    return null;
  }

  const accion = raw['accion'];
  if (accion !== 'solicitar' && accion !== 'confirmar') {
    return null;
  }

  const tokenFcmRaw = raw['token_fcm'];
  const plataformaRaw = raw['plataforma'];
  if (typeof tokenFcmRaw !== 'string' || typeof plataformaRaw !== 'string') {
    return null;
  }

  const tokenFcm = tokenFcmRaw.trim();
  if (
    tokenFcm.length < TOKEN_MIN_LENGTH ||
    tokenFcm.length > TOKEN_MAX_LENGTH ||
    !/^[A-Za-z0-9._:-]+$/.test(tokenFcm)
  ) {
    return null;
  }

  if (plataformaRaw.trim() !== 'android') {
    return null;
  }

  let appCheckToken: string | null = null;
  const appCheckRaw = raw['app_check_token'];
  if (appCheckRaw !== undefined && appCheckRaw !== null) {
    if (typeof appCheckRaw !== 'string') {
      return null;
    }

    appCheckToken = appCheckRaw.trim();
    if (
      appCheckToken.length < APP_CHECK_MIN_LENGTH ||
      appCheckToken.length > APP_CHECK_MAX_LENGTH ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(appCheckToken)
    ) {
      return null;
    }
  }

  let challengeToken: string | null = null;
  const challengeRaw = raw['challenge_token'];
  if (accion === 'confirmar') {
    if (typeof challengeRaw !== 'string') {
      return null;
    }

    challengeToken = challengeRaw.trim();
    if (
      challengeToken.length < CHALLENGE_MIN_LENGTH ||
      challengeToken.length > CHALLENGE_MAX_LENGTH ||
      !/^[A-Za-z0-9_-]+$/.test(challengeToken)
    ) {
      return null;
    }
  } else if (challengeRaw !== undefined && challengeRaw !== null) {
    return null;
  }

  let installationId: string | null = null;
  const installationRaw = raw['installation_id'];
  if (installationRaw !== undefined && installationRaw !== null) {
    if (typeof installationRaw !== 'string') {
      return null;
    }

    installationId = installationRaw.trim();
    if (
      installationId.length < 8 ||
      installationId.length > 128 ||
      !/^[A-Za-z0-9._:-]+$/.test(installationId)
    ) {
      return null;
    }
  }

  return {
    accion,
    tokenFcm,
    plataforma: 'android',
    appCheckToken,
    challengeToken,
    installationId,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function createChallengeToken(): string {
  const bytes = new Uint8Array(CHALLENGE_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/**
 * Cooldown en memoria por token_hash. No es una garantía global: una Edge
 * Function puede tener varias instancias. La RPC `crear_desafio_fcm` debe ser
 * además idempotente por token_hash para no sobrescribir desafíos pendientes.
 */
const challengeCooldowns = new Map<string, number>();

function challengeCooldownRemaining(tokenHash: string, now = Date.now()): number {
  for (const [hash, until] of challengeCooldowns) {
    if (until <= now) {
      challengeCooldowns.delete(hash);
    }
  }

  const until = challengeCooldowns.get(tokenHash) ?? 0;
  return Math.max(0, Math.ceil((until - now) / 1000));
}

function markChallengeIssued(tokenHash: string, now = Date.now()): void {
  challengeCooldowns.set(tokenHash, now + CHALLENGE_RESEND_COOLDOWN_SECONDS * 1000);

  if (challengeCooldowns.size > MAX_COOLDOWN_ENTRIES) {
    const oldest = challengeCooldowns.keys().next().value;
    if (oldest !== undefined) {
      challengeCooldowns.delete(oldest);
    }
  }
}

function isPlausibleIp(value: string): boolean {
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (ipv4 !== null) {
    return ipv4.slice(1).every((octet) => {
      const parsed = Number(octet);
      return parsed >= 0 && parsed <= 255;
    });
  }

  // IPv6 (con o sin zona) o IPv4-mapeado. Se valida sintaxis, no propiedad.
  return /^[0-9a-f:.%]+$/i.test(value) && value.includes(':');
}

function clientIpCandidate(headers: Headers): string {
  const realIp = (headers.get('x-real-ip') ?? '').trim();
  if (isPlausibleIp(realIp)) {
    return realIp;
  }

  const forwarded = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(isPlausibleIp);

  // Si el proxy anexa la IP real, el último hop es menos espoofable que el primero.
  const lastHop = forwarded.length > 0 ? forwarded[forwarded.length - 1] : '';
  return lastHop || 'unknown';
}

async function clientIpHash(headers: Headers): Promise<string> {
  // La IP nunca se escribe en logs; solo un hash con pepper de servidor.
  return sha256Hex(`${rateLimitPepper}:${clientIpCandidate(headers)}`);
}

const jwks = createRemoteJWKSet(new URL(JWKS_URL), {
  cacheMaxAge: 10 * 60 * 1000,
  cooldownDuration: 30 * 1000,
});

/**
 * Verificación oficial de App Check cuando se envía. RS256, typ, emisor,
 * audiencia, vigencia y, si se configura, App ID.
 */
async function verifyAppCheckToken(token: string): Promise<boolean> {
  const expectedIssuer = `https://firebaseappcheck.googleapis.com/${projectNumber}`;
  const expectedAudience = `projects/${projectNumber}`;

  const { payload, protectedHeader } = await jwtVerify(token, jwks, {
    algorithms: ['RS256'],
    issuer: expectedIssuer,
    audience: expectedAudience,
  });

  if (protectedHeader.alg !== 'RS256') {
    return false;
  }

  if ((protectedHeader.typ ?? '').toUpperCase() !== 'JWT') {
    return false;
  }

  if (payload.iss !== expectedIssuer) {
    return false;
  }

  const audiences: readonly unknown[] = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(expectedAudience)) {
    return false;
  }

  if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  if (allowedAppIds.length > 0) {
    if (typeof payload.sub !== 'string' || !allowedAppIds.includes(payload.sub)) {
      return false;
    }
  }

  return true;
}

/**
 * Distingue un JWT inválido (401) de una falla al obtener/validar los JWKS.
 * Los errores de red o de descarga de claves no deben atribuirse al cliente.
 */
function isAppCheckInfrastructureError(error: unknown): boolean {
  const code = isRecord(error) && typeof error['code'] === 'string' ? error['code'] : '';

  return (
    code === 'ERR_JWKS_TIMEOUT' ||
    code === 'ERR_JWKS_INVALID' ||
    code === 'ERR_JWKS_NO_VALID_KEY' ||
    code === 'ERR_JWKS_MULTIPLE_MATCHING_KEYS' ||
    code === 'ERR_JWK_INVALID' ||
    error instanceof TypeError
  );
}

const serverKey = resolveServerKey();
const serviceAccount = parseServiceAccount();
const projectNumberIsValid = /^\d+$/.test(projectNumber);
const configurationComplete =
  supabaseUrl.length > 0 &&
  serverKey.length > 0 &&
  projectId.length > 0 &&
  serviceAccount !== null &&
  rateLimitPepper.length > 0;

const adminClient = configurationComplete
  ? createClient(supabaseUrl, serverKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'X-Client-Info': 'registrar-dispositivo-fcm' } },
    })
  : null;

/**
 * PostgREST puede devolver el valor conflictivo en `details`. Se redactan los
 * valores enviados en esta petición, JWTs y el formato de violación de unicidad.
 */
function loggableErrorField(
  value: string | null | undefined,
  secrets: readonly string[],
): string {
  if (typeof value !== 'string' || value.length === 0) {
    return 'NONE';
  }

  let safe = value;

  for (const secret of secrets) {
    if (secret.length > 0) {
      safe = safe.split(secret).join('[REDACTED]');
    }
  }

  safe = safe.replace(
    /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    '[REDACTED_JWT]',
  );
  safe = safe.replace(/(Key\s*\([^)]*\)\s*=\s*\()[^)]*(\))/gi, '$1[REDACTED]$2');

  return safe;
}

/** Las RPC confirmadas devuelven un boolean escalar, no una tabla de una fila. */
function readBooleanRpcResult(data: unknown, rpcName: string): boolean {
  if (typeof data !== 'boolean') {
    throw new Error(`${rpcName}_RPC_INVALID`);
  }

  return data;
}

async function checkRateLimit(input: {
  readonly ipHash: string;
  readonly tokenHash: string;
  readonly installationHash: string | null;
  readonly accion: Accion;
}): Promise<RateLimitDecision> {
  if (adminClient === null) {
    throw new Error('RATE_LIMIT_RPC_UNAVAILABLE');
  }

  const { data, error } = await adminClient.rpc('registrar_intento_fcm', {
    p_ip_hash: input.ipHash,
    p_token_hash: input.tokenHash,
    p_installation_hash: input.installationHash,
    p_accion: input.accion,
  });

  if (error !== null) {
    throw new Error('RATE_LIMIT_RPC_FAILED');
  }

  return { permitido: readBooleanRpcResult(data, 'RATE_LIMIT') };
}

/**
 * `false` significa que no se creó un desafío: ya existe uno activo o los
 * parámetros son inválidos. En ese caso NO se envía FCM ni se afirma que se
 * envió un desafío nuevo.
 */
async function createChallenge(input: {
  readonly tokenHash: string;
  readonly challengeHash: string;
}): Promise<boolean> {
  if (adminClient === null) {
    throw new Error('CHALLENGE_RPC_UNAVAILABLE');
  }

  const { data, error } = await adminClient.rpc('crear_desafio_fcm', {
    p_token_hash: input.tokenHash,
    p_challenge_hash: input.challengeHash,
  });

  if (error !== null) {
    throw new Error('CHALLENGE_CREATE_RPC_FAILED');
  }

  return readBooleanRpcResult(data, 'CHALLENGE_CREATE');
}

/**
 * La RPC real valida en PostgreSQL que `p_token_hash` corresponde a
 * `p_token_fcm`, consume atómicamente el desafío y escribe el registro.
 * No se llama a `consumir_desafio_fcm` por separado.
 */
async function confirmRegistration(input: {
  readonly tokenFcm: string;
  readonly tokenHash: string;
  readonly challengeHash: string;
  readonly plataforma: 'android';
}): Promise<boolean> {
  if (adminClient === null) {
    throw new Error('CONFIRM_RPC_UNAVAILABLE');
  }

  const { data, error } = await adminClient.rpc('confirmar_registro_fcm', {
    p_token_fcm: input.tokenFcm,
    p_token_hash: input.tokenHash,
    p_challenge_hash: input.challengeHash,
    p_plataforma: input.plataforma,
  });

  if (error !== null) {
    throw new Error('CONFIRM_RPC_FAILED');
  }

  return readBooleanRpcResult(data, 'CONFIRM');
}

let cachedAccessToken: { value: string; expiresAt: number } | null = null;
let cachedPrivateKey: CryptoKey | null = null;

async function getFirebaseAccessToken(account: ServiceAccount): Promise<string> {
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
    signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
  });

  if (!response.ok) {
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

function extractFcmCode(payload: unknown): string {
  if (!isRecord(payload)) {
    return 'UNKNOWN_FCM_ERROR';
  }

  const error: Record<string, unknown> = isRecord(payload['error'])
    ? (payload['error'] as Record<string, unknown>)
    : payload;

  const details = Array.isArray(error['details']) ? error['details'] : [];
  for (const detail of details) {
    if (!isRecord(detail)) {
      continue;
    }

    const type = typeof detail['@type'] === 'string' ? detail['@type'] : '';
    const code = typeof detail['errorCode'] === 'string' ? detail['errorCode'] : '';
    if (type.includes('FcmError') && code.length > 0) {
      return code;
    }
  }

  return typeof error['status'] === 'string' ? error['status'] : 'UNKNOWN_FCM_ERROR';
}

async function sendChallengeFcm(
  accessToken: string,
  tokenFcm: string,
  challenge: string,
  expiresAt: number,
): Promise<FcmSendResult> {
  const response = await fetch(
    `${FCM_MESSAGES_BASE_URL}/${encodeURIComponent(projectId)}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: tokenFcm,
          // data-only: sin `notification` para no mostrar alarma ni interfaz.
          data: {
            tipo: 'fcm_registration_challenge',
            challenge,
            exp: String(Math.floor(expiresAt / 1000)),
          },
          android: {
            priority: 'normal',
            ttl: `${challengeTtlSeconds}s`,
          },
        },
      }),
      signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
    },
  );

  if (response.ok) {
    return { ok: true, code: 'OK' };
  }

  const payload: unknown = await response.json().catch(() => null);
  return { ok: false, code: extractFcmCode(payload) };
}

async function handler(request: Request): Promise<Response> {
  const cors = buildCorsHeaders(request.headers.get('origin'));

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      { error: ERROR_CODES.METHOD_NOT_ALLOWED },
      405,
      { ...cors, Allow: 'POST' },
    );
  }

  if (!configurationComplete || adminClient === null || serviceAccount === null) {
    // Fail-closed: sin configuración no se realiza ninguna operación privada.
    console.error('[registrar-dispositivo-fcm] CONFIGURATION_MISSING');
    return jsonResponse({ error: ERROR_CODES.CONFIGURATION_MISSING }, 503, cors);
  }

  let rawBody: unknown;
  try {
    rawBody = JSON.parse(await readLimitedText(request, MAX_BODY_BYTES));
  } catch {
    return jsonResponse({ error: ERROR_CODES.INVALID_REQUEST }, 400, cors);
  }

  const parsed = parseRegistrationBody(rawBody);
  if (parsed === null) {
    return jsonResponse({ error: ERROR_CODES.INVALID_REQUEST }, 400, cors);
  }

  const tokenHash = await sha256Hex(parsed.tokenFcm);
  const ipHash = await clientIpHash(request.headers);
  const installationHash =
    parsed.installationId === null ? null : await sha256Hex(parsed.installationId);

  // App Check se valida si se envía, pero NO habilita registro directo:
  // la RPC no acepta esa señal y todavía no hay protección contra reutilización.
  // En `confirmar` el challenge es la prueba, así que no se gasta un JWKS.
  if (parsed.accion === 'solicitar' && parsed.appCheckToken !== null) {
    if (!projectNumberIsValid) {
      console.error('[registrar-dispositivo-fcm] APP_CHECK_CONFIG_MISSING');
      return jsonResponse({ error: ERROR_CODES.CONFIGURATION_MISSING }, 503, cors);
    }

    try {
      if (!(await verifyAppCheckToken(parsed.appCheckToken))) {
        return jsonResponse({ error: ERROR_CODES.INVALID_APP_CHECK_TOKEN }, 401, cors);
      }
    } catch (error) {
      const name = error instanceof Error ? error.name : 'UNKNOWN';
      const infraError = isAppCheckInfrastructureError(error);

      console.warn(
        `[registrar-dispositivo-fcm] APP_CHECK_VERIFICATION_FAILED name=${name} infra=${infraError}`,
      );

      return jsonResponse(
        {
          error: infraError
            ? ERROR_CODES.APP_CHECK_UNAVAILABLE
            : ERROR_CODES.INVALID_APP_CHECK_TOKEN,
        },
        infraError ? 503 : 401,
        cors,
      );
    }
  }

  let rateLimit: RateLimitDecision;
  try {
    rateLimit = await checkRateLimit({
      ipHash,
      tokenHash,
      installationHash,
      accion: parsed.accion,
    });
  } catch (error) {
    const name = error instanceof Error ? error.message : 'UNKNOWN';
    console.error(`[registrar-dispositivo-fcm] RATE_LIMIT_ERROR code=${name}`);
    return jsonResponse({ error: ERROR_CODES.RPC_FAILED }, 500, cors);
  }

  if (!rateLimit.permitido) {
    return jsonResponse(
      {
        error: ERROR_CODES.RATE_LIMITED,
        retry_after_seconds: CONSERVATIVE_RETRY_SECONDS,
        retry_after_source: 'conservative_default',
      },
      429,
      cors,
    );
  }

  const secrets = [parsed.tokenFcm, parsed.appCheckToken ?? '', parsed.challengeToken ?? ''];

  try {
    if (parsed.accion === 'solicitar') {
      // Mitigación local: no generar otro nonce si esta instancia ya emitió
      // uno recientemente. No es global; la RPC debe ser idempotente también.
      const cooldownRemaining = challengeCooldownRemaining(tokenHash);
      if (cooldownRemaining > 0) {
        return jsonResponse(
          {
            status: ERROR_CODES.CHALLENGE_REQUIRED,
            challenge_ttl_seconds: challengeTtlSeconds,
            retry_after_seconds: cooldownRemaining,
          },
          202,
          cors,
        );
      }

      const expiresAt = Date.now() + challengeTtlSeconds * 1000;
      const challenge = createChallengeToken();
      const challengeHash = await sha256Hex(challenge);

      const created = await createChallenge({ tokenHash, challengeHash });
      if (!created) {
        // No se envía FCM: el nonce no se persistió o ya hay uno activo.
        console.warn('[registrar-dispositivo-fcm] CHALLENGE_PENDING');
        return jsonResponse(
          {
            error: ERROR_CODES.CHALLENGE_PENDING,
            retry_after_seconds: CONSERVATIVE_RETRY_SECONDS,
          },
          409,
          cors,
        );
      }

      let delivery: FcmSendResult;
      try {
        const accessToken = await getFirebaseAccessToken(serviceAccount);
        delivery = await sendChallengeFcm(accessToken, parsed.tokenFcm, challenge, expiresAt);
      } catch (error) {
        const code = error instanceof Error ? error.message : 'UNKNOWN';
        console.error(
          `[registrar-dispositivo-fcm] FCM_PREPARE_ERROR code=${loggableErrorField(code, secrets)}`,
        );
        throw new Error('FCM_DELIVERY_FAILED');
      }

      if (!delivery.ok) {
        console.error(
          `[registrar-dispositivo-fcm] FCM_CHALLENGE_DELIVERY_FAILED code=${loggableErrorField(delivery.code, secrets)}`,
        );
        throw new Error('FCM_DELIVERY_FAILED');
      }

      markChallengeIssued(tokenHash);

      // El nonce nunca se devuelve ni se registra: solo viaja por FCM.
      return jsonResponse(
        {
          status: ERROR_CODES.CHALLENGE_REQUIRED,
          challenge_ttl_seconds: challengeTtlSeconds,
          retry_after_seconds: CHALLENGE_RESEND_COOLDOWN_SECONDS,
        },
        202,
        cors,
      );
    }

    // accion === 'confirmar'
    const challengeToken = parsed.challengeToken;
    if (challengeToken === null) {
      return jsonResponse({ error: ERROR_CODES.INVALID_REQUEST }, 400, cors);
    }

    // La APK envía el nonce en claro; el servidor calcula el SHA-256.
    // PostgreSQL valida el hash del token y consume+registra en una transacción.
    const challengeHash = await sha256Hex(challengeToken);
    const confirmed = await confirmRegistration({
      tokenFcm: parsed.tokenFcm,
      tokenHash,
      challengeHash,
      plataforma: parsed.plataforma,
    });

    if (!confirmed) {
      return jsonResponse({ error: ERROR_CODES.INVALID_CHALLENGE }, 401, cors);
    }

    return jsonResponse({ status: 'REGISTERED', metodo: 'challenge' }, 200, cors);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    const safeCode = code === 'FCM_DELIVERY_FAILED' ? ERROR_CODES.FCM_DELIVERY_FAILED : ERROR_CODES.RPC_FAILED;

    console.error(
      `[registrar-dispositivo-fcm] REGISTRATION_ERROR code=${loggableErrorField(code, secrets)}`,
    );

    return jsonResponse({ error: safeCode }, 500, cors);
  }
}

Deno.serve(handler);
