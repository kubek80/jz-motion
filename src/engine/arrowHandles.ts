// Editing an arrow on the board: its handles (the two ends, each knot, and a "+" halfway between two points to add
// a knot), and while one is dragged, the line as it will be and the places an end can attach to. Drawn in the
// editor's overlay, sized in screen pixels (`k`: board units per pixel). The editor decides what a drag changes
// (src/app/editor/useArrowDrag.ts).
import { arrowPath } from './arrowPath';
import { svgEl } from './dom';
import type { Point } from './schema';

export type ArrowHandle = { kind: 'start' | 'end' } | { kind: 'knot'; index: number } | { kind: 'add'; index: number };
export interface ArrowGeometry { start: Point; end: Point; via: Point[]; curve: number; bends: 'smooth' | 'corners' }

const CYAN = '#3ef0ff';

/** Where each handle is: the ends, the knots, and a "+" halfway between each two neighbouring points. */
export function handleSpots(g: ArrowGeometry): { handle: ArrowHandle; x: number; y: number }[] {
  const pts = [g.start, ...g.via, g.end];
  return [
    { handle: { kind: 'start' }, ...g.start },
    { handle: { kind: 'end' }, ...g.end },
    ...g.via.map((p, index) => ({ handle: { kind: 'knot', index } as ArrowHandle, ...p })),
    // Between two points: on a straight line between them (near enough to the line to find).
    ...pts.slice(1).map((p, i) => ({ handle: { kind: 'add', index: i } as ArrowHandle, x: (pts[i].x + p.x) / 2, y: (pts[i].y + p.y) / 2 })),
  ];
}

/**
 * Draws the handles, and while dragging: the line as it will be (dashed) and `spots`, where the dragged end can
 * attach (the nearest one, `hot`, larger).
 */
export function drawArrowHandles(overlay: SVGGElement, k: number, g: ArrowGeometry, drag?: { spots: Point[]; hot?: Point }) {
  if (drag) {
    svgEl('path', { d: arrowPath(g.start, g.end, { curve: g.curve, via: g.via, bends: g.bends }).d, fill: 'none', stroke: CYAN, 'stroke-width': 2.5 * k, 'stroke-dasharray': `${8 * k} ${6 * k}`, opacity: 0.9 }, overlay);
    for (const s of drag.spots) {
      const hot = drag.hot && Math.abs(drag.hot.x - s.x) < 0.5 && Math.abs(drag.hot.y - s.y) < 0.5;
      svgEl('circle', { cx: s.x, cy: s.y, r: (hot ? 9 : 5) * k, fill: hot ? CYAN : '#0d1114', stroke: CYAN, 'stroke-width': 2 * k, opacity: hot ? 1 : 0.8 }, overlay);
    }
  }
  for (const { handle, x, y } of handleSpots(g)) {
    if (handle.kind === 'add') {
      if (drag) continue;
      const r = 7 * k;
      svgEl('circle', { cx: x, cy: y, r, fill: '#0d1114', stroke: CYAN, 'stroke-width': 1.5 * k, opacity: 0.55 }, overlay);
      svgEl('path', { d: `M${x - r * 0.5} ${y}H${x + r * 0.5}M${x} ${y - r * 0.5}V${y + r * 0.5}`, stroke: CYAN, 'stroke-width': 1.5 * k, opacity: 0.8 }, overlay);
    } else if (handle.kind === 'knot') {
      svgEl('circle', { cx: x, cy: y, r: 8 * k, fill: '#0d1114', stroke: '#fff', 'stroke-width': 2.5 * k }, overlay);
    } else {
      svgEl('circle', { cx: x, cy: y, r: 9 * k, fill: CYAN, stroke: '#0d1114', 'stroke-width': 2 * k }, overlay);
    }
  }
}

/** The handle under a board point, ends and knots before "+" ones. */
export function handleAt(g: ArrowGeometry, k: number, p: Point): ArrowHandle | undefined {
  const r = 13 * k;
  const hits = handleSpots(g).filter((h) => Math.hypot(h.x - p.x, h.y - p.y) <= r);
  return (hits.find((h) => h.handle.kind !== 'add') ?? hits[0])?.handle;
}
