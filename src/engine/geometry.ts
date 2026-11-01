import type { CompiledElement as Element } from './compile';
import { projectIso, resolveIsoParts } from './iso';
import { iconHeight } from './library';
import { board, type TextStyle } from './palette';
import type { AnchorName, ArrowElement, Camera, Point, Ref } from './schema';

export const VIEW = { width: 1920, height: 1080 } as const;
export const DEFAULT_CAMERA: Camera = { x: VIEW.width / 2, y: VIEW.height / 2, zoom: 1 };

export interface Box { x: number; y: number; width: number; height: number }

/** Approximate width of handwritten text. Used for layout and framing; the renderer measures the real text. */
export const textWidth = (text: string, size: number, style: TextStyle = 'marker') =>
  Math.max(...text.split('\n').map((l) => l.length)) * size * board.fonts[style].charWidth;
/** Height of a text of `lines` lines. */
export const textHeight = (text: string, size: number) => size * (1 + (text.split('\n').length - 1) * board.lineHeight);

export const iconLabelSize = (size: number) => Math.max(34, size * 0.34);
export const ARROW_GAP = 16;
export const ISO_LABEL_SIZE = 44;

/** The element's main shape (icon square, box, text line). Arrows attach to it. */
export function shapeBox(el: Element, lookup: (id: string) => Element | undefined): Box {
  switch (el.type) {
    case 'icon': {
      const h = iconHeight(el.icon, el.size);
      return { x: el.x - el.size / 2, y: el.y - h / 2, width: el.size, height: h };
    }
    case 'box':
      return { x: el.x - el.width / 2, y: el.y - el.height / 2, width: el.width, height: el.height };
    case 'text': {
      const w = textWidth(el.text, el.size, el.style);
      const h = textHeight(el.text, el.size);
      const left = el.align === 'start' ? el.x : el.align === 'end' ? el.x - w : el.x - w / 2;
      return { x: left, y: el.y - h / 2, width: w, height: h };
    }
    case 'chart':
    case 'area':
      return { x: el.x - el.width / 2, y: el.y - el.height / 2, width: el.width, height: el.height };
    case 'image': {
      const { bar } = imageFrame(el);
      return { x: el.x - el.width / 2, y: el.y - (el.height + bar) / 2, width: el.width, height: el.height + bar };
    }
    case 'iso': {
      const b = projectIso(resolveIsoParts(el), { rotate: el.rotate, explode: 0 }, el.scale).box;
      return { x: el.x + b.x, y: el.y + b.y, width: b.width, height: b.height };
    }
    case 'ring':
      return { x: el.x - el.rx, y: el.y - el.ry, width: el.rx * 2, height: el.ry * 2 };
    case 'arrow': {
      const { start, end } = arrowEnds(el, lookup);
      return union([
        { x: start.x, y: start.y, width: 0, height: 0 },
        { x: end.x, y: end.y, width: 0, height: 0 },
      ]);
    }
  }
}

/**
 * A framed image's browser bar: its height, and where the picture sits. The picture and bar together are
 * centered on (x, y); the picture is `width` × `height` and the bar sits on top of it.
 */
export function imageFrame(el: { x: number; y: number; width: number; height: number; frame?: string }) {
  const bar = el.frame === 'browser' ? Math.min(90, Math.max(34, el.width * 0.055)) : 0;
  const top = el.y - (el.height + bar) / 2;
  return { bar, top, imageTop: top + bar };
}

/** Everything the element draws, including its label. Used for camera framing. */
export function fullBox(el: Element, lookup: (id: string) => Element | undefined): Box {
  const box = shapeBox(el, lookup);
  if ((el.type === 'icon' || el.type === 'iso') && el.label) {
    const ls = el.type === 'icon' ? iconLabelSize(el.size) : ISO_LABEL_SIZE;
    const lw = textWidth(el.label, ls);
    return union([box, { x: el.x - lw / 2, y: box.y + box.height, width: lw, height: ls * 1.3 }]);
  }
  return box;
}

export function union(boxes: Box[]): Box {
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.width));
  const y2 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export const center = (b: Box): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

export function anchorPoint(b: Box, anchor: AnchorName): Point {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const r = b.x + b.width;
  const btm = b.y + b.height;
  const points: Record<AnchorName, Point> = {
    center: { x: cx, y: cy },
    top: { x: cx, y: b.y },
    bottom: { x: cx, y: btm },
    left: { x: b.x, y: cy },
    right: { x: r, y: cy },
    'top-left': { x: b.x, y: b.y },
    'top-right': { x: r, y: b.y },
    'bottom-left': { x: b.x, y: btm },
    'bottom-right': { x: r, y: btm },
  };
  return points[anchor];
}

const outward: Record<AnchorName, Point> = {
  center: { x: 0, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  'top-left': { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  'top-right': { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  'bottom-left': { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  'bottom-right': { x: Math.SQRT1_2, y: Math.SQRT1_2 },
};

/** Splits "id.anchor" into its parts. */
export function parseRef(ref: string): { id: string; anchor?: string } {
  const dot = ref.indexOf('.');
  return dot < 0 ? { id: ref } : { id: ref.slice(0, dot), anchor: ref.slice(dot + 1) };
}

/** Where an anchor sits: on the shape, except that bottom anchors go below an icon's label. */
function attachPoint(el: Element, anchor: AnchorName, lookup: (id: string) => Element | undefined): Point {
  const shape = shapeBox(el, lookup);
  const p = anchorPoint(shape, anchor);
  if (anchor.startsWith('bottom')) {
    const full = fullBox(el, lookup);
    return { x: p.x, y: full.y + full.height };
  }
  return p;
}

/** Picks the side of `box` that faces `toward`. */
function facingAnchor(box: Box, toward: Point): AnchorName {
  const c = center(box);
  const dx = (toward.x - c.x) / box.width;
  const dy = (toward.y - c.y) / box.height;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

function refTarget(ref: Ref, lookup: (id: string) => Element | undefined): { el?: Element; point?: Point; anchor?: AnchorName } {
  if (typeof ref !== 'string') return { point: ref };
  const { id, anchor } = parseRef(ref);
  const el = lookup(id);
  if (!el) throw new Error(`unknown element "${id}"`);
  if (anchor !== undefined && !(anchor in outward)) throw new Error(`unknown anchor "${anchor}" in "${ref}"`);
  return { el, anchor: anchor as AnchorName | undefined };
}

export function arrowEnds(arrow: ArrowElement, lookup: (id: string) => Element | undefined): { start: Point; end: Point } {
  const a = refTarget(arrow.from, lookup);
  const b = refTarget(arrow.to, lookup);
  const roughA = a.point ?? center(shapeBox(a.el!, lookup));
  const roughB = b.point ?? center(shapeBox(b.el!, lookup));
  const resolve = (t: typeof a, other: Point): Point => {
    if (t.point) return t.point;
    const anchor = t.anchor ?? facingAnchor(shapeBox(t.el!, lookup), other);
    const p = attachPoint(t.el!, anchor, lookup);
    const o = outward[anchor];
    return { x: p.x + o.x * ARROW_GAP, y: p.y + o.y * ARROW_GAP };
  };
  return { start: resolve(a, roughB), end: resolve(b, roughA) };
}

/** Quadratic bezier for an arrow; `curve` bends it sideways. */
export function arrowCurve(start: Point, end: Point, curve: number): { control: Point; d: string } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const control = { x: (start.x + end.x) / 2 + dy * curve, y: (start.y + end.y) / 2 - dx * curve };
  return { control, d: `M${start.x} ${start.y}Q${control.x} ${control.y} ${end.x} ${end.y}` };
}

/** Two strokes of an arrow head at `tip`, pointing away from `from`. */
export function arrowHead(tip: Point, from: Point, size = 26): string {
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
  const wing = (a: number) => ({ x: tip.x - size * Math.cos(ang + a), y: tip.y - size * Math.sin(ang + a) });
  const l = wing(0.45);
  const r = wing(-0.45);
  return `M${l.x} ${l.y}L${tip.x} ${tip.y}L${r.x} ${r.y}`;
}

/** Camera that fits `box` with `padding` screen pixels around it. */
export function frameBox(box: Box, padding: number, maxZoom = 4): Camera {
  const zoom = Math.min(
    (VIEW.width - 2 * padding) / Math.max(box.width, 1),
    (VIEW.height - 2 * padding) / Math.max(box.height, 1),
    maxZoom,
  );
  const c = center(box);
  return { x: c.x, y: c.y, zoom: Math.max(zoom, 0.05) };
}
