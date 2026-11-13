// An arrow's line: from its start to its end, bent by `curve`, or through its knots (`via`): a smooth curve through
// them, or straight lines with rounded corners. Also where its heads aim from and where its label goes (halfway).
import type { Point } from './schema';

export interface ArrowPath {
  d: string;
  /** Where the end's head aims from (a point just before the end, along the line); the same for the start's. */
  endFrom: Point;
  startFrom: Point;
  /** Halfway along the line, and the line's direction there (a unit vector). */
  mid: Point;
  dir: Point;
}

const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Point) => Math.hypot(v.x, v.y);
const near = (a: Point, b: Point) => len(sub(a, b)) < 0.5;

/** Halfway along a line through `pts`, and its direction there. */
function halfway(pts: Point[]): { mid: Point; dir: Point } {
  const lengths = pts.slice(1).map((p, i) => len(sub(p, pts[i])));
  let left = lengths.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    const a = pts[i], b = pts[i + 1], l = lengths[i];
    if (left <= l || i === lengths.length - 1) {
      const k = l ? Math.min(1, left / l) : 0;
      return { mid: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, dir: l ? { x: (b.x - a.x) / l, y: (b.y - a.y) / l } : { x: 1, y: 0 } };
    }
    left -= l;
  }
  return { mid: pts[0], dir: { x: 1, y: 0 } };
}

const cubicAt = (p0: Point, c1: Point, c2: Point, p1: Point, t: number): Point => {
  const u = 1 - t;
  return { x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x, y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y };
};

export function arrowPath(start: Point, end: Point, opts: { curve?: number; via?: Point[]; bends?: 'smooth' | 'corners' } = {}): ArrowPath {
  const via = opts.via ?? [];
  if (!via.length) {
    // A quadratic bezier; `curve` bends it sideways.
    const dx = end.x - start.x, dy = end.y - start.y, c = opts.curve ?? 0;
    const control = { x: (start.x + end.x) / 2 + dy * c, y: (start.y + end.y) / 2 - dx * c };
    const mid = { x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x, y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y };
    const l = Math.hypot(dx, dy) || 1;
    return { d: `M${start.x} ${start.y}Q${control.x} ${control.y} ${end.x} ${end.y}`, endFrom: control, startFrom: control, mid, dir: { x: dx / l, y: dy / l } };
  }
  const pts = [start, ...via, end];
  if (opts.bends === 'corners') {
    // Straight lines, each corner rounded a little (never more than half of either line beside it).
    let d = `M${start.x} ${start.y}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], v = pts[i], b = pts[i + 1];
      const va = sub(a, v), vb = sub(b, v);
      const r = Math.min(28, len(va) / 2, len(vb) / 2);
      const p = len(va) ? { x: v.x + (va.x / len(va)) * r, y: v.y + (va.y / len(va)) * r } : v;
      const q = len(vb) ? { x: v.x + (vb.x / len(vb)) * r, y: v.y + (vb.y / len(vb)) * r } : v;
      d += `L${p.x} ${p.y}Q${v.x} ${v.y} ${q.x} ${q.y}`;
    }
    d += `L${end.x} ${end.y}`;
    return { d, endFrom: via[via.length - 1], startFrom: via[0], ...halfway(pts) };
  }
  // Smooth: a curve through every knot (Catmull-Rom, as cubic beziers).
  let d = `M${start.x} ${start.y}`;
  const samples: Point[] = [start];
  let firstC1 = end, lastC2 = start;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? pts[i + 1];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += `C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`;
    for (let k = 1; k <= 12; k++) samples.push(cubicAt(p1, c1, c2, p2, k / 12));
    if (i === 0) firstC1 = c1;
    lastC2 = c2;
  }
  return {
    d,
    endFrom: near(lastC2, end) ? pts[pts.length - 2] : lastC2,
    startFrom: near(firstC1, start) ? pts[1] : firstC1,
    ...halfway(samples),
  };
}
