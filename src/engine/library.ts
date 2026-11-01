import { generatedIcons } from './icons.generated';
import type { ColorName } from './palette';

/** A colour for clipart parts: a marker colour, or the board itself (for dark fills that hide what's behind). */
export type PartColor = ColorName | 'board';

/** One stroke of a clipart drawing, in its own colour. */
export interface ClipartPart {
  d: string;
  /** Stroke colour; without one the part takes the element's colour. */
  color?: PartColor;
  /** Line width in drawing units (default 2). */
  width?: number;
  /** Fills the shape after its outline is drawn. */
  fill?: PartColor;
  fillOpacity?: number;
  opacity?: number;
  /** SVG transform for this part, e.g. "skewX(-8)". */
  transform?: string;
}

/**
 * A drawing in the library. Icons are single-colour line art on a 24×24 grid (`paths`, drawn in order);
 * clipart has coloured `parts` on a `box`-sized grid.
 */
export interface IconDef {
  description: string;
  tags: string[];
  paths: string[];
  /** "logo": filled brand shapes, drawn as thin neon outlines. */
  style?: 'logo';
  /** Stroke width in grid units, for line art that needs a specific weight. */
  stroke?: number;
  parts?: ClipartPart[];
  /** Drawing size [width, height]; default 24×24. `size` on the board is the width. */
  box?: [number, number];
}

// Hand-drawn icons live in icons.custom.json and clipart in src/engine/clipart/, merged by `npm run icons`.
// Icons made in the app (saved in library/ by the local server) are added at runtime with addIcons.
export const icons: Record<string, IconDef> = { ...generatedIcons };

export const ICON_GRID = 24;

export function addIcons(more: Record<string, IconDef>) {
  Object.assign(icons, more);
}

/** Height of an icon drawn `size` wide. */
export function iconHeight(name: string, size: number): number {
  const box = icons[name]?.box;
  return box ? (size * box[1]) / box[0] : size;
}
