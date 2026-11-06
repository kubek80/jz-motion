// Small shared constants and formatting for the Timing window: scene colours of the clicks,
// the m:ss.s clock format and the spacing of the ruler's labels.
import { palette } from '../../engine/palette';

export const SCENE_COLORS = [palette.cyan, palette.pink, palette.yellow, palette.green, palette.orange, palette.white];
export const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

/** Seconds between ruler labels, so they stay about 80 px apart. */
export function rulerStep(pps: number) {
  for (const s of [0.5, 1, 2, 5, 10, 15, 30, 60, 120]) if (s * (pps || 20) >= 80) return s;
  return 300;
}
