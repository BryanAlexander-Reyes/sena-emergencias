/**
 * Fase 5.4.B.1 — Pruebas locales de `crear-instructor` con dobles.
 *
 * Se ejecutan con Vitest sobre Node, sin Deno, sin Supabase Cloud y sin
 * usuarios reales. Todas las identidades, tokens y claves son sintéticos.
 */

import { describe, expect, it, vi, type Mock } from 'vitest';

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
  type IdentityProvisioner,
  type InstructorDirectory,
  type Logger,
  type NewIdentity,
  type NewInstructorProfile,
  type RequesterProfile,
  type ServerKeySources,
  type VerificationKeySources,
  type VerifiedCaller,
} from './handler.ts';

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const NEW_ID = '22222222-2222-2222-2222-222222222222';
const SYNTHETIC_TOKEN = 'synthetic.header.signature';

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
const SYNTHETIC_ANON_KEY = 'synthetic-legacy-anon-key';
const SYNTHETIC_PUBLISHABLE_KEY = 'sb_publishable_synthetic_key';
const SYNTHETIC_SECRET_KEY = 'sb_secret_synthetic_key';
const SYNTHETIC_SECRET_KEY_ROTATED = 'sb_secret_synthetic_key_rotated';
const ALLOWED_ORIGIN = 'https://app.example.test';
const OTHER_ORIGIN = 'https://other.example.test';
const VALID_BODY = { nombre: 'Instructor_Nuevo', password: 'Instructor123!' } as const;
const DERIVED_EMAIL = 'instructor_nuevo@sena.local.invalid';
const ENDPOINT = 'https://project.supabase.co/functions/v1/crear-instructor';

type JsonObject = Record<string, unknown>;

interface HarnessOverrides {
  readonly allowedOrigins?: readonly string[];
  readonly verifyAccessToken?: (token: string) => Promise<VerifiedCaller | null>;
  readonly findById?: (id: string) => Promise<RequesterProfile | null>;
  readonly findByNormalizedName?: (normalizedName: string) => Promise<{ readonly id: string } | null>;
  readonly insertProfile?: (profile: NewInstructorProfile) => Promise<void>;
  readonly createIdentity?: (input: NewIdentity) => Promise<{ readonly id: string }>;
  readonly deleteIdentity?: (id: string) => Promise<void>;
}

interface Harness {
  readonly handler: (request: Request) => Promise<Response>;
  readonly deps: Dependencies;
  readonly verifyAccessToken: Mock<(token: string) => Promise<VerifiedCaller | null>>;
  readonly findById: Mock<(id: string) => Promise<RequesterProfile | null>>;
  readonly findByNormalizedName: Mock<(normalizedName: string) => Promise<{ readonly id: string } | null>>;
  readonly insertProfile: Mock<(profile: NewInstructorProfile) => Promise<void>>;
  readonly createIdentity: Mock<(input: NewIdentity) => Promise<{ readonly id: string }>>;
  readonly deleteIdentity: Mock<(id: string) => Promise<void>>;
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

  const verifyAccessToken = vi.fn(overrides.verifyAccessToken ?? (async () => ({ id: ADMIN_ID })));
  const findById = vi.fn(overrides.findById ?? (async () => activeAdmin()));
  const findByNormalizedName = vi.fn(overrides.findByNormalizedName ?? (async () => null));
  const insertProfile = vi.fn(overrides.insertProfile ?? (async () => undefined));
  const createIdentity = vi.fn(overrides.createIdentity ?? (async () => ({ id: NEW_ID })));
  const deleteIdentity = vi.fn(overrides.deleteIdentity ?? (async () => undefined));

  const instructorDirectory: InstructorDirectory = {
    findByNormalizedName,
    insertProfile,
  };
  const identityProvisioner: IdentityProvisioner = {
    createIdentity,
    deleteIdentity,
  };
  const deps: Dependencies = {
    allowedOrigins: overrides.allowedOrigins ?? [ALLOWED_ORIGIN],
    logger,
    authVerifier: { verifyAccessToken },
    requesterRepository: { findById },
    instructorDirectory,
    identityProvisioner,
  };

  return {
    handler: createHandler(deps),
    deps,
    verifyAccessToken,
    findById,
    findByNormalizedName,
    insertProfile,
    createIdentity,
    deleteIdentity,
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
  const headers = new Headers({ 'content-type': 'application/json' });

  if (options.origin !== null) {
    headers.set('origin', options.origin ?? ALLOWED_ORIGIN);
  }
  if (options.authorization !== null) {
    headers.set('authorization', options.authorization ?? `Bearer ${SYNTHETIC_TOKEN}`);
  }

  const body =
    options.method === 'GET' || options.method === 'OPTIONS' || options.method === 'HEAD'
      ? undefined
      : (options.rawBody ?? JSON.stringify(options.body ?? VALID_BODY));

  return new Request(ENDPOINT, { method, headers, body });
}

async function jsonBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

function errorCode(body: JsonObject): unknown {
  return (body.error as JsonObject | undefined)?.code;
}

function keySources(overrides: Partial<VerificationKeySources> = {}): VerificationKeySources {
  return { anonKey: '', publishableKey: '', publishableKeysJson: '', ...overrides };
}

function serverKeySources(overrides: Partial<ServerKeySources> = {}): ServerKeySources {
  return { serviceRoleKey: '', secretKeysJson: '', ...overrides };
}

describe('crear-instructor — clave pública de verificación', () => {
  it('usa la variable legacy cuando está disponible', () => {
    expect(resolveVerificationKey(keySources({ anonKey: SYNTHETIC_ANON_KEY }))).toBe(SYNTHETIC_ANON_KEY);
  });

  it('usa la variable publishable singular cuando no hay legacy', () => {
    expect(resolveVerificationKey(keySources({ publishableKey: SYNTHETIC_PUBLISHABLE_KEY }))).toBe(
      SYNTHETIC_PUBLISHABLE_KEY,
    );
  });

  it('selecciona de forma inequívoca la entrada default del diccionario plural', () => {
    const json = JSON.stringify({
      default: SYNTHETIC_PUBLISHABLE_KEY,
      rotada: 'sb_publishable_synthetic_rotated',
    });

    expect(resolveVerificationKey(keySources({ publishableKeysJson: json }))).toBe(SYNTHETIC_PUBLISHABLE_KEY);
  });

  it('acepta una única candidata publicable cuando no hay entrada default', () => {
    const json = JSON.stringify({ unica: SYNTHETIC_PUBLISHABLE_KEY });

    expect(resolveVerificationKey(keySources({ publishableKeysJson: json }))).toBe(SYNTHETIC_PUBLISHABLE_KEY);
  });

  it('rechaza JSON inválido, arrays y valores no objeto', () => {
    for (const publishableKeysJson of ['{no-json', '[]', '"texto"', 'null', '42']) {
      expect(resolveVerificationKey(keySources({ publishableKeysJson }))).toBe('');
    }
  });

  it('rechaza varias candidatas sin entrada default en lugar de elegir una arbitrariamente', () => {
    const json = JSON.stringify({ a: 'sb_publishable_synthetic_a', b: 'sb_publishable_synthetic_b' });

    expect(resolveVerificationKey(keySources({ publishableKeysJson: json }))).toBe('');
  });

  it('nunca devuelve una clave privada del diccionario', () => {
    const json = JSON.stringify({ secreta: SYNTHETIC_SECRET_KEY });

    const result = resolveVerificationKey(keySources({ publishableKeysJson: json }));

    expect(result).toBe('');
    expect(result).not.toContain(SYNTHETIC_SECRET_KEY);
  });

  it('ignora entradas privadas y conserva la pública documentada', () => {
    const json = JSON.stringify({ default: SYNTHETIC_PUBLISHABLE_KEY, secreta: SYNTHETIC_SECRET_KEY });

    expect(resolveVerificationKey(keySources({ publishableKeysJson: json }))).toBe(SYNTHETIC_PUBLISHABLE_KEY);
  });

  it('no usa una legacy con apariencia de clave privada y continúa con el diccionario', () => {
    const json = JSON.stringify({ default: SYNTHETIC_PUBLISHABLE_KEY });

    expect(resolveVerificationKey(keySources({ anonKey: SYNTHETIC_SECRET_KEY, publishableKeysJson: json }))).toBe(
      SYNTHETIC_PUBLISHABLE_KEY,
    );
  });

  it('falla de forma segura sin ninguna clave pública', () => {
    expect(resolveVerificationKey(keySources())).toBe('');
  });
});

describe('crear-instructor — clave privada del servidor', () => {
  it('usa la clave legacy service_role cuando es válida', () => {
    expect(resolveServerKey(serverKeySources({ serviceRoleKey: SYNTHETIC_SERVICE_KEY }))).toBe(SYNTHETIC_SERVICE_KEY);
  });

  it('usa el diccionario moderno con entrada default', () => {
    const secretKeysJson = JSON.stringify({
      default: SYNTHETIC_SECRET_KEY,
      rotada: SYNTHETIC_SECRET_KEY_ROTATED,
    });

    expect(resolveServerKey(serverKeySources({ secretKeysJson }))).toBe(SYNTHETIC_SECRET_KEY);
  });

  it('acepta una única candidata secreta cuando no hay entrada default', () => {
    const secretKeysJson = JSON.stringify({ unica: SYNTHETIC_SECRET_KEY });

    expect(resolveServerKey(serverKeySources({ secretKeysJson }))).toBe(SYNTHETIC_SECRET_KEY);
  });

  it('rechaza varias candidatas secretas sin entrada default', () => {
    const secretKeysJson = JSON.stringify({
      a: SYNTHETIC_SECRET_KEY,
      b: SYNTHETIC_SECRET_KEY_ROTATED,
    });

    expect(resolveServerKey(serverKeySources({ secretKeysJson }))).toBe('');
  });

  it('rechaza JSON inválido, arrays y valores no objeto', () => {
    for (const secretKeysJson of ['{no-json', '[]', '"texto"', 'null', '42']) {
      expect(resolveServerKey(serverKeySources({ secretKeysJson }))).toBe('');
    }
  });

  it('rechaza una clave pública utilizada como credencial privada', () => {
    const secretKeysJson = JSON.stringify({ default: SYNTHETIC_PUBLISHABLE_KEY });

    expect(resolveServerKey(serverKeySources({ serviceRoleKey: SYNTHETIC_PUBLISHABLE_KEY }))).toBe('');
    expect(resolveServerKey(serverKeySources({ secretKeysJson }))).toBe('');
  });

  it('rechaza un JWT anon y una legacy sin formato de service_role', () => {
    expect(resolveServerKey(serverKeySources({ serviceRoleKey: SYNTHETIC_ANON_JWT }))).toBe('');
    expect(resolveServerKey(serverKeySources({ serviceRoleKey: SYNTHETIC_ANON_KEY }))).toBe('');
    expect(resolveServerKey(serverKeySources({ serviceRoleKey: 'solo.dos' }))).toBe('');
  });

  it('rechaza entradas inesperadas en el diccionario moderno', () => {
    for (const secretKeysJson of [
      JSON.stringify({ default: SYNTHETIC_SECRET_KEY, metadata: 42 }),
      JSON.stringify({ default: SYNTHETIC_SECRET_KEY, publica: SYNTHETIC_PUBLISHABLE_KEY }),
      JSON.stringify({ default: SYNTHETIC_SECRET_KEY, vacia: '' }),
    ]) {
      expect(resolveServerKey(serverKeySources({ secretKeysJson }))).toBe('');
    }
  });

  it('prefiere la legacy válida sobre el diccionario moderno', () => {
    const secretKeysJson = JSON.stringify({ default: SYNTHETIC_SECRET_KEY });

    expect(resolveServerKey(serverKeySources({ serviceRoleKey: SYNTHETIC_SERVICE_KEY, secretKeysJson }))).toBe(
      SYNTHETIC_SERVICE_KEY,
    );
  });

  it('usa el diccionario moderno cuando la legacy no es válida', () => {
    const secretKeysJson = JSON.stringify({ default: SYNTHETIC_SECRET_KEY });

    expect(resolveServerKey(serverKeySources({ serviceRoleKey: SYNTHETIC_ANON_JWT, secretKeysJson }))).toBe(
      SYNTHETIC_SECRET_KEY,
    );
  });

  it('falla de forma segura sin ninguna credencial privada', () => {
    expect(resolveServerKey(serverKeySources())).toBe('');
  });

  it('no registra ni filtra secretos en entradas inválidas', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      expect(
        resolveServerKey(
          serverKeySources({
            serviceRoleKey: SYNTHETIC_PUBLISHABLE_KEY,
            secretKeysJson: `{"default":"${SYNTHETIC_SECRET_KEY}","extra":{}}`,
          }),
        ),
      ).toBe('');
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });
});

describe('crear-instructor — configuración crítica de arranque', () => {
  const complete = {
    supabaseUrl: 'https://project.supabase.co',
    verificationKey: SYNTHETIC_PUBLISHABLE_KEY,
    serverKey: SYNTHETIC_SERVICE_KEY,
  };

  it('acepta la configuración completa', () => {
    expect(isRuntimeConfigComplete(complete)).toBe(true);
  });

  it.each(['supabaseUrl', 'verificationKey', 'serverKey'] as const)('rechaza la configuración sin %s', (missing) => {
    expect(isRuntimeConfigComplete({ ...complete, [missing]: '' })).toBe(false);
  });
});

describe('crear-instructor — flujo exitoso', () => {
  it('crea un Instructor con un Administrador activo verificado', async () => {
    const h = createHarness();

    const response = await h.handler(makeRequest());
    const body = await jsonBody(response);

    expect(response.status).toBe(201);
    expect(body).toEqual({ id: NEW_ID, nombre: VALID_BODY.nombre, activo: true });
    expect(h.verifyAccessToken).toHaveBeenCalledTimes(1);
    expect(h.verifyAccessToken).toHaveBeenCalledWith(SYNTHETIC_TOKEN);
    expect(h.findById).toHaveBeenCalledWith(ADMIN_ID);
    expect(h.createIdentity).toHaveBeenCalledWith({ email: DERIVED_EMAIL, password: VALID_BODY.password });
    expect(h.insertProfile).toHaveBeenCalledWith({
      id: NEW_ID,
      nombre: VALID_BODY.nombre,
      rol: 'instructor',
      activo: true,
    });
    expect(h.deleteIdentity).not.toHaveBeenCalled();
  });

  it('deriva el correo en minúsculas y normaliza el nombre para la búsqueda', async () => {
    const h = createHarness();

    await h.handler(makeRequest());

    expect(h.findByNormalizedName).toHaveBeenCalledWith('instructor_nuevo');
  });

  it('no modifica la sesión del Administrador ni expone datos de sesión', async () => {
    const h = createHarness();

    const response = await h.handler(makeRequest());
    const body = await jsonBody(response);

    expect(Object.keys(body).sort()).toEqual(['activo', 'id', 'nombre']);
    expect(h.deps.authVerifier).not.toHaveProperty('signOut');
    expect(h.deps.authVerifier).not.toHaveProperty('signIn');
    expect(h.deps.identityProvisioner).not.toHaveProperty('signOut');
    expect(h.verifyAccessToken).toHaveBeenCalledTimes(1);
  });
});

describe('crear-instructor — autenticación y autorización del solicitante', () => {
  it('rechaza una solicitud sin Authorization', async () => {
    const h = createHarness();

    const response = await h.handler(makeRequest({ authorization: null }));
    const body = await jsonBody(response);

    expect(response.status).toBe(401);
    expect(errorCode(body)).toBe('UNAUTHENTICATED');
    expect(h.verifyAccessToken).not.toHaveBeenCalled();
    expect(h.createIdentity).not.toHaveBeenCalled();
  });

  it('rechaza un token inválido', async () => {
    const h = createHarness({ verifyAccessToken: async () => null });

    const response = await h.handler(makeRequest({ authorization: 'Bearer token_invalido' }));
    const body = await jsonBody(response);

    expect(response.status).toBe(401);
    expect(errorCode(body)).toBe('UNAUTHENTICATED');
    expect(h.findById).not.toHaveBeenCalled();
  });

  it('rechaza un fallo del verificador sin filtrar detalles', async () => {
    const h = createHarness({
      verifyAccessToken: async () => {
        throw new Error('detalle_interno_no_debe_salir');
      },
    });

    const response = await h.handler(makeRequest());
    const text = await response.text();

    expect(response.status).toBe(401);
    expect(text).not.toContain('detalle_interno_no_debe_salir');
  });

  it('rechaza a un Instructor que intenta crear otro Instructor', async () => {
    const h = createHarness({
      findById: async () => ({ id: ADMIN_ID, rol: 'instructor', activo: true }),
    });

    const response = await h.handler(makeRequest());
    const body = await jsonBody(response);

    expect(response.status).toBe(403);
    expect(errorCode(body)).toBe('FORBIDDEN');
    expect(h.createIdentity).not.toHaveBeenCalled();
  });

  it('rechaza a un Administrador inactivo aunque el JWT sea válido', async () => {
    const h = createHarness({
      findById: async () => ({ id: ADMIN_ID, rol: 'administrador', activo: false }),
    });

    const response = await h.handler(makeRequest());

    expect(response.status).toBe(403);
    expect(h.createIdentity).not.toHaveBeenCalled();
  });

  it('rechaza a un Administrador sin perfil en public.usuarios', async () => {
    const h = createHarness({ findById: async () => null });

    const response = await h.handler(makeRequest());

    expect(response.status).toBe(403);
    expect(h.findByNormalizedName).not.toHaveBeenCalled();
  });

  it('sanea códigos no permitidos y estados no numéricos', () => {
    expect(readSafeErrorMetadata({ code: 'DROP TABLE', status: '401' })).toEqual({ code: 'UNKNOWN', status: null });
    expect(readSafeErrorMetadata(null)).toEqual({ code: 'UNKNOWN', status: null });
  });

  it.each([
    {
      raw: { code: '42501', status: 403, message: 'detalle_sql_no_debe_salir' },
      expected: 'code=42501 status=403',
    },
    {
      raw: { code: 'PGRST205', status: 404, message: 'detalle_sql_no_debe_salir' },
      expected: 'code=PGRST205 status=404',
    },
    {
      raw: { status: 401, message: 'detalle_sql_no_debe_salir' },
      expected: 'code=UNKNOWN status=401',
    },
    {
      raw: new Error('detalle_sql_no_debe_salir'),
      expected: 'code=UNKNOWN',
    },
  ])('registra metadatos seguros ($expected) si falla la consulta del solicitante', async ({ raw, expected }) => {
    const h = createHarness({
      findById: async () => {
        throw new ProfileStoreError(readSafeErrorMetadata(raw));
      },
    });

    const response = await h.handler(makeRequest());
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(errorCode(JSON.parse(text) as JsonObject)).toBe('INTERNAL');
    expect(text).not.toContain('detalle_sql_no_debe_salir');
    expect(h.logger.error).toHaveBeenCalledWith('REQUESTER_LOOKUP_FAILED', expected);
    expect(h.verifyAccessToken).toHaveBeenCalledTimes(1);
    expect(h.createIdentity).not.toHaveBeenCalled();
    expect(h.insertProfile).not.toHaveBeenCalled();
    expect(h.deleteIdentity).not.toHaveBeenCalled();
  });

  it('no registra secretos ni datos personales cuando falla la consulta del solicitante', async () => {
    const h = createHarness({
      findById: async () => {
        throw new ProfileStoreError(
          readSafeErrorMetadata({
            code: '42501',
            status: 403,
            message: `${SYNTHETIC_TOKEN} ${VALID_BODY.password} ${DERIVED_EMAIL} ${ADMIN_ID} ${SYNTHETIC_SERVICE_KEY}`,
            headers: { authorization: `Bearer ${SYNTHETIC_TOKEN}` },
          }),
        );
      },
    });

    await h.handler(makeRequest());
    const logs = [...h.logger.warn.mock.calls, ...h.logger.error.mock.calls].map((call) => call.join(' ')).join(' ');

    for (const secreto of [SYNTHETIC_TOKEN, VALID_BODY.password, DERIVED_EMAIL, ADMIN_ID, SYNTHETIC_SERVICE_KEY]) {
      expect(logs).not.toContain(secreto);
    }
    expect(logs).toContain('REQUESTER_LOOKUP_FAILED code=42501 status=403');
  });

  it('conserva la validación de Administrador activo sin registrar error de consulta', async () => {
    const h = createHarness({
      findById: async () => ({ id: ADMIN_ID, rol: 'administrador', activo: false }),
    });

    const response = await h.handler(makeRequest());

    expect(response.status).toBe(403);
    expect(errorCode(await jsonBody(response))).toBe('FORBIDDEN');
    expect(h.logger.error).not.toHaveBeenCalled();
    expect(h.createIdentity).not.toHaveBeenCalled();
  });
});

describe('crear-instructor — validación del cuerpo', () => {
  it.each(['ab', 'a'.repeat(33), 'con espacio', ' espaciado', 'espaciado ', 'usuario@correo', ''])(
    'rechaza el nombre inválido %j',
    async (nombre) => {
      const h = createHarness();

      const response = await h.handler(makeRequest({ body: { ...VALID_BODY, nombre } }));
      const body = await jsonBody(response);

      expect(response.status).toBe(400);
      expect(errorCode(body)).toBe('INVALID_REQUEST');
      expect(h.createIdentity).not.toHaveBeenCalled();
    },
  );

  it('rechaza una contraseña de menos de 8 caracteres', async () => {
    const h = createHarness();

    const response = await h.handler(makeRequest({ body: { ...VALID_BODY, password: 'corta1' } }));

    expect(response.status).toBe(400);
    expect(h.createIdentity).not.toHaveBeenCalled();
  });

  it.each(['rol', 'app_role', 'id'])('rechaza el campo de autorización inesperado %s', async (campo) => {
    const h = createHarness();

    const response = await h.handler(makeRequest({ body: { ...VALID_BODY, [campo]: 'administrador' } }));

    expect(response.status).toBe(400);
    expect(h.createIdentity).not.toHaveBeenCalled();
  });

  it('rechaza JSON inválido, arrays y campos adicionales', async () => {
    const h = createHarness();

    expect((await h.handler(makeRequest({ rawBody: '{no-json' }))).status).toBe(400);
    expect((await h.handler(makeRequest({ body: ['instructor'] }))).status).toBe(400);
    expect((await h.handler(makeRequest({ body: { ...VALID_BODY, extra: 1 } }))).status).toBe(400);
    expect(h.createIdentity).not.toHaveBeenCalled();
  });
});

describe('crear-instructor — duplicados y compensación', () => {
  it('rechaza un nombre duplicado antes de crear identidad', async () => {
    const h = createHarness({ findByNormalizedName: async () => ({ id: NEW_ID }) });

    const response = await h.handler(makeRequest());
    const body = await jsonBody(response);

    expect(response.status).toBe(409);
    expect(errorCode(body)).toBe('CONFLICT');
    expect(h.createIdentity).not.toHaveBeenCalled();
    expect(h.deleteIdentity).not.toHaveBeenCalled();
  });

  it('rechaza un correo duplicado según Auth sin compensar una identidad ajena', async () => {
    const h = createHarness({
      createIdentity: async () => {
        throw new DuplicateError('email');
      },
    });

    const response = await h.handler(makeRequest());
    const body = await jsonBody(response);

    expect(response.status).toBe(409);
    expect(errorCode(body)).toBe('CONFLICT');
    expect(h.createIdentity).toHaveBeenCalledWith({ email: DERIVED_EMAIL, password: VALID_BODY.password });
    expect(h.insertProfile).not.toHaveBeenCalled();
    expect(h.deleteIdentity).not.toHaveBeenCalled();
  });

  it('no convierte un error desconocido de createUser en duplicado', async () => {
    const h = createHarness({
      createIdentity: async () => {
        throw new Error('detalle_no_debe_salir');
      },
    });

    const response = await h.handler(makeRequest());
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain('detalle_no_debe_salir');
    expect(h.deleteIdentity).not.toHaveBeenCalled();
    expect(h.logger.error).toHaveBeenCalledWith('INTERNAL_ERROR');
  });

  it('resuelve solicitudes simultáneas con el mismo nombre mediante la unicidad de Auth', async () => {
    let createAttempts = 0;
    const h = createHarness({
      createIdentity: async () => {
        createAttempts += 1;
        if (createAttempts > 1) {
          throw new DuplicateError('email');
        }
        return { id: NEW_ID };
      },
    });

    const responses = await Promise.all([h.handler(makeRequest()), h.handler(makeRequest())]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(createAttempts).toBe(2);
    expect(h.insertProfile).toHaveBeenCalledTimes(1);
    expect(h.deleteIdentity).not.toHaveBeenCalled();
  });

  it('gestiona la carrera de duplicados y compensa la identidad creada', async () => {
    const h = createHarness({
      insertProfile: async () => {
        throw new DuplicateError('nombre');
      },
    });

    const response = await h.handler(makeRequest());
    const body = await jsonBody(response);

    expect(response.status).toBe(409);
    expect(errorCode(body)).toBe('CONFLICT');
    expect(h.deleteIdentity).toHaveBeenCalledTimes(1);
    expect(h.deleteIdentity).toHaveBeenCalledWith(NEW_ID);
  });

  it('elimina la identidad si falla la inserción del perfil', async () => {
    const h = createHarness({
      insertProfile: async () => {
        throw new ProfileStoreError();
      },
    });

    const response = await h.handler(makeRequest());
    const body = await jsonBody(response);

    expect(response.status).toBe(500);
    expect(errorCode(body)).toBe('INTERNAL');
    expect(h.deleteIdentity).toHaveBeenCalledWith(NEW_ID);
    expect(h.logger.error).toHaveBeenCalledWith('PROFILE_INSERT_FAILED');
  });

  it('mantiene una respuesta segura si también falla la compensación', async () => {
    const h = createHarness({
      insertProfile: async () => {
        throw new ProfileStoreError();
      },
      deleteIdentity: async () => {
        throw new IdentityProvisionError();
      },
    });

    const response = await h.handler(makeRequest());
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain('detalle');
    expect(h.logger.error).toHaveBeenCalledWith('COMPENSATION_FAILED');
    expect(h.logger.error).toHaveBeenCalledWith('PROFILE_INSERT_FAILED');
  });

  it('devuelve 502 si falla la API Admin de Auth', async () => {
    const h = createHarness({
      createIdentity: async () => {
        throw new IdentityProvisionError();
      },
    });

    const response = await h.handler(makeRequest());
    const body = await jsonBody(response);

    expect(response.status).toBe(502);
    expect(errorCode(body)).toBe('IDENTITY_PROVISION_FAILED');
    expect(h.insertProfile).not.toHaveBeenCalled();
    expect(h.deleteIdentity).not.toHaveBeenCalled();
    expect(h.logger.error).toHaveBeenCalledWith('IDENTITY_PROVISION_FAILED');
  });
});

describe('crear-instructor — HTTP, CORS y secreto', () => {
  it('rechaza métodos distintos de POST y OPTIONS', async () => {
    const h = createHarness();

    const response = await h.handler(makeRequest({ method: 'GET' }));

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST, OPTIONS');
  });

  it('responde al preflight CORS solo para orígenes permitidos', async () => {
    const h = createHarness();

    const allowed = await h.handler(makeRequest({ method: 'OPTIONS', origin: ALLOWED_ORIGIN }));
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN);
    expect(allowed.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    expect(allowed.headers.get('access-control-allow-headers')).toContain('authorization');

    const denied = await h.handler(makeRequest({ method: 'OPTIONS', origin: OTHER_ORIGIN }));
    expect(denied.status).toBe(403);
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
    expect(h.verifyAccessToken).not.toHaveBeenCalled();
    expect(h.findById).not.toHaveBeenCalled();
  });

  it('permite x-client-info en el preflight desde http://localhost:8100', async () => {
    const localOrigin = 'http://localhost:8100';
    const h = createHarness({ allowedOrigins: [localOrigin] });

    const response = await h.handler(makeRequest({ method: 'OPTIONS', origin: localOrigin }));
    const allowHeaders = response.headers.get('access-control-allow-headers') ?? '';

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(localOrigin);
    for (const header of ['authorization', 'apikey', 'content-type', 'x-client-info']) {
      expect(allowHeaders).toContain(header);
    }
    expect(allowHeaders).not.toBe('*');
    expect(h.verifyAccessToken).not.toHaveBeenCalled();
    expect(h.findById).not.toHaveBeenCalled();
  });

  it('permite un POST de un origen autorizado con Administrador válido', async () => {
    const h = createHarness();

    const response = await h.handler(makeRequest());

    expect(response.status).toBe(201);
    expect(response.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN);
    expect(h.createIdentity).toHaveBeenCalledTimes(1);
  });

  it('rechaza un POST de origen no permitido antes de autenticar, consultar o crear usuarios', async () => {
    const h = createHarness();
    const secretos = [SYNTHETIC_TOKEN, VALID_BODY.password, DERIVED_EMAIL, SYNTHETIC_SERVICE_KEY];

    const response = await h.handler(makeRequest({ origin: OTHER_ORIGIN }));
    const text = await response.text();
    const body = JSON.parse(text) as JsonObject;

    expect(response.status).toBe(403);
    expect(errorCode(body)).toBe('ORIGIN_NOT_ALLOWED');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(h.verifyAccessToken).not.toHaveBeenCalled();
    expect(h.findById).not.toHaveBeenCalled();
    expect(h.findByNormalizedName).not.toHaveBeenCalled();
    expect(h.createIdentity).not.toHaveBeenCalled();
    expect(h.insertProfile).not.toHaveBeenCalled();
    expect(h.deleteIdentity).not.toHaveBeenCalled();
    expect(h.logger.warn).not.toHaveBeenCalled();
    expect(h.logger.error).not.toHaveBeenCalled();

    for (const secreto of secretos) {
      expect(text).not.toContain(secreto);
    }
  });

  it('falla de forma segura con una configuración CORS vacía', async () => {
    const h = createHarness({ allowedOrigins: [] });

    const rejected = await h.handler(makeRequest({ origin: ALLOWED_ORIGIN }));
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get('access-control-allow-origin')).toBeNull();
    expect(h.verifyAccessToken).not.toHaveBeenCalled();

    const unauthenticated = await h.handler(makeRequest({ origin: null, authorization: null }));
    expect(unauthenticated.status).toBe(401);

    const authenticated = await h.handler(makeRequest({ origin: null }));
    expect(authenticated.status).toBe(201);
    expect(authenticated.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('descarta comodines y orígenes inválidos al normalizar CORS', () => {
    expect(parseAllowedOrigins('')).toEqual([]);
    expect(parseAllowedOrigins('*')).toEqual([]);
    expect(parseAllowedOrigins('not-a-url, https://app.example.test/path, *')).toEqual([]);
    expect(parseAllowedOrigins('https://app.example.test, capacitor://localhost')).toEqual([
      'https://app.example.test',
      'capacitor://localhost',
    ]);
  });

  it('nunca habilita Access-Control-Allow-Origin: *', async () => {
    const h = createHarness({ allowedOrigins: ['*'] });

    const response = await h.handler(makeRequest({ origin: '*' }));

    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('sin Origin continúa exigiendo autenticación y autorización', async () => {
    const missing = createHarness();
    expect((await missing.handler(makeRequest({ origin: null, authorization: null }))).status).toBe(401);

    const invalid = createHarness({ verifyAccessToken: async () => null });
    expect((await invalid.handler(makeRequest({ origin: null }))).status).toBe(401);

    const inactive = createHarness({
      findById: async () => ({ id: ADMIN_ID, rol: 'administrador', activo: false }),
    });
    expect((await inactive.handler(makeRequest({ origin: null }))).status).toBe(403);
    expect(inactive.createIdentity).not.toHaveBeenCalled();

    const valid = createHarness();
    const response = await valid.handler(makeRequest({ origin: null }));
    expect(response.status).toBe(201);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(valid.deps.authVerifier).not.toHaveProperty('signIn');
    expect(valid.deps.authVerifier).not.toHaveProperty('signOut');
  });

  it('no expone token, contraseña, correo interno ni clave de servicio', async () => {
    const h = createHarness();
    const secretos = [SYNTHETIC_TOKEN, VALID_BODY.password, DERIVED_EMAIL, SYNTHETIC_SERVICE_KEY];

    const response = await h.handler(makeRequest());
    const text = await response.text();
    const logs = [...h.logger.warn.mock.calls, ...h.logger.error.mock.calls].map((call) => call.join(' ')).join(' ');

    for (const secreto of secretos) {
      expect(text).not.toContain(secreto);
      expect(logs).not.toContain(secreto);
    }
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('escapa comodines LIKE en nombres con guion bajo', () => {
    expect(escapeLikePattern('admin_user')).toBe('admin\\_user');
    expect(escapeLikePattern('100%')).toBe('100\\%');
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
  });
});
