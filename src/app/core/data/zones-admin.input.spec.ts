import type { ZoneConfig } from './zone-config.types';
import { ZoneConfigError } from './zone-config.validators';
import {
  EMPTY_ZONE_ADMIN_FORM,
  zoneAdminFormFromConfig,
  zoneAdminFormToConfig,
  validateZoneAdminWrite,
  zoneConfigToRow,
  ZONES_ADMIN_COLUMNS,
  type ZoneAdminFormValue,
} from './zones-admin.input';

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

function validForm(overrides: Partial<ZoneAdminFormValue> = {}): ZoneAdminFormValue {
  return { ...zoneAdminFormFromConfig(VALID_CONFIG), ...overrides };
}

describe('ZONAS.6 — validación de entrada administrativa', () => {
  it('convierte el formulario válido al modelo de dominio, incluida la geometría', () => {
    const form = validForm();

    expect(zoneAdminFormToConfig(form)).toEqual(VALID_CONFIG);
    expect(zoneAdminFormFromConfig(zoneAdminFormToConfig(form))).toEqual(form);
  });

  it('admite formularios sin geometría', () => {
    const form = validForm({ mapX: '', mapY: '', ancho: '', alto: '', etiquetaX: '', etiquetaY: '' });

    expect(zoneAdminFormToConfig(form).map).toBeNull();
  });

  it.each([
    { field: 'capacidad' as const, value: '0', code: 'INVALID_CAPACIDAD' },
    { field: 'capacidad' as const, value: '-5', code: 'INVALID_CAPACIDAD' },
    { field: 'capacidad' as const, value: 'muchos', code: 'INVALID_CAPACIDAD' },
    { field: 'id' as const, value: 'ID Con Espacios', code: 'INVALID_ID' },
    { field: 'icono' as const, value: 'Icono@', code: 'INVALID_ICONO' },
    { field: 'nombre' as const, value: '   ', code: 'INVALID_NOMBRE' },
    { field: 'tipo' as const, value: 'desconocido', code: 'INVALID_TIPO' },
  ])('rechaza $field inválido con $code', ({ field, value, code }) => {
    const form = zoneAdminFormToConfig(validForm({ [field]: value } as Partial<ZoneAdminFormValue>));

    expect(() => requireValidated(form)).toThrowError(expect.objectContaining({ code }));
  });

  it('rechaza geometría parcial', () => {
    const form = zoneAdminFormToConfig(validForm({ mapY: '' }));

    expect(() => requireValidated(form)).toThrowError(expect.objectContaining({ code: 'INVALID_MAP' }));
  });

  it.each([
    { name: 'coordenada negativa', values: { mapX: '-1' } },
    { name: 'ancho cero', values: { ancho: '0' } },
    { name: 'alto negativo', values: { alto: '-20' } },
    { name: 'etiqueta no numérica', values: { etiquetaY: 'abc' } },
  ])('rechaza $name', ({ values }) => {
    const form = zoneAdminFormToConfig(validForm(values));

    expect(() => requireValidated(form)).toThrowError(expect.objectContaining({ code: 'INVALID_MAP' }));
  });

  it('impide cambiar el identificador al editar', () => {
    const form = zoneAdminFormToConfig(validForm({ id: 'otro-id' }));

    expect(() => requireValidated(form, VALID_CONFIG.id)).toThrowError(expect.objectContaining({ code: 'INVALID_ID' }));
  });

  it('acepta editar sin tocar el identificador', () => {
    const form = zoneAdminFormToConfig(validForm({ nombre: 'Sala renombrada' }));

    expect(requireValidated(form, VALID_CONFIG.id).nombre).toBe('Sala renombrada');
  });

  it('genera una fila con las columnas exactas y sin id en edición', () => {
    const insert = zoneConfigToRow(VALID_CONFIG, true);
    const update = zoneConfigToRow(VALID_CONFIG, false);

    expect(Object.keys(insert).sort()).toEqual(ZONES_ADMIN_COLUMNS.split(',').sort());
    expect(Object.keys(update).sort()).toEqual(
      ZONES_ADMIN_COLUMNS.split(',')
        .filter((c) => c !== 'id')
        .sort(),
    );
    expect(insert).not.toHaveProperty('creado_en');
    expect(insert).not.toHaveProperty('actualizado_en');
    expect(update).not.toHaveProperty('id');
    expect(insert['map_x']).toBe(12);
    expect(insert['etiqueta_y']).toBe(64);
  });

  it('el formulario vacío no es válido', () => {
    expect(() => requireValidated(zoneAdminFormToConfig(EMPTY_ZONE_ADMIN_FORM))).toThrowError(ZoneConfigError);
  });
});

function requireValidated(value: unknown, expectedId?: string): ZoneConfig {
  return validateZoneAdminWrite(value, expectedId);
}
