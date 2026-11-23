/**
 * SENA CROWD INTELLIGENCE — apoyo de entrada del formulario administrativo
 * de zonas (ZONAS.6).
 *
 * Convierte los campos textuales del formulario al modelo de dominio y reusa
 * los validadores de ZONAS.2. Ninguna función consulta la red.
 */

import {
  ZONE_ICON_PATTERN,
  type ZoneConfig,
  type ZoneId,
  type ZoneMapGeometry,
  type ZoneType,
} from './zone-config.types';
import { toZoneConfig, ZoneConfigError } from './zone-config.validators';

/** Columnas administrativas admitidas: nunca `creado_en` ni `actualizado_en`. */
export const ZONES_ADMIN_COLUMNS = [
  'id',
  'codigo',
  'nombre',
  'capacidad',
  'icono',
  'tipo',
  'segura',
  'activo',
  'publico',
  'map_x',
  'map_y',
  'ancho',
  'alto',
  'etiqueta_x',
  'etiqueta_y',
].join(',');

export const ZONES_ADMIN_TABLE = 'zonas';

export type ZoneTextField =
  | 'id'
  | 'codigo'
  | 'nombre'
  | 'capacidad'
  | 'icono'
  | 'tipo'
  | 'mapX'
  | 'mapY'
  | 'ancho'
  | 'alto'
  | 'etiquetaX'
  | 'etiquetaY';

export type ZoneBooleanField = 'segura' | 'activo' | 'publico';

/** Valores del formulario: los números se conservan como texto hasta validar. */
export interface ZoneAdminFormValue {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly capacidad: string;
  readonly icono: string;
  readonly tipo: string;
  readonly segura: boolean;
  readonly activo: boolean;
  readonly publico: boolean;
  readonly mapX: string;
  readonly mapY: string;
  readonly ancho: string;
  readonly alto: string;
  readonly etiquetaX: string;
  readonly etiquetaY: string;
}

export const EMPTY_ZONE_ADMIN_FORM: ZoneAdminFormValue = {
  id: '',
  codigo: '',
  nombre: '',
  capacidad: '',
  icono: '',
  tipo: 'punto-encuentro',
  segura: false,
  activo: true,
  publico: true,
  mapX: '',
  mapY: '',
  ancho: '',
  alto: '',
  etiquetaX: '',
  etiquetaY: '',
};

export const ZONE_ADMIN_ICON_SUGGESTIONS = [
  'cafe-outline',
  'book-outline',
  'walk-outline',
  'shield-checkmark-outline',
] as const;

function toGeometryNumber(value: string): number {
  return value.trim().length === 0 ? Number.NaN : Number(value);
}

/** Proyecta el formulario al modelo de dominio; la validación queda fuera. */
export function zoneAdminFormToConfig(form: ZoneAdminFormValue): ZoneConfig {
  const rawGeometry = [form.mapX, form.mapY, form.ancho, form.alto, form.etiquetaX, form.etiquetaY];
  const hasGeometry = rawGeometry.some((value) => value.trim().length > 0);

  const geometry: ZoneMapGeometry | null = hasGeometry
    ? {
        x: toGeometryNumber(form.mapX),
        y: toGeometryNumber(form.mapY),
        width: toGeometryNumber(form.ancho),
        height: toGeometryNumber(form.alto),
        labelX: toGeometryNumber(form.etiquetaX),
        labelY: toGeometryNumber(form.etiquetaY),
      }
    : null;

  return {
    id: form.id.trim(),
    codigo: form.codigo.trim(),
    nombre: form.nombre.trim(),
    capacidad: Number(form.capacidad),
    icono: form.icono.trim(),
    tipo: form.tipo as ZoneType,
    segura: form.segura,
    activo: form.activo,
    publico: form.publico,
    map: geometry,
  };
}

/** Proyecta una zona existente al formulario, conservando sus valores. */
export function zoneAdminFormFromConfig(config: ZoneConfig): ZoneAdminFormValue {
  return {
    id: config.id,
    codigo: config.codigo,
    nombre: config.nombre,
    capacidad: String(config.capacidad),
    icono: config.icono,
    tipo: config.tipo,
    segura: config.segura,
    activo: config.activo,
    publico: config.publico,
    mapX: config.map === null ? '' : String(config.map.x),
    mapY: config.map === null ? '' : String(config.map.y),
    ancho: config.map === null ? '' : String(config.map.width),
    alto: config.map === null ? '' : String(config.map.height),
    etiquetaX: config.map === null ? '' : String(config.map.labelX),
    etiquetaY: config.map === null ? '' : String(config.map.labelY),
  };
}

/**
 * Valida una zona antes de enviarla. En edición exige que el ID no cambie.
 * Reutiliza `toZoneConfig`, por lo que capacidad y coordenadas se validan con
 * las mismas reglas que la lectura remota.
 */
export function validateZoneAdminWrite(value: unknown, expectedId?: ZoneId): ZoneConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ZoneConfigError('INVALID_ROW');
  }

  // `toZoneConfig` valida columnas planas: se reconstruye la fila con las
  // columnas exactas de la tabla para reutilizar sus reglas sin duplicarlas.
  const config = toZoneConfig(zoneConfigToRow(value as ZoneConfig, true));

  if (expectedId !== undefined && config.id !== expectedId) {
    throw new ZoneConfigError('INVALID_ID');
  }

  return config;
}

/** Fila plana para INSERT/UPDATE. En edición se omite `id` para no reescribirlo. */
export function zoneConfigToRow(
  config: ZoneConfig,
  includeId: boolean,
): Record<string, string | number | boolean | null> {
  const row: Record<string, string | number | boolean | null> = {
    codigo: config.codigo,
    nombre: config.nombre,
    capacidad: config.capacidad,
    icono: config.icono,
    tipo: config.tipo,
    segura: config.segura,
    activo: config.activo,
    publico: config.publico,
    map_x: config.map?.x ?? null,
    map_y: config.map?.y ?? null,
    ancho: config.map?.width ?? null,
    alto: config.map?.height ?? null,
    etiqueta_x: config.map?.labelX ?? null,
    etiqueta_y: config.map?.labelY ?? null,
  };

  if (includeId) {
    row['id'] = config.id;
  }

  return row;
}

/** Comprueba que el icono sugerido por la UI sea un valor admitido. */
export function isSuggestedZoneIcon(value: string): boolean {
  return (ZONE_ADMIN_ICON_SUGGESTIONS as readonly string[]).includes(value) && ZONE_ICON_PATTERN.test(value);
}
