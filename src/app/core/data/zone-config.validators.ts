/**
 * SENA CROWD INTELLIGENCE — validadores y mappers de configuración de zonas.
 *
 * Preparación para futuras respuestas de Supabase. Ninguna función consulta la
 * red: todas trabajan sobre `unknown` y copian campo por campo solo las columnas
 * declaradas en `ZoneConfigRow`, de modo que columnas adicionales del servidor
 * nunca lleguen al modelo de dominio.
 */

import type { MonitoringZone } from './demo-monitoring';
import {
  LEGACY_ZONE_IDS,
  ZONE_CODE_MAX_LENGTH,
  ZONE_ICON_MAX_LENGTH,
  ZONE_ICON_PATTERN,
  ZONE_ID_MAX_LENGTH,
  ZONE_ID_PATTERN,
  ZONE_NAME_MAX_LENGTH,
  ZONE_TYPES,
  type LegacyZoneId,
  type ZoneConfig,
  type ZoneConfigRow,
  type ZoneId,
  type ZoneMapGeometry,
  type ZoneType,
} from './zone-config.types';

export type ZoneConfigErrorCode =
  | 'INVALID_ROW'
  | 'INVALID_ID'
  | 'INVALID_CODIGO'
  | 'INVALID_NOMBRE'
  | 'INVALID_CAPACIDAD'
  | 'INVALID_ICONO'
  | 'INVALID_TIPO'
  | 'INVALID_SEGURA'
  | 'INVALID_ACTIVO'
  | 'INVALID_PUBLICO'
  | 'INVALID_MAP'
  | 'INVALID_LIST'
  | 'DUPLICATE_ID'
  | 'MULTIPLE_SAFE_ZONES';

export const ZONE_CONFIG_ERROR_MESSAGES: Readonly<Record<ZoneConfigErrorCode, string>> = {
  INVALID_ROW: 'La fila de zona no tiene un formato válido.',
  INVALID_ID: 'El identificador de la zona no es válido.',
  INVALID_CODIGO: 'El código de la zona no es válido.',
  INVALID_NOMBRE: 'El nombre de la zona no es válido.',
  INVALID_CAPACIDAD: 'La capacidad de la zona debe ser un entero positivo.',
  INVALID_ICONO: 'El icono de la zona no es válido.',
  INVALID_TIPO: 'El tipo de zona no es reconocido.',
  INVALID_SEGURA: 'El indicador de zona segura debe ser booleano.',
  INVALID_ACTIVO: 'El estado activo de la zona debe ser booleano.',
  INVALID_PUBLICO: 'La visibilidad pública de la zona debe ser booleana.',
  INVALID_MAP: 'La geometría del mapa debe estar completa o ausente.',
  INVALID_LIST: 'El listado de zonas no tiene un formato válido.',
  DUPLICATE_ID: 'El listado de zonas contiene identificadores repetidos.',
  MULTIPLE_SAFE_ZONES: 'El listado de zonas define más de una zona segura.',
};

export class ZoneConfigError extends Error {
  constructor(readonly code: ZoneConfigErrorCode) {
    super(ZONE_CONFIG_ERROR_MESSAGES[code]);
    this.name = 'ZoneConfigError';
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function requireText(value: unknown, code: ZoneConfigErrorCode, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new ZoneConfigError(code);
  }

  return value;
}

function requireBoolean(value: unknown, code: ZoneConfigErrorCode): boolean {
  if (typeof value !== 'boolean') {
    throw new ZoneConfigError(code);
  }

  return value;
}

function readGeometry(row: Record<string, unknown>): ZoneMapGeometry | null {
  const raw = [row['map_x'], row['map_y'], row['ancho'], row['alto'], row['etiqueta_x'], row['etiqueta_y']];
  const present = raw.filter((value) => value !== undefined && value !== null);

  if (present.length === 0) {
    return null;
  }

  if (present.length !== raw.length || !present.every(isFiniteNumber)) {
    throw new ZoneConfigError('INVALID_MAP');
  }

  const [x, y, width, height, labelX, labelY] = present as number[];
  if (x < 0 || y < 0 || width <= 0 || height <= 0) {
    throw new ZoneConfigError('INVALID_MAP');
  }

  return { x, y, width, height, labelX, labelY };
}

/** Valida el identificador textual sin depender de la lista histórica. */
export function isZoneId(value: unknown): value is ZoneId {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= ZONE_ID_MAX_LENGTH && ZONE_ID_PATTERN.test(value)
  );
}

/** Comprueba que el identificador pertenece a las cuatro zonas originales. */
export function isLegacyZoneId(value: unknown): value is LegacyZoneId {
  return typeof value === 'string' && (LEGACY_ZONE_IDS as readonly string[]).includes(value);
}

export function isZoneType(value: unknown): value is ZoneType {
  return typeof value === 'string' && (ZONE_TYPES as readonly string[]).includes(value);
}

function requireZoneId(value: unknown): ZoneId {
  if (!isZoneId(value)) {
    throw new ZoneConfigError('INVALID_ID');
  }

  return value;
}

function requireIcon(value: unknown): string {
  const icono = requireText(value, 'INVALID_ICONO', ZONE_ICON_MAX_LENGTH);

  if (!ZONE_ICON_PATTERN.test(icono)) {
    throw new ZoneConfigError('INVALID_ICONO');
  }

  return icono;
}

/**
 * Convierte una fila plana en configuración de dominio. Lanza `ZoneConfigError`
 * ante el primer campo inválido; nunca devuelve datos parciales.
 */
export function toZoneConfig(value: unknown): ZoneConfig {
  const row = asRecord(value);
  if (row === null) {
    throw new ZoneConfigError('INVALID_ROW');
  }

  const capacidad = row['capacidad'];
  if (!isFiniteNumber(capacidad) || !Number.isInteger(capacidad) || capacidad <= 0) {
    throw new ZoneConfigError('INVALID_CAPACIDAD');
  }

  const tipo = row['tipo'];
  if (!isZoneType(tipo)) {
    throw new ZoneConfigError('INVALID_TIPO');
  }

  return {
    id: requireZoneId(row['id']),
    codigo: requireText(row['codigo'], 'INVALID_CODIGO', ZONE_CODE_MAX_LENGTH),
    nombre: requireText(row['nombre'], 'INVALID_NOMBRE', ZONE_NAME_MAX_LENGTH),
    capacidad,
    icono: requireIcon(row['icono']),
    tipo,
    segura: requireBoolean(row['segura'], 'INVALID_SEGURA'),
    activo: requireBoolean(row['activo'], 'INVALID_ACTIVO'),
    publico: requireBoolean(row['publico'], 'INVALID_PUBLICO'),
    map: readGeometry(row),
  };
}

/**
 * Comprueba sin lanzar que un valor es una fila aceptable por `toZoneConfig`.
 * El tipo devuelto es la fila plana, no el modelo de dominio: el mapper es quien
 * transforma `ZoneConfigRow` en `ZoneConfig`.
 */
export function isZoneConfigRow(value: unknown): value is ZoneConfigRow {
  try {
    toZoneConfig(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Valida un listado completo antes de devolverlo. Una sola fila inválida,
 * un id repetido o dos zonas seguras hacen fallar toda la respuesta.
 */
export function toZoneConfigList(value: unknown): readonly ZoneConfig[] {
  if (!Array.isArray(value)) {
    throw new ZoneConfigError('INVALID_LIST');
  }

  const zones: ZoneConfig[] = [];
  const ids = new Set<string>();
  let safeCount = 0;

  for (const row of value) {
    const zone = toZoneConfig(row);

    if (ids.has(zone.id)) {
      throw new ZoneConfigError('DUPLICATE_ID');
    }
    if (zone.segura) {
      safeCount += 1;
    }

    ids.add(zone.id);
    zones.push(zone);
  }

  if (safeCount > 1) {
    throw new ZoneConfigError('MULTIPLE_SAFE_ZONES');
  }

  return zones;
}

/** Proyección de una zona simulada a la forma plana de la futura tabla. */
export function zoneConfigRowFromMonitoringZone(
  zone: MonitoringZone,
  map: ZoneMapGeometry | null = null,
): ZoneConfigRow {
  return {
    id: zone.id,
    codigo: zone.code,
    nombre: zone.name,
    capacidad: zone.capacity,
    icono: zone.icon,
    tipo: zone.type,
    segura: zone.safe === true,
    activo: true,
    publico: true,
    map_x: map?.x ?? null,
    map_y: map?.y ?? null,
    ancho: map?.width ?? null,
    alto: map?.height ?? null,
    etiqueta_x: map?.labelX ?? null,
    etiqueta_y: map?.labelY ?? null,
  };
}

/**
 * Adaptador de compatibilidad: convierte el dato simulado actual en
 * configuración validada, sin arrastrar `people` ni ninguna medición.
 */
export function zoneConfigFromMonitoringZone(zone: MonitoringZone, map: ZoneMapGeometry | null = null): ZoneConfig {
  return toZoneConfig(zoneConfigRowFromMonitoringZone(zone, map));
}
