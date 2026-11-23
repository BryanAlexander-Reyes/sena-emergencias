/**
 * Fase 5.4.D.3 — Pruebas locales de `listar-usuarios-admin` con dobles.
 *
 * Se ejecutan con Vitest sobre Node, sin Deno, sin Supabase Cloud y sin
 * usuarios reales. Todas las identidades, tokens y claves son sintéticos.
 */

import { describe, expect, it, vi, type Mock } from 'vitest';

import {
  createHandler,
  isRuntimeConfigComplete,
  parseAllowedOrigins,
  readSafeErrorMetadata,
  resolveServerKey,
  resolveVerificationKey,
  type AdminUserAccount,
  type Dependencies,
  type Logger,
  type RequesterProfile,
  type VerifiedCaller,
} from './handler.ts';

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const INSTRUCTOR_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_ID = '33333333-3333-3333-3333-333333333333';
const SYNTHETIC_TOKEN = 'synthetic.header.signature';
const SYNTHETIC_ANON_KEY = 'synthetic-legacy-anon-key';
const SYNTHETIC_PUBLISHABLE_KEY = 'sb_publishable_synthetic_key';
const SYNTHETIC_SECRET_KEY = 'sb_secret_synthetic_key';
const SYNTHETIC_SECRET_KEY_ROTATED = 'sb_secret_synthetic_key_rotated';
const SENSITIVE_MARKER = 'secreto-no-debe-filtrarse';
const ALLOWED_ORIGIN = 'https://app.example.test';
const OTHER_ORIGIN = 'https://other.example.test';
const ENDPOINT = 'https://project.supabase.co/functions/v1/listar-usuarios-admin';

type JsonObject = Record<string, unknown>;

function encodeJwtSegment(value: Record<string, unknown>): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeSyntheticJwt(role: 'service_role' | 'anon'): string {
  const header = encodeJwtSegment({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeJwtSegment({ role, ref: 'synthetic-project' });
  return `${header}.${payload}.c2ludGhldGljLXNpZ25hdHVyZQ`;
}

const SYNTHETIC_SERVICE_KEY = makeSyntheticJwt('service_role');
const SYNTHETIC_ANON_JWT = makeSyntheticJwt('anon');

const DIRECTORY_ROWS: readonly unknown[] = [
  { id: INSTRUCTOR_ID, nombre: 'z_instructor', rol: 'instructor', activo: false },
  { id: ADMIN_ID, nombre: 'a_admin', rol: 'administrador', activo: true },
  {
    id: OTHER_ID,
    nombre: 'm_instructor',
    rol: 'instructor',
    activo: true,
    email: SENSITIVE_MARKER,
    app_metadata: { interno: SENSITIVE_MARKER },
  },
];

const EXPECTED_USUARIOS: readonly AdminUserAccount[] = [
  { id: ADMIN_ID, nombre: 'a_admin', rol: 'administrador', activo: true },
  { id: OTHER_ID, nombre: 'm_instructor', rol: 'instructor', activo: true },
  { id: INSTRUCTOR_ID, nombre: 'z_instructor', rol: 'instructor', activo: false },
];

interface HarnessOverrides {
  readonly allowedOrigins?: readonly string[];
  readonly verifyAccessToken?: (token: string) => Promise<VerifiedCaller | null>;
  readonly findById?: (id: string) => Promise<RequesterProfile | null>;
  readonly listUsers?: () => Promise<readonly unknown[]>;
}

interface Harness {
  readonly handler: (request: Request) => Promise<Response>;
  readonly deps: Dependencies;
  readonly verifyAccessToken: Mock<(token: string) => Promise<VerifiedCaller | null>>;
  readonly findById: Mock<(id: string) => Promise<RequesterProfile | null>>;
  readonly listUsers: Mock<() => Promise<readonly unknown[]>>;
  readonly logger: {
    readonly warn: Mock<(code: string) => void>;
    readonly error: Mock<(code: string, metadata?: string) => void>;
  };
}

function activeAdmin(): RequesterProfile {
  return { id: ADMIN_ID, rol: 'administrador', activo: true };
}

function createHarness(overrides: HarnessOverrides = {}): Harness {
  const logger = {
    warn: vi.fn<(code: string) => void>(),
    error: vi.fn<(code: string, metadata?: string) => void>(),
  } satisfies Logger;

  const verifyAccessToken: Mock<(token: string) => Promise<VerifiedCaller | null>> = vi.fn(
    overrides.verifyAccessToken ?? (async () => ({ id: ADMIN_ID })),
  );
  const findById: Mock<(id: string) => Promise<RequesterProfile | null>> = vi.fn(
    overrides.findById ?? (async () => activeAdmin()),
  );
  const listUsers: Mock<() => Promise<readonly unknown[]>> = vi.fn(overrides.listUsers ?? (async () => DIRECTORY_ROWS));

  const deps: Dependencies = {
    allowedOrigins: overrides.allowedOrigins ?? [ALLOWED_ORIGIN],
    logger,
    authVerifier: { verifyAccessToken },
    requesterRepository: { findById },
    adminUserDirectory: { list: listUsers },
  };

  return {
    handler: createHandler(deps),
    deps,
    verifyAccessToken,
    findById,
    listUsers,
    logger,
  };
}

interface RequestOptions {
  readonly method?: string;
  readonly origin?: string | null;
  readonly authorization?: string | null;
}

function makeRequest(options: RequestOptions = {}): Request {
  const method = options.method ?? 'GET';
  const headers = new Headers();

  if (options.origin !== null) {
    headers.set('origin', options.origin ?? ALLOWED_ORIGIN);
  }
  if (options.authorization !== null) {
    headers.set('authorization', options.authorization ?? `Bearer ${SYNTHETIC_TOKEN}`);
  }

  return new Request(ENDPOINT, { method, headers });
}

async function jsonBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

function errorCode(body: JsonObject): unknown {
  return (body.error as JsonObject | undefined)?.code;
}

function errorMessage(body: JsonObject): unknown {
  return (body.error as JsonObject | undefined)?.message;
}

function keySources(
  overrides: Partial<Parameters<typeof resolveVerificationKey>[0]> = {},
): Parameters<typeof resolveVerificationKey>[0] {
  return { anonKey: '', publishableKey: '', publishableKeysJson: '', ...overrides };
}

function serverKeySources(
  overrides: Partial<Parameters<typeof resolveServerKey>[0]> = {},
): Parameters<typeof resolveServerKey>[0] {
  return { serviceRoleKey: '', secretKeysJson: '', ...overrides };
}

describe('listar-usuarios-admin — autorización y lectura administrativa', () => {
  it('autoriza a un administrador activo y devuelve la lista saneada y ordenada', async () => {
    const h = createHarness();

    const response = await h.handler(makeRequest());
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ usuarios: EXPECTED_USUARIOS });
    expect(h.verifyAccessToken).toHaveBeenCalledTimes(1);
    expect(h.verifyAccessToken).toHaveBeenCalledWith(SYNTHETIC_TOKEN);
    expect(h.findById).toHaveBeenCalledWith(ADMIN_ID);
    expect(h.listUsers).toHaveBeenCalledTimes(1);
    expect(h.logger.error).not.toHaveBeenCalled();
  });

  it('incluye cuentas activas e inactivas', async () => {
    const h = createHarness();

    const body = await jsonBody(await h.handler(makeRequest()));
    const usuarios = body.usuarios as readonly JsonObject[];

    expect(usuarios.map((usuario) => usuario.activo)).toEqual([true, true, false]);
  });

  it('devuelve una lista vacía explícita cuando no hay usuarios', async () => {
    const h = createHarness({ listUsers: async () => [] });

    const response = await h.handler(makeRequest());

    expect(response.status).toBe(200);
    expect(await jsonBody(response)).toEqual({ usuarios: [] });
  });

  it('devuelve exactamente los cuatro campos permitidos por cuenta', async () => {
    const h = createHarness();

    const body = await jsonBody(await h.handler(makeRequest()));
    const usuarios = body.usuarios as readonly JsonObject[];

    for (const usuario of usuarios) {
      expect(Object.keys(usuario).sort()).toEqual(['activo', 'id', 'nombre', 'rol']);
    }
  });

  it('ordena de forma estable por nombre y después por id', async () => {
    const h = createHarness({
      listUsers: async () => [
        { id: OTHER_ID, nombre: 'igual', rol: 'instructor', activo: false },
        { id: ADMIN_ID, nombre: 'igual', rol: 'administrador', activo: true },
      ],
    });

    const body = await jsonBody(await h.handler(makeRequest()));
    const usuarios = body.usuarios as readonly JsonObject[];

    expect(usuarios.map((usuario) => usuario.id)).toEqual([ADMIN_ID, OTHER_ID]);
  });

  it('rechaza a un instructor con 403 sin leer el directorio', async () => {
    const h = createHarness({
      findById: async () => ({ id: INSTRUCTOR_ID, rol: 'instructor', activo: true }),
    });

    const response = await h.handler(makeRequest());
    const body = await jsonBody(response);

    expect(response.status).toBe(403);
    expect(errorCode(body)).toBe('FORBIDDEN');
    expect(h.listUsers).not.toHaveBeenCalled();
  });

  it('rechaza a un administrador inactivo con 403', async () => {
    const h = createHarness({
      findById: async () => ({ id: ADMIN_ID, rol: 'administrador', activo: false }),
    });

    const response = await h.handler(makeRequest());

    expect(response.status).toBe(403);
    expect(errorCode(await jsonBody(response))).toBe('FORBIDDEN');
    expect(h.listUsers).not.toHaveBeenCalled();
  });

  it('rechaza a un solicitante sin perfil real en public.usuarios', async () => {
    const h = createHarness({ findById: async () => null });

    const response = await h.handler(makeRequest());

    expect(response.status).toBe(403);
    expect(errorCode(await jsonBody(response))).toBe('FORBIDDEN');
    expect(h.listUsers).not.toHaveBeenCalled();
  });

  it('rechaza una solicitud sin token', async () => {
    const h = createHarness();

    const response = await h.handler(makeRequest({ authorization: null }));

    expect(response.status).toBe(401);
    expect(errorCode(await jsonBody(response))).toBe('UNAUTHENTICATED');
    expect(h.verifyAccessToken).not.toHaveBeenCalled();
    expect(h.findById).not.toHaveBeenCalled();
  });

  it('rechaza un token inválido verificado contra Auth', async () => {
    const h = createHarness({ verifyAccessToken: async () => null });

    const response = await h.handler(makeRequest());

    expect(response.status).toBe(401);
    expect(errorCode(await jsonBody(response))).toBe('UNAUTHENTICATED');
    expect(h.findById).not.toHaveBeenCalled();
    expect(h.listUsers).not.toHaveBeenCalled();
  });

  it('rechaza un esquema de autorización distinto de Bearer', async () => {
    const h = createHarness();

    const response = await h.handler(makeRequest({ authorization: `Basic ${SYNTHETIC_TOKEN}` }));

    expect(response.status).toBe(401);
    expect(h.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('trata un fallo del verificador como token inválido', async () => {
    const h = createHarness({
      verifyAccessToken: async () => {
        throw new Error(SENSITIVE_MARKER);
      },
    });

    const response = await h.handler(makeRequest());
    const body = await jsonBody(response);

    expect(response.status).toBe(401);
    expect(errorCode(body)).toBe('UNAUTHENTICATED');
    expect(JSON.stringify(body)).not.toContain(SENSITIVE_MARKER);
    expect(h.logger.error).not.toHaveBeenCalled();
  });
});

describe('listar-usuarios-admin — fallos de base de datos y saneamiento', () => {
  it('devuelve 500 seguro si falla la consulta del perfil solicitante', async () => {
    const h = createHarness({
      findById: async () => {
        throw new Error(SENSITIVE_MARKER);
      },
    });

    const response = await h.handler(makeRequest());
    const body = await jsonBody(response);

    expect(response.status).toBe(500);
    expect(errorCode(body)).toBe('INTERNAL');
    expect(errorMessage(body)).not.toContain(SENSITIVE_MARKER);
    expect(h.listUsers).not.toHaveBeenCalled();
    expect(h.logger.error).toHaveBeenCalledWith('REQUESTER_LOOKUP_FAILED', 'code=UNKNOWN');
  });

  it('devuelve 500 seguro si falla la lectura del directorio', async () => {
    const h = createHarness({
      listUsers: async () => {
        throw {
          code: '42501',
          status: 500,
          message: `permission denied ${SENSITIVE_MARKER}`,
          hint: SENSITIVE_MARKER,
        };
      },
    });

    const response = await h.handler(makeRequest());
    const body = await jsonBody(response);

    expect(response.status).toBe(500);
    expect(errorCode(body)).toBe('INTERNAL');
    expect(JSON.stringify(body)).not.toContain(SENSITIVE_MARKER);
    expect(h.logger.error).toHaveBeenCalledWith('USER_DIRECTORY_READ_FAILED', 'code=42501 status=500');
  });

  it('rechaza filas inesperadas sin devolver sus campos sensibles', async () => {
    const h = createHarness({
      listUsers: async () => [
        { id: ADMIN_ID, nombre: 'a_admin', rol: 'administrador', activo: true },
        { id: OTHER_ID, nombre: 'invalido', rol: 'otro', activo: true, email: SENSITIVE_MARKER },
      ],
    });

    const response = await h.handler(makeRequest());
    const body = await jsonBody(response);

    expect(response.status).toBe(500);
    expect(errorCode(body)).toBe('INTERNAL');
    expect(JSON.stringify(body)).not.toContain(SENSITIVE_MARKER);
    expect(h.logger.error).toHaveBeenCalledWith('INVALID_DIRECTORY_ROW');
  });

  it('no filtra tokens ni secretos en el cuerpo de una respuesta correcta', async () => {
    const h = createHarness();

    const response = await h.handler(makeRequest({ authorization: `Bearer ${SYNTHETIC_TOKEN}` }));
    const serialized = await response.text();

    expect(serialized).not.toContain(SYNTHETIC_TOKEN);
    expect(serialized).not.toContain(SENSITIVE_MARKER);
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('app_metadata');
    expect(serialized).not.toContain('email');
  });

  it('readSafeErrorMetadata descarta mensajes y solo conserva códigos y estados permitidos', () => {
    const safe = readSafeErrorMetadata({ code: '42P01', status: 404, message: SENSITIVE_MARKER });

    expect(safe).toEqual({ code: '42P01', status: 404 });
    expect(readSafeErrorMetadata({ code: '23505', status: '500', message: SENSITIVE_MARKER })).toEqual({
      code: 'UNKNOWN',
      status: null,
    });
  });
});

describe('listar-usuarios-admin — HTTP y CORS', () => {
  it('rechaza métodos distintos de GET y OPTIONS con Allow explícito', async () => {
    const h = createHarness();

    const response = await h.handler(makeRequest({ method: 'POST' }));

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, OPTIONS');
    expect(errorCode(await jsonBody(response))).toBe('METHOD_NOT_ALLOWED');
    expect(h.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('responde al preflight solo para orígenes exactamente permitidos', async () => {
    const h = createHarness();

    const response = await h.handler(makeRequest({ method: 'OPTIONS' }));

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN);
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS');
    expect(response.headers.get('access-control-allow-headers')).toBe(
      'authorization, apikey, content-type, x-client-info',
    );
    expect(h.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rechaza el preflight de un origen no permitido', async () => {
    const h = createHarness();

    const response = await h.handler(makeRequest({ method: 'OPTIONS', origin: OTHER_ORIGIN }));

    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(errorCode(await jsonBody(response))).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('rechaza tempranamente un GET de origen no permitido', async () => {
    const h = createHarness();

    const response = await h.handler(makeRequest({ origin: OTHER_ORIGIN }));

    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(errorCode(await jsonBody(response))).toBe('ORIGIN_NOT_ALLOWED');
    expect(h.verifyAccessToken).not.toHaveBeenCalled();
    expect(h.findById).not.toHaveBeenCalled();
    expect(h.listUsers).not.toHaveBeenCalled();
  });

  it('no habilita el comodín como origen permitido', async () => {
    const h = createHarness({ allowedOrigins: parseAllowedOrigins('*') });

    const response = await h.handler(makeRequest({ origin: '*' }));

    expect(response.status).toBe(403);
    expect(errorCode(await jsonBody(response))).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('sin Origin no otorga CORS pero sigue exigiendo autenticación y autorización', async () => {
    const missing = createHarness();
    const unauthenticated = await missing.handler(makeRequest({ origin: null, authorization: null }));

    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get('access-control-allow-origin')).toBeNull();

    const rejected = createHarness({
      findById: async () => ({ id: ADMIN_ID, rol: 'administrador', activo: false }),
    });
    expect((await rejected.handler(makeRequest({ origin: null }))).status).toBe(403);

    const valid = createHarness();
    const authorized = await valid.handler(makeRequest({ origin: null }));

    expect(authorized.status).toBe(200);
    expect(authorized.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('listar-usuarios-admin — resolución segura de credenciales y configuración', () => {
  it('usa la clave pública legacy cuando está disponible', () => {
    expect(resolveVerificationKey(keySources({ anonKey: SYNTHETIC_ANON_KEY }))).toBe(SYNTHETIC_ANON_KEY);
  });

  it('usa la publicable singular y el default del diccionario plural', () => {
    expect(resolveVerificationKey(keySources({ publishableKey: SYNTHETIC_PUBLISHABLE_KEY }))).toBe(
      SYNTHETIC_PUBLISHABLE_KEY,
    );

    const json = JSON.stringify({
      default: SYNTHETIC_PUBLISHABLE_KEY,
      rotada: 'sb_publishable_synthetic_rotated',
    });
    expect(resolveVerificationKey(keySources({ publishableKeysJson: json }))).toBe(SYNTHETIC_PUBLISHABLE_KEY);
  });

  it('rechaza JSON inválido, arrays y una clave secreta como pública', () => {
    for (const publishableKeysJson of ['{no-json', '[]', '"texto"', 'null', '42']) {
      expect(resolveVerificationKey(keySources({ publishableKeysJson }))).toBe('');
    }
    expect(resolveVerificationKey(keySources({ anonKey: SYNTHETIC_SECRET_KEY }))).toBe('');
  });

  it('acepta la clave JWT legacy de service_role', () => {
    expect(resolveServerKey(serverKeySources({ serviceRoleKey: SYNTHETIC_SERVICE_KEY }))).toBe(SYNTHETIC_SERVICE_KEY);
  });

  it('acepta una única clave secreta moderna y el default del diccionario', () => {
    expect(resolveServerKey(serverKeySources({ secretKeysJson: JSON.stringify({ a: SYNTHETIC_SECRET_KEY }) }))).toBe(
      SYNTHETIC_SECRET_KEY,
    );

    const json = JSON.stringify({
      default: SYNTHETIC_SECRET_KEY,
      rotada: SYNTHETIC_SECRET_KEY_ROTATED,
    });
    expect(resolveServerKey(serverKeySources({ secretKeysJson: json }))).toBe(SYNTHETIC_SECRET_KEY);
  });

  it('rechaza una clave pública, un anon JWT y un diccionario secreto ambiguo', () => {
    expect(resolveServerKey(serverKeySources({ serviceRoleKey: SYNTHETIC_ANON_JWT }))).toBe('');
    expect(
      resolveServerKey(serverKeySources({ secretKeysJson: JSON.stringify({ a: SYNTHETIC_PUBLISHABLE_KEY }) })),
    ).toBe('');
    expect(
      resolveServerKey(
        serverKeySources({
          secretKeysJson: JSON.stringify({ a: SYNTHETIC_SECRET_KEY, b: SYNTHETIC_SECRET_KEY_ROTATED }),
        }),
      ),
    ).toBe('');
  });

  it('exige URL, clave pública y credencial privada para arrancar', () => {
    const complete = { supabaseUrl: 'https://project.supabase.co', verificationKey: 'public', serverKey: 'secret' };

    expect(isRuntimeConfigComplete(complete)).toBe(true);
    expect(isRuntimeConfigComplete({ ...complete, serverKey: '' })).toBe(false);
    expect(isRuntimeConfigComplete({ ...complete, verificationKey: '' })).toBe(false);
    expect(isRuntimeConfigComplete({ ...complete, supabaseUrl: '' })).toBe(false);
  });

  it('parseAllowedOrigins mantiene orígenes exactos y fail-closed', () => {
    expect(parseAllowedOrigins(`${ALLOWED_ORIGIN}, ${OTHER_ORIGIN},`)).toEqual([ALLOWED_ORIGIN, OTHER_ORIGIN]);
    expect(parseAllowedOrigins('*')).toEqual([]);
    expect(parseAllowedOrigins('https://app.example.test/ruta')).toEqual([]);
    expect(parseAllowedOrigins('not-an-origin')).toEqual([]);
  });
});
