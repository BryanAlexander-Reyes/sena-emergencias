/**
 * SENA CROWD INTELLIGENCE — contrato de configuración de zonas (ZONAS.2).
 *
 * Este modelo describe únicamente la CONFIGURACIÓN de una zona. No contiene
 * `people`, mediciones ni estado en vivo: la ocupación simulada sigue viviendo
 * en `MonitoringZone` / `MonitoringStateService`.
 *
 * Los identificadores son textuales y estables para conservar la compatibilidad
 * con las zonas ya existentes (`cafeteria`, `biblioteca`, `pasillo-principal`,
 * `zona-segura`) y con las claves de mapa, sensores, alertas e histórico.
 */

/** Identificador textual estable. Se valida con `ZONE_ID_PATTERN`. */
export type ZoneId = string;

export const ZONE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ZONE_ICON_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const ZONE_ID_MAX_LENGTH = 64;
export const ZONE_CODE_MAX_LENGTH = 32;
export const ZONE_NAME_MAX_LENGTH = 120;
export const ZONE_ICON_MAX_LENGTH = 64;

/** Identificadores históricos que deben seguir siendo válidos. */
export const LEGACY_ZONE_IDS = ['cafeteria', 'biblioteca', 'pasillo-principal', 'zona-segura'] as const;
export type LegacyZoneId = (typeof LEGACY_ZONE_IDS)[number];

export const ZONE_TYPES = ['cafeteria', 'biblioteca', 'pasillo', 'punto-encuentro'] as const;
export type ZoneType = (typeof ZONE_TYPES)[number];

/** Geometría opcional del plano SVG; `null` significa "sin forma asignada". */
export interface ZoneMapGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly labelX: number;
  readonly labelY: number;
}

/** Modelo de dominio: configuración pura, sin mediciones. */
export interface ZoneConfig {
  readonly id: ZoneId;
  readonly codigo: string;
  readonly nombre: string;
  readonly capacidad: number;
  readonly icono: string;
  readonly tipo: ZoneType;
  readonly segura: boolean;
  readonly activo: boolean;
  readonly publico: boolean;
  readonly map: ZoneMapGeometry | null;
}

/**
 * Forma plana prevista para la futura tabla `public.zonas`.
 *
 * Solo documenta el contrato de columnas; este microphase NO crea la tabla,
 * no ejecuta SQL y no conecta con Supabase. Las columnas de geometría son
 * opcionales y deben estar todas presentes o todas ausentes.
 */
export interface ZoneConfigRow {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly capacidad: number;
  readonly icono: string;
  readonly tipo: ZoneType;
  readonly segura: boolean;
  readonly activo: boolean;
  readonly publico: boolean;
  readonly map_x?: number | null;
  readonly map_y?: number | null;
  readonly ancho?: number | null;
  readonly alto?: number | null;
  readonly etiqueta_x?: number | null;
  readonly etiqueta_y?: number | null;
}
