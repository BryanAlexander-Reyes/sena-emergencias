import { TestBed } from '@angular/core/testing';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SupabaseService } from '../supabase.service';

import { SupabaseZonesRepository, ZONES_PUBLIC_COLUMNS, ZONES_PUBLIC_SOURCE } from './supabase-zones.repository';
import type { ZoneConfig } from './zone-config.types';
import type { ZonesRepository } from './zones-repository.contract';
import {
  ZONES_REPOSITORY_MESSAGES,
  ZonesRepositoryError,
  type ZonesRepositoryErrorCode,
} from './zones-repository.errors';

const SENSITIVE = 'detalle-interno-no-debe-filtrarse';

const SERVER_ROW = {
  id: 'cafeteria',
  codigo: 'A',
  nombre: 'Cafetería',
  capacidad: 50,
  icono: 'cafe-outline',
  tipo: 'cafeteria',
  segura: false,
  activo: true,
  publico: true,
  map_x: 28,
  map_y: 52,
  ancho: 144,
  alto: 112,
  etiqueta_x: 100,
  etiqueta_y: 108,
  interno: SENSITIVE,
} as const;

const EXPECTED_CONFIG: ZoneConfig = {
  id: 'cafeteria',
  codigo: 'A',
  nombre: 'Cafetería',
  capacidad: 50,
  icono: 'cafe-outline',
  tipo: 'cafeteria',
  segura: false,
  activo: true,
  publico: true,
  map: { x: 28, y: 52, width: 144, height: 112, labelX: 100, labelY: 108 },
};

interface FakeClient {
  client: SupabaseClient;
  from: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  firstEq: ReturnType<typeof vi.fn>;
  secondEq: ReturnType<typeof vi.fn>;
}

function fakeClient(response: { data: unknown; error: unknown } | (() => never)): FakeClient {
  const secondEq = vi.fn(() => (typeof response === 'function' ? response() : Promise.resolve(response)));
  const firstEq = vi.fn(() => ({ eq: secondEq }));
  const select = vi.fn(() => ({ eq: firstEq }));
  const from = vi.fn(() => ({ select }));
  const client = { from } as unknown as SupabaseClient;

  return { client, from, select, firstEq, secondEq };
}

function configure(client: SupabaseClient | null): SupabaseZonesRepository {
  TestBed.configureTestingModule({
    providers: [SupabaseZonesRepository, { provide: SupabaseService, useValue: { client } }],
  });

  return TestBed.inject(SupabaseZonesRepository);
}

describe('SupabaseZonesRepository — solo lectura', () => {
  it('consulta columnas explícitas de la fuente pública sin operaciones de escritura', async () => {
    const fake = fakeClient({ data: [SERVER_ROW], error: null });
    const repository: ZonesRepository = configure(fake.client);

    const result = await repository.list();

    expect(fake.from).toHaveBeenCalledTimes(1);
    expect(fake.from).toHaveBeenCalledWith(ZONES_PUBLIC_SOURCE);
    expect(fake.select).toHaveBeenCalledTimes(1);
    expect(fake.select).toHaveBeenCalledWith(ZONES_PUBLIC_COLUMNS);
    expect(fake.firstEq).toHaveBeenCalledWith('publico', true);
    expect(fake.secondEq).toHaveBeenCalledWith('activo', true);
    expect(Object.keys(fake.client)).toEqual(['from']);
    expect(result).toEqual([EXPECTED_CONFIG]);
  });

  it('valida y copia solo las columnas del contrato, sin campos internos', async () => {
    const fake = fakeClient({ data: [SERVER_ROW], error: null });
    const result = await configure(fake.client).list();

    expect(Object.keys(result[0] ?? {})).toEqual([
      'id',
      'codigo',
      'nombre',
      'capacidad',
      'icono',
      'tipo',
      'segura',
      'activo',
      'publico',
      'map',
    ]);
    expect(JSON.stringify(result)).not.toContain(SENSITIVE);
    expect(JSON.stringify(result)).not.toContain('interno');
  });

  it('devuelve una lista vacía sin error', async () => {
    const fake = fakeClient({ data: [], error: null });

    await expect(configure(fake.client).list()).resolves.toEqual([]);
  });

  it('falla de forma segura si el cliente Supabase no está configurado', async () => {
    const repository = configure(null);

    await expect(repository.list()).rejects.toMatchObject({
      name: 'ZonesRepositoryError',
      code: 'NOT_CONFIGURED',
      message: ZONES_REPOSITORY_MESSAGES.NOT_CONFIGURED,
    });
  });

  it.each([
    { error: { code: '42P01', message: `relation ${SENSITIVE} does not exist` }, code: 'TABLE_UNAVAILABLE' },
    { error: { code: 'PGRST205', message: 'table not in schema cache' }, code: 'TABLE_UNAVAILABLE' },
    { error: { code: '42501', message: `permission denied ${SENSITIVE}` }, code: 'FORBIDDEN' },
    { error: { code: '401', message: 'jwt inválido' }, code: 'FORBIDDEN' },
    { error: { message: 'Failed to fetch' }, code: 'NETWORK' },
    { error: { code: 'XX000', message: SENSITIVE }, code: 'QUERY_FAILED' },
  ])('traduce el error $error a $code sin filtrar su contenido', async ({ error, code }) => {
    const fake = fakeClient({ data: null, error });
    const failure = await configure(fake.client)
      .list()
      .catch((caught: unknown) => caught);

    expect(failure).toMatchObject({
      code,
      message: ZONES_REPOSITORY_MESSAGES[code as ZonesRepositoryErrorCode],
    });
    expect((failure as Error).message).not.toContain(SENSITIVE);
  });

  it('traduce una excepción de red lanzada por el cliente', async () => {
    const fake = fakeClient(() => {
      throw new TypeError('Failed to fetch');
    });

    await expect(configure(fake.client).list()).rejects.toMatchObject({
      code: 'NETWORK',
      message: ZONES_REPOSITORY_MESSAGES.NETWORK,
    });
  });

  it.each([null, undefined, {}, SERVER_ROW, { zonas: [SERVER_ROW] }, [{ ...SERVER_ROW, capacidad: 0 }]])(
    'rechaza sin datos parciales la respuesta inválida %j',
    async (data) => {
      const fake = fakeClient({ data, error: null });

      await expect(configure(fake.client).list()).rejects.toMatchObject({
        name: 'ZonesRepositoryError',
        code: 'INVALID_RESPONSE',
        message: ZONES_REPOSITORY_MESSAGES.INVALID_RESPONSE,
      });
    },
  );

  it('respeta un error tipado previo sin volver a traducirlo', async () => {
    const fake = fakeClient(() => {
      throw new ZonesRepositoryError('FORBIDDEN');
    });

    await expect(configure(fake.client).list()).rejects.toBeInstanceOf(ZonesRepositoryError);
  });
});
