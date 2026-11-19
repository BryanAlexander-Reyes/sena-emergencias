import { TestBed } from '@angular/core/testing';
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  type SupabaseClient,
} from '@supabase/supabase-js';

import { SupabaseService } from '../supabase.service';

import type { AdminUserAccount, CreateInstructorInput, InstructorAccount } from './auth-domain.types';
import type { InstructorAccountRepository } from './instructor-account-repository.contract';
import {
  INSTRUCTOR_REPOSITORY_MESSAGES,
  InstructorRepositoryError,
  type InstructorRepositoryErrorCode,
  SupabaseInstructorAccountRepository,
} from './supabase-instructor-account.repository';

const INPUT: CreateInstructorInput = {
  nombre: 'instructor_real',
  password: 'clave-simulada-123',
};

const SERVER_ACCOUNT = {
  id: 'ins-servidor-001',
  nombre: 'instructor_real',
  activo: true,
  interno: 'no debe propagarse',
} as const;

const SENSITIVE = 'informacion-interna-no-debe-filtrarse';
const ADMIN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACTIVE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const INACTIVE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const ADMIN_USER = {
  id: ADMIN_ID,
  nombre: 'admin_real',
  rol: 'administrador',
  activo: true,
  email: SENSITIVE,
  app_metadata: { interno: SENSITIVE },
} as const;

const ACTIVE_INSTRUCTOR = {
  id: ACTIVE_ID,
  nombre: 'instructor_activo',
  rol: 'instructor',
  activo: true,
} as const;

const INACTIVE_INSTRUCTOR = {
  id: INACTIVE_ID,
  nombre: 'instructor_inactivo',
  rol: 'instructor',
  activo: false,
} as const;

const LIST_RESPONSE = {
  usuarios: [ADMIN_USER, ACTIVE_INSTRUCTOR, INACTIVE_INSTRUCTOR],
  interno: SENSITIVE,
} as const;

const EXPECTED_USERS: readonly AdminUserAccount[] = [
  { id: ADMIN_ID, nombre: 'admin_real', rol: 'administrador', activo: true },
  { id: ACTIVE_ID, nombre: 'instructor_activo', rol: 'instructor', activo: true },
  { id: INACTIVE_ID, nombre: 'instructor_inactivo', rol: 'instructor', activo: false },
];

const INVALID_RESPONSES: readonly unknown[] = [
  null,
  undefined,
  'texto',
  [],
  {},
  { usuarios: null },
  { usuarios: {} },
  { usuarios: 'no-array' },
  { usuarios: [{ id: 'solo-id' }] },
  { usuarios: [{ id: 'x', nombre: 'n', rol: 'otro', activo: true }] },
  { usuarios: [{ id: 'x', nombre: 'n', rol: 'instructor', activo: 'true' }] },
  { usuarios: [null] },
  {
    usuarios: [
      { id: 'x', nombre: 'valido', rol: 'instructor', activo: false },
      { id: 'y', nombre: 'invalido', rol: 'otro', activo: true },
    ],
  },
];

describe('SupabaseInstructorAccountRepository', () => {
  let invoke: ReturnType<typeof vi.fn>;
  let signInWithPassword: ReturnType<typeof vi.fn>;
  let signOut: ReturnType<typeof vi.fn>;

  function configureWithClient(client: unknown): SupabaseInstructorAccountRepository {
    TestBed.configureTestingModule({
      providers: [SupabaseInstructorAccountRepository, { provide: SupabaseService, useValue: { client } }],
    });

    return TestBed.inject(SupabaseInstructorAccountRepository);
  }

  function configuredClient(): SupabaseClient {
    return {
      functions: { invoke },
      auth: { signInWithPassword, signOut },
    } as unknown as SupabaseClient;
  }

  beforeEach(() => {
    invoke = vi.fn();
    signInWithPassword = vi.fn();
    signOut = vi.fn();
  });

  describe('create() — regresión del alta real', () => {
    it('invoca únicamente crear-instructor con nombre y contraseña y devuelve una vista mínima', async () => {
      invoke.mockResolvedValue({ data: SERVER_ACCOUNT, error: null });
      const repository = configureWithClient(configuredClient());

      const result = await repository.create(INPUT);

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith('crear-instructor', {
        body: { nombre: INPUT.nombre, password: INPUT.password },
      });
      expect(Object.keys(invoke.mock.calls[0]?.[1] ?? {})).toEqual(['body']);
      expect(invoke.mock.calls[0]?.[2]).toBeUndefined();
      expect(result).toEqual({ id: SERVER_ACCOUNT.id, nombre: SERVER_ACCOUNT.nombre, activo: true });
      expect(result).not.toHaveProperty('interno');
      expect(signInWithPassword).not.toHaveBeenCalled();
      expect(signOut).not.toHaveBeenCalled();
    });

    it('falla de forma segura si el cliente Supabase no está configurado', async () => {
      const repository = configureWithClient(null);

      await expect(repository.create(INPUT)).rejects.toMatchObject({
        name: 'InstructorRepositoryError',
        code: 'NOT_CONFIGURED',
        message: INSTRUCTOR_REPOSITORY_MESSAGES.NOT_CONFIGURED,
      });
    });

    it.each([
      { status: 400, code: 'INVALID_DATA' as const },
      { status: 401, code: 'UNAUTHENTICATED' as const },
      { status: 403, code: 'FORBIDDEN' as const },
      { status: 404, code: 'FUNCTION_UNAVAILABLE' as const },
      { status: 409, code: 'CONFLICT' as const },
      { status: 500, code: 'SERVER' as const },
    ])('traduce el estado HTTP $status a $code sin leer el cuerpo del error', async ({ status, code }) => {
      invoke.mockResolvedValue({
        data: null,
        error: new FunctionsHttpError({ status, body: { detalle: SENSITIVE } }),
      });
      const repository = configureWithClient(configuredClient());

      await expect(repository.create(INPUT)).rejects.toMatchObject({
        name: 'InstructorRepositoryError',
        code,
        message: INSTRUCTOR_REPOSITORY_MESSAGES[code],
      });
    });

    it('traduce un error de red a un mensaje seguro', async () => {
      invoke.mockResolvedValue({
        data: null,
        error: new FunctionsFetchError({ detalle: SENSITIVE }),
      });
      const repository = configureWithClient(configuredClient());

      await expect(repository.create(INPUT)).rejects.toMatchObject({
        code: 'NETWORK',
        message: INSTRUCTOR_REPOSITORY_MESSAGES.NETWORK,
      });
    });

    it('traduce un error del relay a función no disponible', async () => {
      invoke.mockResolvedValue({
        data: null,
        error: new FunctionsRelayError({ detalle: SENSITIVE }),
      });
      const repository = configureWithClient(configuredClient());

      await expect(repository.create(INPUT)).rejects.toMatchObject({
        code: 'FUNCTION_UNAVAILABLE',
        message: INSTRUCTOR_REPOSITORY_MESSAGES.FUNCTION_UNAVAILABLE,
      });
    });

    it('no propaga detalles de errores desconocidos', async () => {
      invoke.mockRejectedValue(new Error(`stack trace ${SENSITIVE}`));
      const repository = configureWithClient(configuredClient());

      await expect(repository.create(INPUT)).rejects.toMatchObject({
        code: 'SERVER',
        message: INSTRUCTOR_REPOSITORY_MESSAGES.SERVER,
      });
    });

    it('rechaza respuestas exitosas con un cuerpo inesperado', async () => {
      invoke.mockResolvedValue({ data: { id: 'ins-1' }, error: null });
      const repository = configureWithClient(configuredClient());

      await expect(repository.create(INPUT)).rejects.toMatchObject({
        code: 'SERVER',
        message: INSTRUCTOR_REPOSITORY_MESSAGES.SERVER,
      });
    });

    it('mantiene el alta estricta ante una respuesta con activo false', async () => {
      invoke.mockResolvedValue({ data: { ...SERVER_ACCOUNT, activo: false }, error: null });
      const repository = configureWithClient(configuredClient());

      await expect(repository.create(INPUT)).rejects.toMatchObject({
        code: 'SERVER',
        message: INSTRUCTOR_REPOSITORY_MESSAGES.SERVER,
      });
    });
  });

  describe('list() — conexión con listar-usuarios-admin', () => {
    it('realiza un GET explícito sin cuerpo ni credenciales adicionales', async () => {
      invoke.mockResolvedValue({ data: LIST_RESPONSE, error: null });
      const repository = configureWithClient(configuredClient());

      await repository.list();

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith('listar-usuarios-admin', { method: 'GET' });
      expect(Object.keys(invoke.mock.calls[0]?.[1] ?? {})).toEqual(['method']);
      expect(invoke.mock.calls[0]?.[2]).toBeUndefined();
      expect(signInWithPassword).not.toHaveBeenCalled();
      expect(signOut).not.toHaveBeenCalled();
    });

    it('devuelve el listado con los cuatro campos permitidos y en el orden del servidor', async () => {
      invoke.mockResolvedValue({ data: LIST_RESPONSE, error: null });
      const repository = configureWithClient(configuredClient());

      const result = await repository.list();

      expect(result).toEqual(EXPECTED_USERS);
      expect(result.map((user) => user.id)).toEqual([ADMIN_ID, ACTIVE_ID, INACTIVE_ID]);
      for (const user of result) {
        expect(Object.keys(user)).toEqual(['id', 'nombre', 'rol', 'activo']);
      }
    });

    it('devuelve una lista vacía cuando el servidor no reporta cuentas', async () => {
      invoke.mockResolvedValue({ data: { usuarios: [] }, error: null });
      const repository = configureWithClient(configuredClient());

      await expect(repository.list()).resolves.toEqual([]);
    });

    it('acepta cuentas activas e inactivas y ambos roles', async () => {
      invoke.mockResolvedValue({ data: LIST_RESPONSE, error: null });
      const repository = configureWithClient(configuredClient());

      const result = await repository.list();

      expect(result.map((user) => user.activo)).toEqual([true, true, false]);
      expect(result.map((user) => user.rol)).toEqual(['administrador', 'instructor', 'instructor']);
    });

    it('no propaga campos adicionales del servidor', async () => {
      invoke.mockResolvedValue({ data: LIST_RESPONSE, error: null });
      const repository = configureWithClient(configuredClient());

      const serialized = JSON.stringify(await repository.list());

      expect(serialized).not.toContain(SENSITIVE);
      expect(serialized).not.toContain('email');
      expect(serialized).not.toContain('app_metadata');
      expect(serialized).not.toContain('interno');
    });

    it.each(INVALID_RESPONSES)('rechaza sin datos parciales la respuesta malformada %j', async (data) => {
      invoke.mockResolvedValue({ data, error: null });
      const repository = configureWithClient(configuredClient());

      await expect(repository.list()).rejects.toMatchObject({
        name: 'InstructorRepositoryError',
        code: 'INVALID_RESPONSE',
        message: INSTRUCTOR_REPOSITORY_MESSAGES.INVALID_RESPONSE,
      });
    });

    it.each([
      { status: 401, code: 'UNAUTHENTICATED' as const },
      { status: 403, code: 'LIST_FORBIDDEN' as const },
      { status: 404, code: 'LIST_FUNCTION_UNAVAILABLE' as const },
      { status: 500, code: 'LIST_FAILED' as const },
      { status: 400, code: 'LIST_FAILED' as const },
    ])('traduce el estado HTTP $status del listado a $code sin filtrar el cuerpo', async ({ status, code }) => {
      invoke.mockResolvedValue({
        data: null,
        error: new FunctionsHttpError({ status, body: { detalle: SENSITIVE } }),
      });
      const repository = configureWithClient(configuredClient());

      const failure = await repository.list().catch((error: unknown) => error);

      expect(failure).toMatchObject({
        code,
        message: INSTRUCTOR_REPOSITORY_MESSAGES[code],
      });
      expect((failure as Error).message).not.toContain(SENSITIVE);
    });

    it.each([
      { error: new FunctionsFetchError({ detalle: SENSITIVE }), code: 'NETWORK' as const },
      { error: new FunctionsRelayError({ detalle: SENSITIVE }), code: 'LIST_FUNCTION_UNAVAILABLE' as const },
      { error: new Error(`stack ${SENSITIVE}`), code: 'LIST_FAILED' as const },
    ])('traduce el error de integración a $code sin filtrar su mensaje', async ({ error, code }) => {
      invoke.mockResolvedValue({ data: null, error });
      const repository = configureWithClient(configuredClient());

      const failure = await repository.list().catch((caught: unknown) => caught);

      expect(failure).toMatchObject({ code, message: INSTRUCTOR_REPOSITORY_MESSAGES[code] });
      expect((failure as Error).message).not.toContain(SENSITIVE);
    });

    it('falla de forma segura si el cliente Supabase no está configurado', async () => {
      const repository = configureWithClient(null);

      await expect(repository.list()).rejects.toMatchObject({
        code: 'NOT_CONFIGURED',
        message: INSTRUCTOR_REPOSITORY_MESSAGES.NOT_CONFIGURED,
      });
      expect(invoke).not.toHaveBeenCalled();
    });

    it('devuelve un DTO asignable al contrato base y al modelo administrativo', async () => {
      invoke.mockResolvedValue({ data: LIST_RESPONSE, error: null });
      const repository = configureWithClient(configuredClient());
      const contract: InstructorAccountRepository = repository;

      const result = await repository.list();
      const adminView: readonly AdminUserAccount[] = result;
      const baseView: readonly InstructorAccount[] = result;

      expect(adminView).toBe(baseView);
      expect(contract).toBe(repository);
    });
  });

  describe('setActive() — conexión con gestionar-estado-instructor', () => {
    const DEACTIVATION_RESPONSE = {
      id: ACTIVE_ID,
      nombre: ACTIVE_INSTRUCTOR.nombre,
      rol: 'instructor',
      activo: false,
      email: SENSITIVE,
    } as const;

    const REACTIVATION_RESPONSE = {
      id: INACTIVE_ID,
      nombre: INACTIVE_INSTRUCTOR.nombre,
      rol: 'instructor',
      activo: true,
      email: SENSITIVE,
    } as const;

    const INVALID_STATUS_RESPONSES: readonly unknown[] = [
      null,
      undefined,
      'texto',
      [],
      {},
      { id: ACTIVE_ID, nombre: 'instructor', rol: 'instructor' },
      { ...DEACTIVATION_RESPONSE, activo: 'false' },
      { ...DEACTIVATION_RESPONSE, rol: 'administrador' },
      { ...REACTIVATION_RESPONSE, activo: false },
      { ...DEACTIVATION_RESPONSE, id: INACTIVE_ID },
    ];

    it('desactiva un Instructor con POST y devuelve solo la vista mínima del contrato', async () => {
      invoke.mockResolvedValue({ data: DEACTIVATION_RESPONSE, error: null });
      const repository = configureWithClient(configuredClient());

      const result = await repository.setActive(ACTIVE_ID, false);

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith('gestionar-estado-instructor', {
        method: 'POST',
        body: { id: ACTIVE_ID, activo: false },
      });
      expect(Object.keys(invoke.mock.calls[0]?.[1] ?? {}).sort()).toEqual(['body', 'method']);
      expect(Object.keys(invoke.mock.calls[0]?.[1]?.body ?? {}).sort()).toEqual(['activo', 'id']);
      expect(invoke.mock.calls[0]?.[2]).toBeUndefined();
      expect(result).toEqual({ id: ACTIVE_ID, nombre: ACTIVE_INSTRUCTOR.nombre, activo: false });
      expect(Object.keys(result)).toEqual(['id', 'nombre', 'activo']);
      expect(JSON.stringify(result)).not.toContain(SENSITIVE);
      expect(signInWithPassword).not.toHaveBeenCalled();
      expect(signOut).not.toHaveBeenCalled();
    });

    it('reactiva un Instructor con el mismo contrato y el estado solicitado', async () => {
      invoke.mockResolvedValue({ data: REACTIVATION_RESPONSE, error: null });
      const repository = configureWithClient(configuredClient());

      const result = await repository.setActive(INACTIVE_ID, true);

      expect(invoke).toHaveBeenCalledWith('gestionar-estado-instructor', {
        method: 'POST',
        body: { id: INACTIVE_ID, activo: true },
      });
      expect(result).toEqual({ id: INACTIVE_ID, nombre: INACTIVE_INSTRUCTOR.nombre, activo: true });
    });

    it.each(INVALID_STATUS_RESPONSES)('rechaza la respuesta inconsistente %j', async (data) => {
      invoke.mockResolvedValue({ data, error: null });
      const repository = configureWithClient(configuredClient());

      await expect(repository.setActive(ACTIVE_ID, false)).rejects.toMatchObject({
        name: 'InstructorRepositoryError',
        code: 'INVALID_RESPONSE',
        message: INSTRUCTOR_REPOSITORY_MESSAGES.INVALID_RESPONSE,
      });
    });

    it.each([
      { status: 400, activo: false, code: 'INVALID_STATUS_REQUEST' as const },
      { status: 401, activo: false, code: 'UNAUTHENTICATED' as const },
      { status: 403, activo: false, code: 'OPERATION_NOT_ALLOWED' as const },
      { status: 404, activo: false, code: 'TARGET_NOT_FOUND' as const },
      { status: 409, activo: false, code: 'ALREADY_INACTIVE' as const },
      { status: 409, activo: true, code: 'ALREADY_ACTIVE' as const },
      { status: 500, activo: false, code: 'STATUS_UPDATE_FAILED' as const },
    ])(
      'traduce el estado HTTP $status (activo=$activo) a $code sin filtrar el cuerpo',
      async ({ status, activo, code }) => {
        invoke.mockResolvedValue({
          data: null,
          error: new FunctionsHttpError({ status, body: { detalle: SENSITIVE } }),
        });
        const repository = configureWithClient(configuredClient());

        const failure = await repository.setActive(ACTIVE_ID, activo).catch((error: unknown) => error);

        expect(failure).toMatchObject({ code, message: INSTRUCTOR_REPOSITORY_MESSAGES[code] });
        expect((failure as Error).message).not.toContain(SENSITIVE);
      },
    );

    it.each([
      {
        name: 'red',
        error: new FunctionsFetchError({ detalle: SENSITIVE }),
        code: 'NETWORK' as const,
      },
      {
        name: 'relay',
        error: new FunctionsRelayError({ detalle: SENSITIVE }),
        code: 'STATUS_UPDATE_FAILED' as const,
      },
      {
        name: 'desconocido',
        error: new Error(`stack ${SENSITIVE}`),
        code: 'STATUS_UPDATE_FAILED' as const,
      },
    ])('traduce el error de $name a $code sin exponer su mensaje', async ({ error, code }) => {
      invoke.mockResolvedValue({ data: null, error });
      const repository = configureWithClient(configuredClient());

      const failure = await repository.setActive(ACTIVE_ID, false).catch((caught: unknown) => caught);

      expect(failure).toMatchObject({ code, message: INSTRUCTOR_REPOSITORY_MESSAGES[code] });
      expect((failure as Error).message).not.toContain(SENSITIVE);
    });

    it('falla de forma segura si el cliente Supabase no está configurado', async () => {
      const repository = configureWithClient(null);

      await expect(repository.setActive(ACTIVE_ID, false)).rejects.toMatchObject({
        code: 'NOT_CONFIGURED',
        message: INSTRUCTOR_REPOSITORY_MESSAGES.NOT_CONFIGURED,
      });
      expect(invoke).not.toHaveBeenCalled();
    });

    it('es asignable al contrato base y no depende del repositorio demo', async () => {
      invoke.mockResolvedValue({ data: DEACTIVATION_RESPONSE, error: null });
      const repository = configureWithClient(configuredClient());
      const contract: InstructorAccountRepository = repository;

      const result = await contract.setActive(ACTIVE_ID, false);

      expect(result.activo).toBe(false);
      expect(signInWithPassword).not.toHaveBeenCalled();
      expect(signOut).not.toHaveBeenCalled();
    });
  });

  it('expone mensajes fijos sin contraseñas, tokens ni detalles internos', () => {
    const messages = Object.values(INSTRUCTOR_REPOSITORY_MESSAGES).join(' ');

    expect(messages).not.toContain(INPUT.password);
    expect(messages).not.toContain(SENSITIVE);
    expect(messages).not.toMatch(/token|stack|supabase|functionshttp/i);
    expect(new InstructorRepositoryError('FORBIDDEN').message).toBe(INSTRUCTOR_REPOSITORY_MESSAGES.FORBIDDEN);
  });

  it('prepara mensajes seguros para lectura y cambio de estado', () => {
    const codes: readonly InstructorRepositoryErrorCode[] = [
      'INVALID_RESPONSE',
      'LIST_FAILED',
      'LIST_FORBIDDEN',
      'LIST_FUNCTION_UNAVAILABLE',
      'STATUS_UPDATE_FAILED',
      'TARGET_NOT_FOUND',
      'ALREADY_INACTIVE',
      'ALREADY_ACTIVE',
      'INVALID_STATUS_REQUEST',
      'OPERATION_NOT_ALLOWED',
    ];

    for (const code of codes) {
      const message = INSTRUCTOR_REPOSITORY_MESSAGES[code];

      expect(new InstructorRepositoryError(code).message).toBe(message);
      expect(message).not.toMatch(/token|stack|supabase|functionshttp|sql|jwt/i);
    }
  });
});
