/**
 * Fase 5.4.D.3 — Núcleo de la Edge Function `listar-usuarios-admin`.
 *
 * Este módulo es independiente de Deno y del SDK de Supabase: recibe todas las
 * integraciones por inyección de dependencias y usa únicamente `Request` /
 * `Response` de la plataforma web. Eso permite ejecutar las pruebas locales con
 * Vitest en Node, sin desplegar ni contactar Supabase.
 *
 * La autoridad de autorización es `public.usuarios` leída en el servidor en cada
 * solicitud. Los claims del JWT y los permisos del frontend nunca bastan.
 * La lectura usa una credencial administrativa exclusivamente en servidor, de
 * modo que puede devolver también cuentas inactivas que la RLS oculta al cliente.
 */

export const ALLOWED_METHODS = 'GET, OPTIONS';
export const ALLOWED_HEADERS = 'authorization, apikey, content-type, x-client-info';

/** Identidad devuelta únicamente por una verificación real contra Supabase Auth. */
export interface VerifiedCaller {
  readonly id: string;
}

/** Fila mínima leída de `public.usuarios` para autorizar al solicitante. */
export interface RequesterProfile {
  readonly id: string;
  readonly rol: string;
  readonly activo: boolean;
}

/** Vista mínima y pública de una cuenta; nunca incluye credenciales ni metadatos. */
export interface AdminUserAccount {
  readonly id: string;
  readonly nombre: string;
  readonly rol: 'administrador' | 'instructor';
  readonly activo: boolean;
}

/** Respuesta explícita y estable de la función. */
export interface AdminUserListResponse {
  readonly usuarios: readonly AdminUserAccount[];
}

export interface AuthVerifier {
  /** Debe llamar a Supabase Auth con el token; nunca solo decodificar el JWT. */
  verifyAccessToken(token: string): Promise<VerifiedCaller | null>;
}

export interface RequesterRepository {
  findById(id: string): Promise<RequesterProfile | null>;
}

export interface AdminUserDirectory {
  /** Filas crudas leídas con privilegios de servidor. El handler las sanea. */
  list(): Promise<readonly unknown[]>;
}

/** Solo acepta códigos fijos: nunca datos de la solicitud, SDK, SQL ni secretos. */
export interface Logger {
  warn(code: string): void;
  error(code: string, metadata?: string): void;
}

export interface Dependencies {
  readonly allowedOrigins: readonly string[];
  readonly logger: Logger;
  readonly authVerifier: AuthVerifier;
  readonly requesterRepository: RequesterRepository;
  readonly adminUserDirectory: AdminUserDirectory;
}

/**
 * Resolución pura de la clave pública de verificación. Se mantiene aquí, sin
 * Deno ni SDK, para poder comprobarla con las pruebas locales.
 *
 * Orden de preferencia: legacy `SUPABASE_ANON_KEY`, publishable singular y,
 * finalmente, el diccionario JSON `SUPABASE_PUBLISHABLE_KEYS` (entrada `default`).
 * Esta resolución pública nunca lee credenciales privadas.
 */
export const PUBLISHABLE_KEY_PREFIX = 'sb_publishable_';
export const SECRET_KEY_PREFIX = 'sb_secret_';
const DEFAULT_KEY_ENTRY = 'default';

export interface VerificationKeySources {
  readonly anonKey: string;
  readonly publishableKey: string;
  readonly publishableKeysJson: string;
}

function isPublishableKey(value: string): boolean {
  return value.startsWith(PUBLISHABLE_KEY_PREFIX) && value.length > PUBLISHABLE_KEY_PREFIX.length && !/\s/.test(value);
}

function resolveFromPublishableKeys(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return '';
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return '';
  }

  const record = parsed as Record<string, unknown>;
  const candidates: string[] = [];
  for (const value of Object.values(record)) {
    if (typeof value === 'string' && isPublishableKey(value.trim())) {
      candidates.push(value.trim());
    }
  }
  if (candidates.length === 0) {
    return '';
  }

  const documentedDefault = record[DEFAULT_KEY_ENTRY];
  if (typeof documentedDefault === 'string' && isPublishableKey(documentedDefault.trim())) {
    return documentedDefault.trim();
  }

  // Sin la entrada `default`, elegir entre varias claves sería arbitrario.
  return candidates.length === 1 ? candidates[0] : '';
}

export function resolveVerificationKey(sources: VerificationKeySources): string {
  const anonKey = sources.anonKey.trim();
  if (anonKey.length > 0 && !anonKey.startsWith(SECRET_KEY_PREFIX)) {
    return anonKey;
  }

  const publishableKey = sources.publishableKey.trim();
  if (isPublishableKey(publishableKey)) {
    return publishableKey;
  }

  return resolveFromPublishableKeys(sources.publishableKeysJson.trim());
}

/**
 * Resolución pura de la credencial privada del servidor.
 *
 * Acepta la JWT legacy con `role: service_role` o el diccionario moderno
 * `SUPABASE_SECRET_KEYS` con entrada `default` o candidata única. Nunca elige
 * entre varias candidatas sin `default`, nunca acepta una clave pública y nunca
 * registra valores ni fragmentos.
 */
export interface ServerKeySources {
  readonly serviceRoleKey: string;
  readonly secretKeysJson: string;
}

function decodeJwtPayload(segment: string): Record<string, unknown> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
    return null;
  }

  try {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const parsed: unknown = JSON.parse(atob(padded));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isLegacyServiceRoleKey(value: string): boolean {
  const segments = value.split('.');
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) {
    return false;
  }

  const payload = decodeJwtPayload(segments[1]);
  return payload !== null && payload['role'] === 'service_role';
}

function isSecretKey(value: string): boolean {
  return value.startsWith(SECRET_KEY_PREFIX) && value.length > SECRET_KEY_PREFIX.length && !/\s/.test(value);
}

function resolveFromSecretKeys(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return '';
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return '';
  }

  const record = parsed as Record<string, unknown>;
  const entries = Object.entries(record);
  if (entries.length === 0) {
    return '';
  }

  const candidates: string[] = [];
  for (const [, value] of entries) {
    if (typeof value !== 'string') {
      return '';
    }
    const candidate = value.trim();
    if (!isSecretKey(candidate)) {
      return '';
    }
    candidates.push(candidate);
  }

  const documentedDefault = record[DEFAULT_KEY_ENTRY];
  if (typeof documentedDefault === 'string' && isSecretKey(documentedDefault.trim())) {
    return documentedDefault.trim();
  }

  return candidates.length === 1 ? candidates[0] : '';
}

export function resolveServerKey(sources: ServerKeySources): string {
  const legacyKey = sources.serviceRoleKey.trim();
  if (isLegacyServiceRoleKey(legacyKey)) {
    return legacyKey;
  }

  return resolveFromSecretKeys(sources.secretKeysJson.trim());
}

/** Configuración crítica incompleta: la función no debe iniciar. */
export interface RuntimeConfig {
  readonly supabaseUrl: string;
  readonly verificationKey: string;
  readonly serverKey: string;
}

export function isRuntimeConfigComplete(config: RuntimeConfig): boolean {
  return config.supabaseUrl.length > 0 && config.verificationKey.length > 0 && config.serverKey.length > 0;
}

type SafeErrorCode = '42501' | '42P01' | 'PGRST205' | 'UNKNOWN';

export interface SafeErrorMetadata {
  readonly code: SafeErrorCode;
  readonly status: number | null;
}

/** Fallo al consultar `public.usuarios` con privilegios de servidor. */
export class ProfileStoreError extends Error {
  constructor(readonly metadata?: SafeErrorMetadata) {
    super('PROFILE_STORE_FAILED');
    this.name = 'ProfileStoreError';
  }
}

/** Fila inesperada: el esquema o la política de datos cambió. */
export class InvalidDirectoryRowError extends Error {
  constructor() {
    super('INVALID_DIRECTORY_ROW');
    this.name = 'InvalidDirectoryRowError';
  }
}

const ALLOWED_ERROR_CODES: readonly Exclude<SafeErrorCode, 'UNKNOWN'>[] = ['42501', '42P01', 'PGRST205'];

function isAllowedErrorCode(value: unknown): value is Exclude<SafeErrorCode, 'UNKNOWN'> {
  return typeof value === 'string' && (ALLOWED_ERROR_CODES as readonly string[]).includes(value);
}

function safeHttpStatus(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
}

/**
 * Convierte un error de PostgREST en metadatos publicables. Solo se conservan
 * códigos de una lista cerrada y un estado HTTP numérico válido; el mensaje
 * original, las sugerencias y cualquier otro campo se descartan.
 */
export function readSafeErrorMetadata(error: unknown): SafeErrorMetadata {
  if (error instanceof ProfileStoreError && error.metadata !== undefined) {
    return error.metadata;
  }

  if (typeof error !== 'object' || error === null) {
    return { code: 'UNKNOWN', status: null };
  }

  const record = error as { code?: unknown; status?: unknown };
  return {
    code: isAllowedErrorCode(record.code) ? record.code : 'UNKNOWN',
    status: safeHttpStatus(record.status),
  };
}

export function formatSafeErrorMetadata(metadata: SafeErrorMetadata): string {
  return `code=${metadata.code}${metadata.status === null ? '' : ` status=${metadata.status}`}`;
}

interface ErrorPayload {
  readonly error: { readonly code: string; readonly message: string };
}

const MESSAGES = {
  unauthenticated: 'Se requiere una sesión válida.',
  forbidden: 'No tienes permiso para listar usuarios.',
  methodNotAllowed: 'Método no permitido.',
  originNotAllowed: 'Origen no permitido.',
  internal: 'Ocurrió un error inesperado.',
} as const;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Construye la vista mínima. Cualquier campo adicional se descarta. */
export function toAdminUserAccount(value: unknown): AdminUserAccount | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const rol = candidate['rol'];
  const activo = candidate['activo'];

  if (
    !isNonEmptyString(candidate['id']) ||
    !isNonEmptyString(candidate['nombre']) ||
    (rol !== 'administrador' && rol !== 'instructor') ||
    typeof activo !== 'boolean'
  ) {
    return null;
  }

  return { id: candidate['id'], nombre: candidate['nombre'], rol, activo };
}

function compareAccounts(a: AdminUserAccount, b: AdminUserAccount): number {
  if (a.nombre < b.nombre) {
    return -1;
  }
  if (a.nombre > b.nombre) {
    return 1;
  }
  if (a.id < b.id) {
    return -1;
  }
  if (a.id > b.id) {
    return 1;
  }
  return 0;
}

function readBearerToken(header: string | null): string | null {
  if (header === null) {
    return null;
  }

  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match === null ? null : match[1];
}

/**
 * Normaliza `CORS_ALLOWED_ORIGINS` sin inventar orígenes: descarta entradas
 * vacías, comodines y valores que no sean un origen absoluto sin ruta,
 * consulta ni fragmento. Acepta esquemas personalizados de WebView porque
 * `URL.origin` los representa como `null`, pero su forma sigue siendo válida.
 */
export function parseAllowedOrigins(raw: string): readonly string[] {
  const origins: string[] = [];

  for (const candidate of raw.split(',')) {
    const origin = candidate.trim();
    if (origin.length === 0 || origin === '*' || /\s/.test(origin)) {
      continue;
    }

    try {
      const parsed = new URL(origin);
      const isAbsoluteOrigin =
        (parsed.pathname === '/' || parsed.pathname === '') &&
        parsed.search === '' &&
        parsed.hash === '' &&
        parsed.username === '' &&
        parsed.password === '';

      if (isAbsoluteOrigin) {
        origins.push(origin);
      }
    } catch {
      // Configuración inválida: se ignora la entrada, nunca se habilita '*'.
    }
  }

  return origins;
}

function corsHeaders(origin: string | null, allowedOrigins: readonly string[]): Record<string, string> | null {
  if (origin === null || origin === '*' || !allowedOrigins.includes(origin)) {
    return null;
  }

  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
}

function errorPayload(code: string, message: string): ErrorPayload {
  return { error: { code, message } };
}

function jsonResponse(status: number, body: unknown, cors: Record<string, string> | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(cors ?? {}),
    },
  });
}

/**
 * Construye el manejador HTTP. Todas las respuestas de error usan códigos y
 * mensajes fijos: no se propagan mensajes del SDK, SQL, stack traces, correos
 * internos, contraseñas ni tokens.
 *
 * Política de origen:
 * - `Origin` presente y no exactamente permitido: 403 inmediato, antes de
 *   verificar JWT, consultar `public.usuarios` o listar cuentas.
 * - `Origin` ausente: no se otorgan cabeceras CORS, pero la solicitud continúa
 *   y sigue exigiendo JWT válido y Administrador activo.
 * - Configuración vacía o inválida: ningún origen queda permitido (fail-closed).
 */
export function createHandler(deps: Dependencies): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const cors = corsHeaders(origin, deps.allowedOrigins);

    if (request.method === 'OPTIONS') {
      if (cors === null) {
        return jsonResponse(403, errorPayload('ORIGIN_NOT_ALLOWED', MESSAGES.originNotAllowed), null);
      }

      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': ALLOWED_METHODS,
          'Access-Control-Allow-Headers': ALLOWED_HEADERS,
          'Access-Control-Max-Age': '600',
          'Cache-Control': 'no-store',
        },
      });
    }

    if (request.method !== 'GET') {
      return jsonResponse(405, errorPayload('METHOD_NOT_ALLOWED', MESSAGES.methodNotAllowed), {
        ...(cors ?? {}),
        Allow: ALLOWED_METHODS,
      });
    }

    if (origin !== null && cors === null) {
      return jsonResponse(403, errorPayload('ORIGIN_NOT_ALLOWED', MESSAGES.originNotAllowed), null);
    }

    const token = readBearerToken(request.headers.get('authorization'));
    if (token === null) {
      return jsonResponse(401, errorPayload('UNAUTHENTICATED', MESSAGES.unauthenticated), cors);
    }

    let caller: VerifiedCaller | null;
    try {
      caller = await deps.authVerifier.verifyAccessToken(token);
    } catch {
      caller = null;
    }
    if (caller === null || typeof caller.id !== 'string' || caller.id.length === 0) {
      return jsonResponse(401, errorPayload('UNAUTHENTICATED', MESSAGES.unauthenticated), cors);
    }

    let requester: RequesterProfile | null;
    try {
      requester = await deps.requesterRepository.findById(caller.id);
    } catch (error) {
      deps.logger.error('REQUESTER_LOOKUP_FAILED', formatSafeErrorMetadata(readSafeErrorMetadata(error)));
      return jsonResponse(500, errorPayload('INTERNAL', MESSAGES.internal), cors);
    }
    if (requester === null || requester.rol !== 'administrador' || requester.activo !== true) {
      return jsonResponse(403, errorPayload('FORBIDDEN', MESSAGES.forbidden), cors);
    }

    let rows: readonly unknown[];
    try {
      rows = await deps.adminUserDirectory.list();
    } catch (error) {
      deps.logger.error('USER_DIRECTORY_READ_FAILED', formatSafeErrorMetadata(readSafeErrorMetadata(error)));
      return jsonResponse(500, errorPayload('INTERNAL', MESSAGES.internal), cors);
    }

    let usuarios: AdminUserAccount[];
    try {
      usuarios = rows.map((row) => {
        const account = toAdminUserAccount(row);
        if (account === null) {
          throw new InvalidDirectoryRowError();
        }
        return account;
      });
    } catch {
      deps.logger.error('INVALID_DIRECTORY_ROW');
      return jsonResponse(500, errorPayload('INTERNAL', MESSAGES.internal), cors);
    }

    usuarios.sort(compareAccounts);

    const response: AdminUserListResponse = { usuarios };
    return jsonResponse(200, response, cors);
  };
}
