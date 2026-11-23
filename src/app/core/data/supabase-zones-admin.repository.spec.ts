import { TestBed } from '@angular/core/testing';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SupabaseService } from '../supabase.service';

import { SupabaseZonesAdminRepository } from './supabase-zones-admin.repository';
import type { ZoneConfig } from './zone-config.types';
import { ZONES_ADMIN_COLUMNS } from './zones-admin.input';
import { ZONES_ADMIN_REPOSITORY_MESSAGES } from './zones-admin.repository.errors';

const SERVER_ROW = {
  id: 'sala-nueva',
  codigo: 'N1',
  nombre: 'Sala nueva',
  capacidad: 40,
  icono: 'book-outline',
  tipo: 'biblioteca',
  segura: false,
  activo: true,
  publico: true,
  map_x: 12,
  map_y: 24,
  ancho: 100,
  alto: 80,
  etiqueta_x: 62,
  etiqueta_y: 64,
  interno: 'secreto-no-debe-filtrarse',
} as const;

const VALID_CONFIG: ZoneConfig = {
  id: 'sala-nueva',
  codigo: 'N1',
  nombre: 'Sala nueva',
  capacidad: 40,
  icono: 'book-outline',
  tipo: 'biblioteca',
  segura: false,
  activo: true,
  publico: true,
  map: { x: 12, y: 24, width: 100, height: 80, labelX: 62, labelY: 64 },
};

interface RecordedCall {
  table: string;
  operation: 'select' | 'insert' | 'update';
  columns: string[];
  payload?: Record<string, unknown>;
  filters: { kind: 'eq' | 'neq'; column: string; value: unknown }[];
  order?: readonly [string, { ascending: boolean }];
  single: boolean;
}

interface FakeResponse {
  data: unknown;
  error: unknown;
}

type Responder = (call: RecordedCall) => FakeResponse | Promise<FakeResponse>;

class FakeQuery {
  constructor(
    readonly call: RecordedCall,
    private readonly responder: Responder,
  ) {}

  select(columns: string): this {
    this.call.columns.push(columns);
    return this;
  }

  order(column: string, options: { ascending: boolean }): this {
    this.call.order = [column, options];
    return this;
  }

  eq(column: string, value: unknown): this {
    this.call.filters.push({ kind: 'eq', column, value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.call.filters.push({ kind: 'neq', column, value });
    return this;
  }

  single(): this {
    this.call.single = true;
    return this;
  }

  insert(payload: Record<string, unknown>): this {
    this.call.operation = 'insert';
    this.call.payload = payload;
    return this;
  }

  update(payload: Record<string, unknown>): this {
    this.call.operation = 'update';
    this.call.payload = payload;
    return this;
  }

  then<TResult1 = FakeResponse, TResult2 = never>(
    onfulfilled?: ((value: FakeResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.responder(this.call)).then(onfulfilled, onrejected);
  }
}

function queue(responses: readonly FakeResponse[]): Responder {
  let index = 0;

  return () => {
    const response = responses[index] ?? responses[responses.length - 1] ?? { data: [], error: null };
    index += 1;

    return response;
  };
}

function fakeClient(
  responder: Responder,
  session: unknown = { access_token: 'sesion-de-prueba' },
): {
  client: SupabaseClient;
  calls: RecordedCall[];
  getSession: ReturnType<typeof vi.fn>;
} {
  const calls: RecordedCall[] = [];
  const getSession = vi.fn(async () => ({ data: { session }, error: null }));
  const from = vi.fn((table: string) => {
    const call: RecordedCall = { table, operation: 'select', columns: [], filters: [], single: false };
    calls.push(call);

    return new FakeQuery(call, responder);
  });
  const client = { from, auth: { getSession } } as unknown as SupabaseClient;

  return { client, calls, getSession };
}

function configure(client: SupabaseClient | null): SupabaseZonesAdminRepository {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [SupabaseZonesAdminRepository, { provide: SupabaseService, useValue: { client } }],
  });

  return TestBed.inject(SupabaseZonesAdminRepository);
}

describe('SupabaseZonesAdminRepository — administración de zonas', () => {
  it('falla de forma segura si el cliente Supabase no está configurado', async () => {
    const repository = configure(null);

    for (const operation of [
      () => repository.listAll(),
      () => repository.create(VALID_CONFIG),
      () => repository.update(VALID_CONFIG.id, VALID_CONFIG),
      () => repository.setActive(VALID_CONFIG.id, false),
    ]) {
      await expect(operation()).rejects.toMatchObject({
        name: 'ZonesAdminRepositoryError',
        code: 'NOT_CONFIGURED',
        message: ZONES_ADMIN_REPOSITORY_MESSAGES.NOT_CONFIGURED,
      });
    }
  });

  it('no envía ninguna operación sin una sesión autenticada', async () => {
    const fake = fakeClient(queue([]), null);
    const repository = configure(fake.client);

    for (const operation of [
      () => repository.listAll(),
      () => repository.create(VALID_CONFIG),
      () => repository.update(VALID_CONFIG.id, VALID_CONFIG),
      () => repository.setActive(VALID_CONFIG.id, false),
    ]) {
      await expect(operation()).rejects.toMatchObject({ code: 'NOT_AUTHENTICATED' });
    }
    expect(fake.calls).toHaveLength(0);
  });

  it('listAll consulta la tabla base con columnas explícitas y orden estable', async () => {
    const fake = fakeClient(queue([{ data: [SERVER_ROW], error: null }]));
    const result = await configure(fake.client).listAll();

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toMatchObject({
      table: 'zonas',
      operation: 'select',
      columns: [ZONES_ADMIN_COLUMNS],
      order: ['id', { ascending: true }],
    });
    expect(result).toEqual([VALID_CONFIG]);
    expect(JSON.stringify(result)).not.toContain('secreto-no-debe-filtrarse');
  });

  it('listAll rechaza una respuesta malformada sin datos parciales', async () => {
    const fake = fakeClient(queue([{ data: [{ id: 'incompleta' }], error: null }]));

    await expect(configure(fake.client).listAll()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('create valida antes de abrir la sesión o enviar datos', async () => {
    const fake = fakeClient(queue([]));

    await expect(configure(fake.client).create({ ...VALID_CONFIG, capacidad: 0 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(fake.getSession).not.toHaveBeenCalled();
    expect(fake.calls).toHaveLength(0);
  });

  it('create comprueba duplicados y geometría segura antes de insertar', async () => {
    const fake = fakeClient(
      queue([
        { data: [], error: null },
        { data: [], error: null },
        { data: SERVER_ROW, error: null },
      ]),
    );
    const result = await configure(fake.client).create({ ...VALID_CONFIG, segura: true });

    expect(fake.calls).toHaveLength(3);
    expect(fake.calls[0]).toMatchObject({ operation: 'select', filters: [{ column: 'id', value: 'sala-nueva' }] });
    expect(fake.calls[1]).toMatchObject({ operation: 'select', filters: [{ column: 'segura', value: true }] });
    expect(fake.calls[2]).toMatchObject({ table: 'zonas', operation: 'insert', single: true });
    expect(Object.keys(fake.calls[2]?.payload ?? {}).sort()).toEqual(ZONES_ADMIN_COLUMNS.split(',').sort());
    expect(fake.calls[2]?.payload).not.toHaveProperty('creado_en');
    expect(fake.calls[2]?.payload).not.toHaveProperty('actualizado_en');
    expect(result.id).toBe(VALID_CONFIG.id);
    expect(JSON.stringify(result)).not.toContain('secreto-no-debe-filtrarse');
  });

  it('create rechaza un ID duplicado sin llegar al INSERT', async () => {
    const fake = fakeClient(queue([{ data: [{ id: 'sala-nueva' }], error: null }]));

    await expect(configure(fake.client).create(VALID_CONFIG)).rejects.toMatchObject({ code: 'DUPLICATE_ID' });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.operation).toBe('select');
  });

  it('create rechaza una segunda zona segura', async () => {
    const fake = fakeClient(
      queue([
        { data: [], error: null },
        { data: [{ id: 'zona-segura' }], error: null },
      ]),
    );

    await expect(configure(fake.client).create({ ...VALID_CONFIG, segura: true })).rejects.toMatchObject({
      code: 'SAFE_ZONE_CONFLICT',
    });
    expect(fake.calls).toHaveLength(2);
  });

  it.each([
    {
      name: 'unicidad',
      error: { code: '23505', message: 'duplicate key', details: 'Key (id)=(sala-nueva) already exists.' },
      code: 'DUPLICATE_ID',
    },
    {
      name: 'restricción de chequeo',
      error: { code: '23514', message: 'new row violates check constraint' },
      code: 'VALIDATION_FAILED',
    },
    {
      name: 'RLS',
      error: { code: '42501', message: 'permission denied for table zonas' },
      code: 'FORBIDDEN',
    },
  ])('create traduce el error de $name a un código seguro', async ({ error, code }) => {
    const fake = fakeClient(
      queue([
        { data: [], error: null },
        { data: null, error },
      ]),
    );

    await expect(configure(fake.client).create(VALID_CONFIG)).rejects.toMatchObject({ code });
    expect(
      JSON.stringify(ZONES_ADMIN_REPOSITORY_MESSAGES[code as keyof typeof ZONES_ADMIN_REPOSITORY_MESSAGES]),
    ).not.toContain('duplicate key');
  });

  it('update no envía el ID y exige que no cambie', async () => {
    const fake = fakeClient(queue([{ data: { ...SERVER_ROW, nombre: 'Renombrada' }, error: null }]));
    const result = await configure(fake.client).update(VALID_CONFIG.id, { ...VALID_CONFIG, nombre: 'Renombrada' });

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toMatchObject({ operation: 'update', single: true });
    expect(fake.calls[0]?.payload).not.toHaveProperty('id');
    expect(fake.calls[0]?.filters).toEqual([{ kind: 'eq', column: 'id', value: 'sala-nueva' }]);
    expect(result.nombre).toBe('Renombrada');
    expect(result.id).toBe(VALID_CONFIG.id);
  });

  it('update rechaza un ID distinto antes de enviar nada', async () => {
    const fake = fakeClient(queue([]));

    await expect(configure(fake.client).update('otra-zona', VALID_CONFIG)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(fake.calls).toHaveLength(0);
  });

  it('setActive solo envía la columna activo', async () => {
    const fake = fakeClient(queue([{ data: { ...SERVER_ROW, activo: false }, error: null }]));
    const result = await configure(fake.client).setActive(VALID_CONFIG.id, false);

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.payload).toEqual({ activo: false });
    expect(fake.calls[0]?.filters).toEqual([{ kind: 'eq', column: 'id', value: 'sala-nueva' }]);
    expect(result.activo).toBe(false);
  });

  it('setActive traduce una zona inexistente y un fallo de red', async () => {
    const missing = fakeClient(queue([{ data: null, error: { code: 'PGRST116', message: 'no rows returned' } }]));
    await expect(configure(missing.client).setActive(VALID_CONFIG.id, true)).rejects.toMatchObject({
      code: 'TARGET_NOT_FOUND',
    });

    const offline = fakeClient(queue([{ data: null, error: new TypeError('Failed to fetch') }]));
    await expect(configure(offline.client).setActive(VALID_CONFIG.id, true)).rejects.toMatchObject({ code: 'NETWORK' });
  });
});
