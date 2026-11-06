// The shapes the board keeps for each drawn element (SVG nodes plus the numbers the timeline
// animates), and the small pure helpers that read or redraw them. Shared by the Stage and its helpers.
import type { ChartNodes } from './chart';
import { svgEl } from './dom';
import { projectIso, type IsoPart } from './iso';
import { board, palette } from './palette';
import type { Spotlight } from './compile';

/** One step of drawing an element: a stroke traced along its length, or text revealed left to right. */
export type DrawPart =
  | { kind: 'stroke'; node: SVGGeometryElement; length: number; scale: number; weight?: number }
  | { kind: 'write'; rect: SVGRectElement; x: number; width: number }
  | { kind: 'fill'; node: SVGElement; opacity: number }
  /** Something drawn by code from `cell.v` going 0 → 1 (an iso part, a bar, a pie slice). */
  | { kind: 'cell'; cell: { v: number }; weight?: number };

/** Target and values for a part fully drawn or not drawn at all. */
export function partState(p: DrawPart, drawn: boolean): [gsap.TweenTarget, gsap.TweenVars] {
  switch (p.kind) {
    case 'stroke':
      return [p.node, { strokeDashoffset: drawn ? 0 : p.length }];
    case 'write':
      return [p.rect, { attr: { width: drawn ? p.width : 0 } }];
    case 'fill':
      return [p.node, { fillOpacity: drawn ? p.opacity : 0 }];
    case 'cell':
      return [p.cell, { v: drawn ? 1 : 0 }];
  }
}

export interface ElementNodes {
  outer: SVGGElement;
  fx: SVGGElement;
  parts: DrawPart[];
  /** Pivot for pop and pulse, in the element's own coordinates. */
  pivot: { x: number; y: number };
  flowPath?: SVGPathElement;
  iso?: IsoNodes;
  chart?: ChartNodes;
  image?: ImageNodes;
  /** An area's outline: shown only while editing. */
  areaOutline?: SVGElement;
  /** Fixed on the screen, outside the camera. */
  pinned?: boolean;
}

/**
 * A picture lives in its own layer under the marker glow (so it stays crisp), and copies the element's
 * position, scale and opacity every frame. It is revealed left to right while `reveal.v` goes 0 → 1.
 */
export interface ImageNodes {
  outer: SVGGElement; fx: SVGGElement; clip: SVGRectElement; img: SVGImageElement; left: number; width: number; reveal: { v: number };
  anim?: AnimNodes;
  video?: VideoNodes;
}

/**
 * Something on a picture that `play` drives (an animated picture or a video). `state` is set by the timeline
 * (speed; `epoch` changes when a play jumps to `seekTo`); `clip` (seconds) advances with the board's clock.
 */
export interface Playable {
  loop: boolean;
  /** The foreignObject that holds the canvas or video, clipped like the picture. */
  box: SVGForeignObjectElement;
  state: { speed: number; epoch: number; seekTo: number };
  epoch: number;
  /** While scheduling plays in order: the jump count and position so far. */
  planned: { epoch: number; seekTo: number };
  clip: number;
}

/** An animated picture (APNG, GIF, animated WebP), decoded frame by frame on demand into a canvas. */
export interface AnimNodes extends Playable {
  decoder: ImageDecoder;
  frames: number;
  frameSeconds: number;
  canvas: HTMLCanvasElement;
  shown: number;
  want: number;
  busy: Promise<void> | null;
}

/** A video (WebM, MP4, MOV) played muted in a <video>; live it plays natively, in export it is seeked frame by frame. */
export interface VideoNodes extends Playable {
  video: HTMLVideoElement;
  /** Seconds; Infinity when the file doesn't say. */
  duration: number;
  /** Export: the time last asked of the video, and the wait until that frame is shown. */
  target: number;
  busy: Promise<void> | null;
}

export interface IsoNodes {
  parts: IsoPart[];
  scale: number;
  group: SVGGElement;
  pool: SVGPathElement[];
  view: { rotate: number; explode: number };
  progress: { v: number }[];
  spin: { on: number; speed: number };
  /** Extra turn accumulated while spinning. */
  phase: number;
}

export interface FlowState { on: number; dir: number; speed: number }

let uid = 0;

/** A number unique on the page, for ids in the SVG (stage prefixes, masks, clip paths). */
export const nextUid = () => uid++;

export type LineStyle = 'solid' | 'dashed' | 'dotted';
/** A box's or arrow's line style; `dashed: true` is the older spelling of "dashed". */
export const lineOf = (el: { line?: LineStyle; dashed?: boolean }): LineStyle => el.line ?? (el.dashed ? 'dashed' : 'solid');

export const FLOW_PERIOD = 34;

/** Re-projects an iso object and updates its face paths. Faces are filled with the board color so hidden lines stay hidden. */
export function renderIso(iso: IsoNodes) {
  const { faces } = projectIso(iso.parts, { rotate: iso.view.rotate + iso.phase, explode: iso.view.explode }, iso.scale);
  faces.forEach((f, k) => {
    let path = iso.pool[k];
    if (!path) {
      path = svgEl('path', { 'stroke-width': board.stroke * 0.8, pathLength: 1, 'stroke-dasharray': '1 1' }, iso.group);
      iso.pool.push(path);
    }
    const part = iso.parts[f.part];
    const color = part.color ? palette[part.color] : 'currentColor';
    const p = iso.progress[f.part].v;
    path.setAttribute('d', f.d);
    path.style.display = p > 0 ? '' : 'none';
    path.style.stroke = color;
    path.style.fill = `color-mix(in srgb, ${color} 9%, ${board.background})`;
    path.style.fillOpacity = String(p);
    path.style.strokeDashoffset = String(1 - p);
  });
  for (let k = faces.length; k < iso.pool.length; k++) iso.pool[k].style.display = 'none';
}

export function setDash(path: SVGGeometryElement, length: number) {
  path.style.strokeDasharray = `${length} ${length}`;
}

/** A hand-drawn loop: slightly wobbly ellipse that overshoots its start. */
export function ringPath(rx: number, ry: number, seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rand = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 2 ** 32;
  };
  const start = -2.4;
  const sweep = Math.PI * 2 + 0.55;
  const steps = 48;
  const pts: string[] = [];
  const wobble = rand() * 0.04 + 0.02;
  const phase = rand() * Math.PI * 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = start + sweep * t;
    // Radius drifts outward a little so the overshoot doesn't sit on top of the start.
    const k = 1 + wobble * Math.sin(a * 3 + phase) + 0.06 * t;
    pts.push(`${(Math.cos(a) * rx * k).toFixed(1)} ${(Math.sin(a) * ry * k).toFixed(1)}`);
  }
  return `M${pts[0]}L${pts.slice(1).join('L')}`;
}

/** The spotlight as numbers GSAP can tween; `on` fades it in and out. */
export function spotValues(s: Spotlight, on: number) {
  return { on, x: s.x, y: s.y, width: s.width, height: s.height, amount: s.amount, ellipse: s.shape === 'ellipse' ? 1 : 0, fade: s.style === 'fade' ? 1 : 0 };
}

/** Copies the element's position, scale and visibility onto its picture, and applies the reveal. */
export function renderImage(n: ElementNodes) {
  const im = n.image!;
  const t1 = n.outer.getAttribute('transform');
  const t2 = n.fx.getAttribute('transform');
  if (t1 !== null) im.outer.setAttribute('transform', t1); else im.outer.removeAttribute('transform');
  if (t2 !== null) im.fx.setAttribute('transform', t2); else im.fx.removeAttribute('transform');
  im.outer.style.opacity = n.outer.style.opacity;
  const v = Math.max(0, Math.min(1, im.reveal.v));
  im.clip.setAttribute('width', String(im.width * v));
  im.img.style.opacity = String(Math.min(1, v * 2.5));
  const live = im.anim ?? im.video;
  if (live) live.box.style.opacity = im.img.style.opacity;
}

export function preloadImage(src: string): Promise<void> {
  const img = new Image();
  img.src = src;
  return img.decode().catch(() => undefined);
}
