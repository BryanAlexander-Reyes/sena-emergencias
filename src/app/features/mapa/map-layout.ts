/**
 * SENA CROWD INTELLIGENCE — geometría del plano de monitoreo (Fase 2.5).
 *
 * Solo define posiciones y etiquetas sobre el SVG. La ocupación, capacidad y
 * el estado provienen de `demo-monitoring.ts`, de modo que el plano no
 * duplica los datos compartidos con el Dashboard y la pantalla de Zonas.
 */

export interface MapZoneLayout {
  readonly zoneId: string;
  readonly overline: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly labelX: number;
  readonly labelY: number;
}

export const MAP_VIEWBOX = { width: 360, height: 480 } as const;

export const MAP_ZONE_LAYOUT: Readonly<Record<string, MapZoneLayout>> = {
  cafeteria: {
    zoneId: 'cafeteria',
    overline: 'Zona A',
    x: 28,
    y: 52,
    width: 144,
    height: 112,
    labelX: 100,
    labelY: 108,
  },
  biblioteca: {
    zoneId: 'biblioteca',
    overline: 'Zona B',
    x: 188,
    y: 52,
    width: 144,
    height: 112,
    labelX: 260,
    labelY: 108,
  },
  'pasillo-principal': {
    zoneId: 'pasillo-principal',
    overline: 'Zona C',
    x: 28,
    y: 200,
    width: 304,
    height: 96,
    labelX: 180,
    labelY: 238,
  },
  'zona-segura': {
    zoneId: 'zona-segura',
    overline: 'Zona segura',
    x: 88,
    y: 342,
    width: 184,
    height: 100,
    labelX: 180,
    labelY: 392,
  },
};
