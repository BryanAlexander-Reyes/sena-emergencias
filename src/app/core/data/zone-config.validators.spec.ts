import { DEMO_ZONES } from './demo-monitoring';
import { LEGACY_ZONE_IDS, ZONE_TYPES, type ZoneMapGeometry } from './zone-config.types';
import {
  isLegacyZoneId,
  isZoneConfigRow,
  isZoneId,
  isZoneType,
  toZoneConfig,
  toZoneConfigList,
  ZoneConfigError,
  zoneConfigFromMonitoringZone,
  zoneConfigRowFromMonitoringZone,
  type ZoneConfigErrorCode,
} from './zone-config.validators';

const BASE_ROW = {
  id: 'cafeteria',
  codigo: 'A',
  nombre: 'Cafetería',
  capacidad: 50,
  icono: 'cafe-outline',
  tipo: 'cafeteria',
  segura: false,
  activo: true,
  publico: true,
} as const;

const FULL_MAP = {
  map_x: 28,
  map_y: 52,
  ancho: 144,
  alto: 112,
  etiqueta_x: 100,
  etiqueta_y: 108,
} as const;

const EXPECTED_CONFIG = {
  id: 'cafeteria',
  codigo: 'A',
  nombre: 'Cafetería',
  capacidad: 50,
  icono: 'cafe-outline',
  tipo: 'cafeteria',
  segura: false,
  activo: true,
  publico: true,
  map: null,
} as const;

function expectInvalid(value: unknown, code: ZoneConfigErrorCode): void {
  expect(isZoneConfigRow(value)).toBe(false);

  try {
    toZoneConfig(value);
    throw new Error('la fila debió ser rechazada');
  } catch (error) {
    expect(error).toBeInstanceOf(ZoneConfigError);
    expect((error as ZoneConfigError).code).toBe(code);
  }
}

describe('zone config — identificadores y tipos', () => {
  it('reconoce los cuatro identificadores históricos', () => {
    for (const id of LEGACY_ZONE_IDS) {
      expect(isZoneId(id)).toBe(true);
      expect(isLegacyZoneId(id)).toBe(true);
    }
  });

  it.each(['', 'Cafeteria', 'pasillo principal', '-cafeteria', 'cafeteria-', 'a'.repeat(65), 1, null])(
    'rechaza el identificador %j',
    (value) => {
      expect(isZoneId(value)).toBe(false);
      expect(isLegacyZoneId(value)).toBe(false);
    },
  );

  it('rechaza identificadores nuevos con mayúsculas o espacios', () => {
    expect(isZoneId('nueva_sala')).toBe(false);
    expect(isZoneId('nueva sala')).toBe(false);
    expect(isZoneId('sala-nueva')).toBe(true);
    expect(isLegacyZoneId('sala-nueva')).toBe(false);
  });

  it('acepta solo los tipos de zona declarados', () => {
    for (const tipo of ZONE_TYPES) {
      expect(isZoneType(tipo)).toBe(true);
    }

    for (const tipo of ['sala', '', undefined, 1, null]) {
      expect(isZoneType(tipo)).toBe(false);
    }
  });
});

describe('zone config — toZoneConfig', () => {
  it('acepta una fila mínima y devuelve solo el contrato de dominio', () => {
    const value = { ...BASE_ROW, people: 999, nota_interna: 'secreto', otro: true };

    expect(isZoneConfigRow(value)).toBe(true);
    expect(toZoneConfig(value)).toEqual(EXPECTED_CONFIG);
    expect(toZoneConfig(value)).not.toHaveProperty('people');
    expect(toZoneConfig(value)).not.toHaveProperty('nota_interna');
  });

  it.each([null, undefined, 'cafeteria', 1, [], true])('rechaza la fila %j', (value) => {
    expectInvalid(value, 'INVALID_ROW');
  });

  it.each([
    [{ ...BASE_ROW, id: '' }, 'INVALID_ID'],
    [{ ...BASE_ROW, id: 'Cafeteria' }, 'INVALID_ID'],
    [{ ...BASE_ROW, codigo: '   ' }, 'INVALID_CODIGO'],
    [{ ...BASE_ROW, nombre: '' }, 'INVALID_NOMBRE'],
    [{ ...BASE_ROW, capacidad: 0 }, 'INVALID_CAPACIDAD'],
    [{ ...BASE_ROW, capacidad: -5 }, 'INVALID_CAPACIDAD'],
    [{ ...BASE_ROW, capacidad: 12.5 }, 'INVALID_CAPACIDAD'],
    [{ ...BASE_ROW, capacidad: '50' }, 'INVALID_CAPACIDAD'],
    [{ ...BASE_ROW, icono: 'Icono Con Espacios' }, 'INVALID_ICONO'],
    [{ ...BASE_ROW, icono: '' }, 'INVALID_ICONO'],
    [{ ...BASE_ROW, tipo: 'sala' }, 'INVALID_TIPO'],
    [{ ...BASE_ROW, segura: 'true' }, 'INVALID_SEGURA'],
    [{ ...BASE_ROW, activo: 1 }, 'INVALID_ACTIVO'],
    [{ ...BASE_ROW, publico: undefined }, 'INVALID_PUBLICO'],
  ])('rechaza la fila inválida %j con %s', (row, code) => {
    expectInvalid(row, code as ZoneConfigErrorCode);
  });

  it('acepta una fila desactivada y no pública', () => {
    expect(toZoneConfig({ ...BASE_ROW, activo: false, publico: false })).toEqual({
      ...EXPECTED_CONFIG,
      activo: false,
      publico: false,
    });
  });

  it('acepta una zona segura', () => {
    expect(toZoneConfig({ ...BASE_ROW, segura: true })).toEqual({ ...EXPECTED_CONFIG, segura: true });
  });

  it('acepta geometría ausente o explícitamente nula', () => {
    expect(toZoneConfig(BASE_ROW).map).toBeNull();
    expect(toZoneConfig({ ...BASE_ROW, map_x: null, map_y: null, ancho: null, alto: null }).map).toBeNull();
  });

  it('convierte la geometría plana en el modelo anidado', () => {
    expect(toZoneConfig({ ...BASE_ROW, ...FULL_MAP }).map).toEqual({
      x: 28,
      y: 52,
      width: 144,
      height: 112,
      labelX: 100,
      labelY: 108,
    });
  });

  it.each([
    [{ ...FULL_MAP, ancho: undefined }],
    [{ ...FULL_MAP, etiqueta_y: null }],
    [{ ...FULL_MAP, alto: 0 }],
    [{ ...FULL_MAP, ancho: -10 }],
    [{ ...FULL_MAP, map_x: -1 }],
    [{ ...FULL_MAP, etiqueta_x: '100' }],
  ])('rechaza geometría incompleta o inválida %j', (map) => {
    expectInvalid({ ...BASE_ROW, ...map }, 'INVALID_MAP');
  });
});

describe('zone config — toZoneConfigList', () => {
  it('valida una lista de filas', () => {
    const zones = toZoneConfigList([
      BASE_ROW,
      {
        ...BASE_ROW,
        id: 'biblioteca',
        codigo: 'B',
        nombre: 'Biblioteca',
        capacidad: 60,
        icono: 'book-outline',
        tipo: 'biblioteca',
      },
    ]);

    expect(zones.map((zone) => zone.id)).toEqual(['cafeteria', 'biblioteca']);
  });

  it('rechaza un valor que no es lista', () => {
    expect(() => toZoneConfigList({ zonas: [BASE_ROW] })).toThrowError(ZoneConfigError);
  });

  it('no devuelve datos parciales si una fila es inválida', () => {
    expect(() => toZoneConfigList([BASE_ROW, { ...BASE_ROW, capacidad: 0 }])).toThrowError(ZoneConfigError);
  });

  it('rechaza identificadores repetidos', () => {
    expect(() => toZoneConfigList([BASE_ROW, { ...BASE_ROW, codigo: 'A2' }])).toThrowError(ZoneConfigError);
  });

  it('rechaza más de una zona segura', () => {
    expect(() =>
      toZoneConfigList([
        { ...BASE_ROW, segura: true },
        { ...BASE_ROW, id: 'biblioteca', segura: true },
      ]),
    ).toThrowError(ZoneConfigError);
  });

  it('acepta una sola zona segura o ninguna', () => {
    expect(() => toZoneConfigList([BASE_ROW])).not.toThrow();
    expect(() =>
      toZoneConfigList([
        { ...BASE_ROW, segura: true },
        { ...BASE_ROW, id: 'biblioteca', segura: false },
      ]),
    ).not.toThrow();
  });
});

describe('zone config — compatibilidad con datos simulados', () => {
  it('proyecta la fila plana sin arrastrar mediciones', () => {
    const row = zoneConfigRowFromMonitoringZone(DEMO_ZONES[0]);

    expect(row).toEqual({
      id: 'cafeteria',
      codigo: 'A',
      nombre: 'Cafetería',
      capacidad: 50,
      icono: 'cafe-outline',
      tipo: 'cafeteria',
      segura: false,
      activo: true,
      publico: true,
      map_x: null,
      map_y: null,
      ancho: null,
      alto: null,
      etiqueta_x: null,
      etiqueta_y: null,
    });
    expect(row).not.toHaveProperty('people');
  });

  it('adapta las cuatro zonas existentes a configuración válida', () => {
    for (const zone of DEMO_ZONES) {
      const config = zoneConfigFromMonitoringZone(zone);

      expect(config.id).toBe(zone.id);
      expect(config.tipo).toBe(zone.type);
      expect(config).not.toHaveProperty('people');
      expect(config.activo).toBe(true);
      expect(config.publico).toBe(true);
      expect(config.map).toBeNull();
    }

    expect(zoneConfigFromMonitoringZone(DEMO_ZONES[3]).segura).toBe(true);
  });

  it('respeta la geometría facilitada al adaptar una zona', () => {
    const map: ZoneMapGeometry = { x: 1, y: 2, width: 3, height: 4, labelX: 5, labelY: 6 };

    expect(zoneConfigFromMonitoringZone(DEMO_ZONES[0], map).map).toEqual(map);
  });
});
