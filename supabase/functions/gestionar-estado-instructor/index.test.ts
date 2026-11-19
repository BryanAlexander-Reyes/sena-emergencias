/**
 * Fase 5.4.D.5.A — Pruebas locales de `gestionar-estado-instructor` con dobles.
 *
 * Se ejecutan con Vitest sobre Node, sin Deno, sin Supabase Cloud y sin
 * usuarios reales. Todas las identidades, tokens y claves son sintéticos.
 */

import { describe, expect, it, vi, type Mock } from 'vitest';

import {
  createHandler,
  isRuntimeConfigComplete,
  isUuid,
  parseAllowedOrigins,
  readSafeErrorMetadata,
  resolveServerKey,
  resolveVerificationKey,
  toInstructorTarget,
  type Dependencies,
  type InstructorTarget,
  type Logger,
  type RequesterProfile,
  type StateChangeInput,
  type StateUpdateResult,
  type VerifiedCaller,
} from './handler.ts';

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const INSTRUCTOR_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_ID = '33333333-3333-3333-3333-333333333333';
const SYNTHETIC_TOKEN = 'synthetic.header.signature';
const SYNTHETIC_PUBLISHABLE_KEY = 'sb_publishable_synthetic_key';
const SYNTHETIC_SECRET_KEY = 'sb_secret_synthetic_key';
const SENSITIVE_MARKER = 'no-debe-filtrarse@example.test';
const ALLOWED_ORIGIN = 'https://app.example.test';
const OTHER_ORIGIN = 'https://other.example.test';
const ENDPOINT = 'https://project.supabase.co/functions/v1/gestionar-estado-instructor';

type JsonObject = Record<string, unknown>;

const ACTIVE_INSTRUCTOR_ROW: JsonObject = {
  id: INSTRUCTOR_ID,
  nombre: 'instructor_real',
  rol: 'instructor',
  activo: true,
  email: SENSITIVE_MARKER,
  app_metadata: { interno: SENSITIVE_MARKER },
};

const INACTIVE_INSTRUCTOR_ROW: JsonObject = { ...ACTIVE_INSTRUCTOR_ROW, activo: false };
const ADMIN_TARGET_ROW: JsonObject = {
  id: ADMIN_ID,
  nombre: 'admin_real',
  rol: 'administrador',
  activo: true,
  email: SENSITIVE_MARKER,
};

const DEACTIVATE_BODY = { id: INSTRUCTOR_ID, activo: false } as const;
const REACTIVATE_BODY = { id: INSTRUCTOR_ID, activo: true } as const;

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

type VerifyMock = Mock<(token: string) => Promise<VerifiedCaller | null>>;
type FindByIdMock = Mock<(id: string) => Promise<RequesterProfile | null>>;
type FindTargetMock = Mock<(id: string) => Promise<unknown | null>>;
type UpdateActiveMock = Mock<(input: StateChangeInput) => Promise<StateUpdateResult>>;

interface HarnessOverrides {
  readonly allowedOrigins?: readonly string[];
  readonly verifyAccessToken?: (token: string) => Promise<VerifiedCaller | null>;
  readonly findById?: (id: string) => Promise<RequesterProfile | null>;
  readonly findTarget?: (id: string) => Promise<unknown | null>;
  readonly updateActive?: (input: StateChangeInput) => Promise<StateUpdateResult>;
  readonly initialTarget?: unknown | null;
}

interface Harness {
  readonly handler: (request: Request) => Promise<Response>;
  readonly deps: Dependencies;
  readonly verifyAccessToken: VerifyMock;
  readonly findById: FindByIdMock;
  readonly findTarget: FindTargetMock;
  readonly updateActive: UpdateActiveMock;
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

  let currentRow: unknown | null = overrides.initialTarget ?? { ...ACTIVE_INSTRUCTOR_ROW };

  const verifyAccessToken: VerifyMock = vi.fn();
  verifyAccessToken.mockImplementation(overrides.verifyAccessToken ?? (async () => ({ id: ADMIN_ID })));

  const findById: FindByIdMock = vi.fn();
  findById.mockImplementation(overrides.findById ?? (async () => activeAdmin()));

  const findTarget: FindTargetMock = vi.fn();
  findTarget.mockImplementation(
    overrides.findTarget ??
      (async () => {
        return currentRow;
      }),
  );

  const updateActive: UpdateActiveMock = vi.fn();
  updateActive.mockImplementation(
    overrides.updateActive ??
      (async (input) => {
        const current = toInstructorTarget(currentRow);
        if (current === null || current.rol !== input.expectedRol || current.activo !== input.expectedActivo) {
          return { updated: false };
        }

        currentRow = { ...(currentRow as JsonObject), activo: input.nextActivo };
        return { updated: true, row: currentRow };
      }),
  );

  const deps: Dependencies = {
    allowedOrigins: overrides.allowedOrigins ?? [ALLOWED_ORIGIN],
    logger,
    authVerifier: { verifyAccessToken },
    requesterRepository: { findById },
    instructorStateStore: { findTarget, updateActive },
  };

  return {
    handler: createHandler(deps),
    deps,
    verifyAccessToken,
    findById,
    findTarget,
    updateActive,
    logger,
  };
}

interface RequestOptions {
  readonly method?: string;
  readonly origin?: string | null;
  readonly authorization?: string | null;
  readonly body?: unknown;
  readonly rawBody?: string;
}

function makeRequest(options: RequestOptions = {}): Request {
  const method = options.method ?? 'POST';
  const headers = new Headers();

  if (options.origin !== null) {
    headers.set('origin', options.origin ?? ALLOWED_ORIGIN);
  }
  if (options.authorization !== null) {
    headers.set('authorization', options.authorization ?? `Bearer ${SYNTHETIC_TOKEN}`);
  }

  let body: string | undefined;
  if (method === 'POST') {
    headers.set('content-type', 'application/json');
    body = options.rawBody ?? JSON.stringify(options.body ?? DEACTIVATE_BODY);
  }

  return new Request(ENDPOINT, { method, headers, body });
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

describe('gestionar-estado-instructor — flujo exitoso', () => {
  it('desactiva un Instructor activo y devuelve solo el DTO permitido', async () => {
    const h = createHarness();

    const response = await h.handler(makeRequest({ body: DEACTIVATE_BODY }));
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ id: INSTRUCTOR_ID, nombre: 'instructor_real', rol: 'instructor', activo: false });
    expect(Object.keys(body).sort()).toEqual(['activo', 'id', 'nombre', 'rol']);
    expect(h.updateActive).toHaveBeenCalledTimes(1);
    expect(h.updateActive).toHaveBeenCalledWith({
      id: INSTRUCTOR_ID,
      expectedRol: 'instructor',
      expectedActivo: true,
      nextActivo: false,
    });
    expect(h.findTarget).toHaveBeenCalledTimes(1);
    expect(h.logger.error).not.toHaveBeenCalled();
  });

  it('reactiva un Instructor inactivo con la misma condición sobre el estado previo', async () => {
    const h = createHarness({ initialTarget: INACTIVE_INSTRUCTOR_ROW });

    const response = await h.handler(makeRequest({ body: REACTIVATE_BODY }));
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ id: INSTRUCTOR_ID, nombre: 'instructor_real', rol: 'instructor', activo: true });
    expect(h.updateActive).toHaveBeenCalledWith({
      id: INSTRUCTOR_ID,
      expectedRol: 'instructor',
      expectedActivo: false,
      nextActivo: true,
    });
    expect(h.findTarget).toHaveBeenCalledTimes(1);
  });

  it('autoriza a un Administrador activo verificado contra Auth y public.usuarios', async () => {
    const h = createHarness();

    await h.handler(makeRequest());

    expect(h.verifyAccessToken).toHaveBeenCalledTimes(1);
    expect(h.verifyAccessToken).toHaveBeenCalledWith(SYNTHETIC_TOKEN);
    expect(h.findById).toHaveBeenCalledTimes(1);
    expect(h.findById).toHaveBeenCalledWith(ADMIN_ID);
    expect(h.findTarget).toHaveBeenCalledWith(INSTRUCTOR_ID);
  });

  it('impide cualquier cambio de estado del propio Administrador', async () => {
    const h = createHarness();

    const response = await h.handler(makeRequest({ body: { id: ADMIN_ID, activo: false } }));
    const body = await jsonBody(response);

    expect(response.status).toBe(403);
    expect(errorCode(body)).toBe('TARGET_FORBIDDEN');
    expect(h.findTarget).not.toHaveBeenCalled();
    expect(h.updateActive).not.toHaveBeenCalled();
  });
});

describe('gestionar-estado-instructor — autenticación y autorización del solicitante', () => {
  it('rechaza a un Instructor solicitante sin leer ni modificar el objetivo', async () => {
    const h = createHarness({
      findById: async () => ({ id: INSTRUCTOR_ID, rol: 'instructor', activo: true }),
    });

    const response = await h.handler(makeRequest());
    const body = await jsonBody(response);

    expect(response.status).toBe(403);
    expect(errorCode(body)).toBe('FORBIDDEN');
    expect(h.findTarget).not.toHaveBeenCalled();
    expect(h.updateActive).not.toHaveBeenCalled();
  });

  it('rechaza a un Administrador inactivo aunque el JWT sea válido', async () => {
    const h = createHarness({
      findById: async () => ({ id: ADMIN_ID, rol: 'administrador', activo: false }),
    });

    const response = await h.handler(makeRequest());

    expect(response.status).toBe(403);
    expect(errorCode(await jsonBody(response))).toBe('FORBIDDEN');
    expect(h.updateActive).not.toHaveBeenCalled();
  });

  it('rechaza a un solicitante sin perfil real en public.usuarios', async () => {
    const h = createHarness({ findById: async () => null });

    const response = await h.handler(makeRequest());

    expect(response.status).toBe(403);
    expect(errorCode(await jsonBody(response))).toBe('FORBIDDEN');
  });

  it('rechaza una solicitud sin Authorization', async () => {
    const h = createHarness();

    const response = await h.handler(makeRequest({ authorization: null }));

    expect(response.status).toBe(401);
    expect(errorCode(await jsonBody(response))).toBe('UNAUTHENTICATED');
    expect(h.findById).not.toHaveBeenCalled();
  });

  it('rechaza un token inválido verificado contra Auth', async () => {
    const h = createHarness({ verifyAccessToken: async () => null });

    const response = await h.handler(makeRequest());

    expect(response.status).toBe(401);
    expect(errorCode(await jsonBody(response))).toBe('UNAUTHENTICATED');
    expect(h.findById).not.toHaveBeenCalled();
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
        throw new Error(`token ${SENSITIVE_MARKER}`);
      },
    });

    const response = await h.handler(makeRequest());
    const text = await response.clone().text();

    expect(response.status).toBe(401);
    expect(text).not.toContain(SENSITIVE_MARKER);
    expect(h.findById).not.toHaveBeenCalled();
  });

  it('devuelve 500 seguro si falla la consulta del perfil solicitante', async () => {
    const h = createHarness({
      findById: async () => {
        throw { code: '42501', status: 403, message: SENSITIVE_MARKER };
      },
    });

    const response = await h.handler(makeRequest());
    const text = await response.clone().text();
    const logs = h.logger.error.mock.calls.map((call) => call.join(' ')).join(' ');

    expect(response.status).toBe(500);
    expect(errorCode(await jsonBody(response))).toBe('INTERNAL');
    expect(text).not.toContain(SENSITIVE_MARKER);
    expect(logs).toContain('REQUESTER_LOOKUP_FAILED');
    expect(logs).toContain('code=42501');
    expect(logs).not.toContain(SENSITIVE_MARKER);
    expect(h.findTarget).not.toHaveBeenCalled();
  });
});

describe('gestionar-estado-instructor — validación del cuerpo y del objetivo', () => {
  it.each(['no-uuid', '22222222-2222-2222-2222-22222222222', '', 123, null])(
    'rechaza un id que no es UUID: %j',
    async (id) => {
      const h = createHarness();

      const response = await h.handler(makeRequest({ body: { id, activo: false } }));

      expect(response.status).toBe(400);
      expect(errorCode(await jsonBody(response))).toBe('INVALID_REQUEST');
      expect(h.findTarget).not.toHaveBeenCalled();
      expect(h.updateActive).not.toHaveBeenCalled();
    },
  );

  it.each([
    { name: 'JSON inválido', rawBody: '{' },
    { name: 'cuerpo vacío', rawBody: '' },
    { name: 'array', rawBody: '[]' },
    { name: 'objeto vacío', rawBody: '{}' },
    { name: 'activo como texto', rawBody: `{"id":"${INSTRUCTOR_ID}","activo":"false"}` },
    { name: 'solo id', rawBody: `{"id":"${INSTRUCTOR_ID}"}` },
    { name: 'campo adicional', rawBody: `{"id":"${INSTRUCTOR_ID}","activo":false,"rol":"instructor"}` },
    {
      name: 'campo sensible adicional',
      rawBody: `{"id":"${INSTRUCTOR_ID}","activo":false,"email":"${SENSITIVE_MARKER}"}`,
    },
  ])('rechaza un cuerpo inválido: $name', async ({ rawBody }) => {
    const h = createHarness();

    const response = await h.handler(makeRequest({ rawBody }));

    expect(response.status).toBe(400);
    expect(errorCode(await jsonBody(response))).toBe('INVALID_REQUEST');
    expect(h.findTarget).not.toHaveBeenCalled();
    expect(h.updateActive).not.toHaveBeenCalled();
  });

  it('rechaza un cuerpo demasiado grande sin leer el objetivo', async () => {
    const h = createHarness();
    const rawBody = `${JSON.stringify(DEACTIVATE_BODY)}${' '.repeat(2048)}`;

    const response = await h.handler(makeRequest({ rawBody }));

    expect(response.status).toBe(400);
    expect(h.findTarget).not.toHaveBeenCalled();
  });

  it('devuelve 404 cuando la cuenta objetivo no existe', async () => {
    const h = createHarness({ findTarget: async () => null });

    const response = await h.handler(makeRequest());
    const body = await jsonBody(response);

    expect(response.status).toBe(404);
    expect(errorCode(body)).toBe('TARGET_NOT_FOUND');
    expect(h.updateActive).not.toHaveBeenCalled();
  });

  it('rechaza cualquier Administrador como objetivo', async () => {
    const h = createHarness({ findTarget: async () => ADMIN_TARGET_ROW });

    const response = await h.handler(makeRequest());
    const body = await jsonBody(response);

    expect(response.status).toBe(403);
    expect(errorCode(body)).toBe('TARGET_FORBIDDEN');
    expect(h.updateActive).not.toHaveBeenCalled();
  });

  it('rechaza una fila de objetivo inesperada sin devolver sus campos', async () => {
    const h = createHarness({
      findTarget: async () => ({ id: INSTRUCTOR_ID, activo: true, email: SENSITIVE_MARKER }),
    });

    const response = await h.handler(makeRequest());
    const text = await response.clone().text();

    expect(response.status).toBe(500);
    expect(errorCode(await jsonBody(response))).toBe('INTERNAL');
    expect(text).not.toContain(SENSITIVE_MARKER);
    expect(h.logger.error.mock.calls.map((call) => call.join(' ')).join(' ')).toContain('INVALID_TARGET_ROW');
    expect(h.updateActive).not.toHaveBeenCalled();
  });

  it('devuelve 409 sin actualizar si el Instructor ya tiene el estado solicitado', async () => {
    const h = createHarness({ initialTarget: INACTIVE_INSTRUCTOR_ROW });

    const response = await h.handler(makeRequest({ body: { id: INSTRUCTOR_ID, activo: false } }));
    const body = await jsonBody(response);

    expect(response.status).toBe(409);
    expect(errorCode(body)).toBe('CONFLICT');
    expect(h.updateActive).not.toHaveBeenCalled();
  });

  it('acepta UUID en mayúsculas y conserva el identificador saneado', async () => {
    const upperId = INSTRUCTOR_ID.toUpperCase();
    const h = createHarness({
      findTarget: async () => ({ ...ACTIVE_INSTRUCTOR_ROW, id: upperId }),
      updateActive: async () => ({ updated: true, row: { ...ACTIVE_INSTRUCTOR_ROW, id: upperId, activo: false } }),
    });

    const response = await h.handler(makeRequest({ body: { id: upperId, activo: false } }));
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(body.id).toBe(upperId);
  });
});

describe('gestionar-estado-instructor — concurrencia y errores de base de datos', () => {
  it('devuelve 404 si la condición no coincidió y la fila desapareció', async () => {
    let reads = 0;
    const h = createHarness({
      findTarget: async () => {
        reads += 1;
        return reads === 1 ? ACTIVE_INSTRUCTOR_ROW : null;
      },
      updateActive: async () => ({ updated: false }),
    });

    const response = await h.handler(makeRequest());

    expect(response.status).toBe(404);
    expect(errorCode(await jsonBody(response))).toBe('TARGET_NOT_FOUND');
    expect(h.findTarget).toHaveBeenCalledTimes(2);
  });

  it('devuelve 403 si la condición no coincidió y el objetivo dejó de ser Instructor', async () => {
    let reads = 0;
    const h = createHarness({
      findTarget: async () => {
        reads += 1;
        return reads === 1 ? ACTIVE_INSTRUCTOR_ROW : ADMIN_TARGET_ROW;
      },
      updateActive: async () => ({ updated: false }),
    });

    const response = await h.handler(makeRequest());

    expect(response.status).toBe(403);
    expect(errorCode(await jsonBody(response))).toBe('TARGET_FORBIDDEN');
  });

  it('devuelve 409 si otra solicitud aplicó el mismo estado', async () => {
    let reads = 0;
    const h = createHarness({
      findTarget: async () => {
        reads += 1;
        return reads === 1 ? ACTIVE_INSTRUCTOR_ROW : INACTIVE_INSTRUCTOR_ROW;
      },
      updateActive: async () => ({ updated: false }),
    });

    const response = await h.handler(makeRequest());

    expect(response.status).toBe(409);
    expect(errorCode(await jsonBody(response))).toBe('CONFLICT');
  });

  it('devuelve 409 si una operación ajena cambió el estado a otro distinto', async () => {
    let reads = 0;
    const h = createHarness({
      findTarget: async () => {
        reads += 1;
        return reads === 1 ? INACTIVE_INSTRUCTOR_ROW : ACTIVE_INSTRUCTOR_ROW;
      },
      updateActive: async () => ({ updated: false }),
    });

    const response = await h.handler(makeRequest({ body: REACTIVATE_BODY }));

    expect(response.status).toBe(409);
    expect(errorCode(await jsonBody(response))).toBe('CONFLICT');
  });

  it('devuelve 500 seguro si falla la lectura del objetivo', async () => {
    const h = createHarness({
      findTarget: async () => {
        throw { code: '42P01', status: 404, message: SENSITIVE_MARKER };
      },
    });

    const response = await h.handler(makeRequest());
    const text = await response.clone().text();
    const logs = h.logger.error.mock.calls.map((call) => call.join(' ')).join(' ');

    expect(response.status).toBe(500);
    expect(text).not.toContain(SENSITIVE_MARKER);
    expect(logs).toContain('TARGET_LOOKUP_FAILED');
    expect(logs).toContain('code=42P01');
    expect(logs).not.toContain(SENSITIVE_MARKER);
    expect(h.updateActive).not.toHaveBeenCalled();
  });

  it('devuelve 500 seguro si falla el UPDATE condicional', async () => {
    const h = createHarness({
      updateActive: async () => {
        throw { code: '42501', status: 403, message: SENSITIVE_MARKER };
      },
    });

    const response = await h.handler(makeRequest());
    const text = await response.clone().text();
    const logs = h.logger.error.mock.calls.map((call) => call.join(' ')).join(' ');

    expect(response.status).toBe(500);
    expect(errorCode(await jsonBody(response))).toBe('INTERNAL');
    expect(text).not.toContain(SENSITIVE_MARKER);
    expect(logs).toContain('STATE_UPDATE_FAILED');
    expect(logs).toContain('code=42501');
    expect(logs).not.toContain(SENSITIVE_MARKER);
  });

  it('devuelve 500 seguro si falla la relectura tras una condición no coincidente', async () => {
    let reads = 0;
    const h = createHarness({
      findTarget: async () => {
        reads += 1;
        if (reads === 1) {
          return ACTIVE_INSTRUCTOR_ROW;
        }
        throw { message: SENSITIVE_MARKER };
      },
      updateActive: async () => ({ updated: false }),
    });

    const response = await h.handler(makeRequest());

    expect(response.status).toBe(500);
    expect(errorCode(await jsonBody(response))).toBe('INTERNAL');
    expect(h.logger.error.mock.calls.map((call) => call.join(' ')).join(' ')).toContain('TARGET_RECHECK_FAILED');
  });

  it('rechaza una fila devuelta por el UPDATE que no coincide con la solicitud', async () => {
    const h = createHarness({
      updateActive: async () => ({ updated: true, row: { ...ACTIVE_INSTRUCTOR_ROW, activo: true } }),
    });

    const response = await h.handler(makeRequest());

    expect(response.status).toBe(500);
    expect(errorCode(await jsonBody(response))).toBe('INTERNAL');
    expect(h.logger.error.mock.calls.map((call) => call.join(' ')).join(' ')).toContain('INVALID_UPDATED_ROW');
  });
});

describe('gestionar-estado-instructor — HTTP, CORS y secreto', () => {
  it.each(['GET', 'PUT', 'PATCH', 'DELETE'])('rechaza el método %s con Allow explícito', async (method) => {
    const h = createHarness();

    const response = await h.handler(makeRequest({ method }));

    expect(response.status).toBe(405);
    expect(errorCode(await jsonBody(response))).toBe('METHOD_NOT_ALLOWED');
    expect(response.headers.get('allow')).toBe('POST, OPTIONS');
    expect(h.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('responde al preflight solo para orígenes exactamente permitidos', async () => {
    const h = createHarness();

    const allowed = await h.handler(makeRequest({ method: 'OPTIONS', origin: ALLOWED_ORIGIN }));
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN);
    expect(allowed.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');

    const allowHeaders = allowed.headers.get('access-control-allow-headers') ?? '';
    for (const header of ['authorization', 'apikey', 'content-type', 'x-client-info']) {
      expect(allowHeaders).toContain(header);
    }
    expect(allowHeaders).not.toBe('*');

    const denied = await h.handler(makeRequest({ method: 'OPTIONS', origin: OTHER_ORIGIN }));
    expect(denied.status).toBe(403);
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
    expect(h.verifyAccessToken).not.toHaveBeenCalled();
    expect(h.findById).not.toHaveBeenCalled();
  });

  it('rechaza tempranamente un POST de origen no permitido sin tocar Auth ni datos', async () => {
    const h = createHarness();
    const secretos = [SYNTHETIC_TOKEN, SENSITIVE_MARKER, SYNTHETIC_SECRET_KEY];

    const response = await h.handler(makeRequest({ origin: OTHER_ORIGIN }));
    const text = await response.clone().text();

    expect(response.status).toBe(403);
    expect(errorCode(await jsonBody(response))).toBe('ORIGIN_NOT_ALLOWED');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(h.verifyAccessToken).not.toHaveBeenCalled();
    expect(h.findById).not.toHaveBeenCalled();
    expect(h.findTarget).not.toHaveBeenCalled();
    expect(h.updateActive).not.toHaveBeenCalled();
    expect(h.logger.warn).not.toHaveBeenCalled();
    expect(h.logger.error).not.toHaveBeenCalled();
    for (const secreto of secretos) {
      expect(text).not.toContain(secreto);
    }
  });

  it('nunca habilita el comodín como origen permitido', async () => {
    const h = createHarness({ allowedOrigins: ['*'] });

    const response = await h.handler(makeRequest({ origin: '*' }));

    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('sin Origin no otorga CORS pero sigue exigiendo autenticación y autorización', async () => {
    const missing = createHarness();
    expect((await missing.handler(makeRequest({ origin: null, authorization: null }))).status).toBe(401);

    const invalid = createHarness({ verifyAccessToken: async () => null });
    expect((await invalid.handler(makeRequest({ origin: null }))).status).toBe(401);

    const inactive = createHarness({
      findById: async () => ({ id: ADMIN_ID, rol: 'administrador', activo: false }),
    });
    expect((await inactive.handler(makeRequest({ origin: null }))).status).toBe(403);
    expect(inactive.updateActive).not.toHaveBeenCalled();

    const valid = createHarness();
    const response = await valid.handler(makeRequest({ origin: null }));
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('no expone tokens, correos internos ni credenciales en respuestas ni logs', async () => {
    const h = createHarness();
    const secretos = [SYNTHETIC_TOKEN, SENSITIVE_MARKER, SYNTHETIC_SECRET_KEY, SYNTHETIC_SERVICE_KEY];

    const response = await h.handler(makeRequest());
    const text = await response.clone().text();
    const logs = [...h.logger.warn.mock.calls, ...h.logger.error.mock.calls].map((call) => call.join(' ')).join(' ');

    for (const secreto of secretos) {
      expect(text).not.toContain(secreto);
      expect(logs).not.toContain(secreto);
    }
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('parseAllowedOrigins mantiene orígenes exactos y fail-closed', () => {
    expect(parseAllowedOrigins('')).toEqual([]);
    expect(parseAllowedOrigins('*')).toEqual([]);
    expect(parseAllowedOrigins('not-a-url, https://app.example.test/path, *')).toEqual([]);
    expect(parseAllowedOrigins('https://app.example.test, capacitor://localhost')).toEqual([
      'https://app.example.test',
      'capacitor://localhost',
    ]);
  });
});

describe('gestionar-estado-instructor — saneamiento y configuración', () => {
  it('isUuid valida el formato hexadecimal sin inventar versiones', () => {
    expect(isUuid(INSTRUCTOR_ID)).toBe(true);
    expect(isUuid(INSTRUCTOR_ID.toUpperCase())).toBe(true);
    expect(isUuid('no-uuid')).toBe(false);
    expect(isUuid(123)).toBe(false);
  });

  it('toInstructorTarget descarta columnas sensibles adicionales', () => {
    const target: InstructorTarget | null = toInstructorTarget(ACTIVE_INSTRUCTOR_ROW);

    expect(target).toEqual({
      id: INSTRUCTOR_ID,
      nombre: 'instructor_real',
      rol: 'instructor',
      activo: true,
    });
    expect(Object.keys(target ?? {}).sort()).toEqual(['activo', 'id', 'nombre', 'rol']);
  });

  it('usa la clave pública legacy cuando está disponible', () => {
    expect(
      resolveVerificationKey(
        keySources({ anonKey: 'synthetic-legacy-anon-key', publishableKey: SYNTHETIC_PUBLISHABLE_KEY }),
      ),
    ).toBe('synthetic-legacy-anon-key');
  });

  it('usa la publicable singular y el default del diccionario plural', () => {
    expect(resolveVerificationKey(keySources({ publishableKey: SYNTHETIC_PUBLISHABLE_KEY }))).toBe(
      SYNTHETIC_PUBLISHABLE_KEY,
    );
    expect(
      resolveVerificationKey(
        keySources({ publishableKeysJson: JSON.stringify({ default: SYNTHETIC_PUBLISHABLE_KEY }) }),
      ),
    ).toBe(SYNTHETIC_PUBLISHABLE_KEY);
  });

  it('rechaza JSON inválido y una clave secreta como pública', () => {
    expect(resolveVerificationKey(keySources({ publishableKeysJson: '{' }))).toBe('');
    expect(resolveVerificationKey(keySources({ anonKey: SYNTHETIC_SECRET_KEY }))).toBe('');
    expect(
      resolveVerificationKey(keySources({ publishableKeysJson: JSON.stringify({ default: SYNTHETIC_SECRET_KEY }) })),
    ).toBe('');
  });

  it('acepta la JWT legacy de service_role y la clave secreta moderna', () => {
    expect(resolveServerKey(serverKeySources({ serviceRoleKey: SYNTHETIC_SERVICE_KEY }))).toBe(SYNTHETIC_SERVICE_KEY);
    expect(
      resolveServerKey(serverKeySources({ secretKeysJson: JSON.stringify({ default: SYNTHETIC_SECRET_KEY }) })),
    ).toBe(SYNTHETIC_SECRET_KEY);
  });

  it('rechaza una clave pública, un JWT anon y un diccionario secreto ambiguo', () => {
    expect(resolveServerKey(serverKeySources({ serviceRoleKey: SYNTHETIC_ANON_JWT }))).toBe('');
    expect(
      resolveServerKey(serverKeySources({ secretKeysJson: JSON.stringify({ default: SYNTHETIC_PUBLISHABLE_KEY }) })),
    ).toBe('');
    const ambiguous = JSON.stringify({ a: SYNTHETIC_SECRET_KEY, b: `${SYNTHETIC_SECRET_KEY}_rotated` });
    expect(resolveServerKey(serverKeySources({ secretKeysJson: ambiguous }))).toBe('');
  });

  it('exige URL, clave pública y credencial privada para arrancar', () => {
    expect(
      isRuntimeConfigComplete({
        supabaseUrl: 'https://project.supabase.co',
        verificationKey: SYNTHETIC_PUBLISHABLE_KEY,
        serverKey: SYNTHETIC_SECRET_KEY,
      }),
    ).toBe(true);
    expect(
      isRuntimeConfigComplete({
        supabaseUrl: '',
        verificationKey: SYNTHETIC_PUBLISHABLE_KEY,
        serverKey: SYNTHETIC_SECRET_KEY,
      }),
    ).toBe(false);
  });

  it('readSafeErrorMetadata descarta mensajes y solo conserva códigos y estados permitidos', () => {
    expect(
      readSafeErrorMetadata({
        code: '42501',
        status: 403,
        message: SENSITIVE_MARKER,
        details: SENSITIVE_MARKER,
      }),
    ).toEqual({ code: '42501', status: 403 });
    expect(readSafeErrorMetadata({ code: 'PGRST999', status: '403', message: SENSITIVE_MARKER })).toEqual({
      code: 'UNKNOWN',
      status: null,
    });
    expect(readSafeErrorMetadata(new Error(SENSITIVE_MARKER))).toEqual({ code: 'UNKNOWN', status: null });
  });

  it('no filtra el mensaje fijo de error en respuestas de conflicto', async () => {
    const h = createHarness({ initialTarget: INACTIVE_INSTRUCTOR_ROW });

    const response = await h.handler(makeRequest({ body: { id: INSTRUCTOR_ID, activo: false } }));
    const body = await jsonBody(response);
    const message = errorMessage(body);

    expect(response.status).toBe(409);
    expect(typeof message).toBe('string');
    expect(message).not.toContain(SENSITIVE_MARKER);
    expect(message).not.toContain(INSTRUCTOR_ID);
  });
});
