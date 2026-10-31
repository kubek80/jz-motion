import { generatedIcons } from './icons.generated';

/** An icon on a 24×24 grid. Paths are drawn in order. */
export interface IconDef {
  description: string;
  tags: string[];
  paths: string[];
  /** "logo": filled brand shapes, drawn as thin neon outlines. */
  style?: 'logo';
  /** Stroke width in grid units, for line art that needs a specific weight. */
  stroke?: number;
}

// Hand-drawn icons live in icons.custom.json and are merged in by `npm run icons`.
export const icons: Record<string, IconDef> = generatedIcons;

export const ICON_GRID = 24;
