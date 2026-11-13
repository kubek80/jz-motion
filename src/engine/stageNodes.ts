// The shapes the board keeps for each drawn element (SVG nodes plus the numbers the timeline
// animates), and the small pure helpers that read or redraw them. Shared by the Stage and its helpers.
import type { ChartNodes } from './chart';
import { svgEl } from './dom';
import { projectIso, type IsoPart } from './iso';
import { board, palette } from './palette';
import type { Spotlight } from './compile';
import type { VideoStill } from './videoStill';
import type { PlannedPlay } from './videoClock';

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
  /** Imported clipart's gentle idle sway, driven by the board's clock. */
  idle?: IdleNodes;
}

/** An idle sway: up by `rise` and turned by `turn` degrees about (cx, cy) and back, every `period` seconds. */
export interface IdleNodes { g: SVGElement; rise: number; turn: number; cx: number; cy: number; period: number; phase: number }

/**
 * A picture lives in its own layer under the marker glow (so it stays crisp), and copies the element's
 * position, scale and opacity every frame. It is revealed left to right while `reveal.v` goes 0 → 1.
 */
export interface ImageNodes {
  outer: SVGGElement; fx: SVGGElement; clip: SVGRectElement; img: SVGImageElement; left: number; width: number; reveal: { v: number };
  /** A "window" frame's title bar and shadow: they appear with the picture. */
  chrome?: SVGGElement; shadow?: { node: SVGElement; clip: SVGRectElement; width: number };
  /** A "phone" frame's body, under the picture: it appears with it. (Its island and glass are the `chrome`.) */
  under?: SVGGElement;
  video?: VideoNodes;
}

/** What the timeline sets for a recording's plays (all numbers, so it scrubs both ways): see animatedPictures.ts. */
export interface PlayState {
  /** Playing speed; 0 paused. */
  speed: number;
  /** Goes up with every jump (to `seekTo` seconds). */
  epoch: number;
  seekTo: number;
  /** Goes up with every play. */
  seq: number;
  /** Seconds to stop and hold at (-1: none), and how long it should take to get there (0: at its own speed). */
  stopAt: number;
  arrive: number;
}

/** A recording (a video: WebM, MP4, MOV) played muted; live it plays natively, in export it is seeked frame by frame. */
export interface VideoNodes {
  src: string;
  video: HTMLVideoElement;
  /** Export: the video's frame painted on a canvas over it, so the exported picture always has it. */
  copy: VideoStill;
  /** The foreignObject that holds the video (and a cross-fade's), clipped like the picture. */
  box: SVGForeignObjectElement;
  loop: boolean;
  /** Seconds; Infinity when the file doesn't say. */
  duration: number;
  /** When each distinct picture starts (seconds): "frame 5" is frames[4]. Loaded when a play or the editor needs it. */
  frames?: number[];
  state: PlayState;
  /** While scheduling plays in order: the state so far, and where the clip will be (to know what a cross-fade starts from). */
  planned: PlayState & { t: number; clip: number; holding: boolean };
  /** Every play scheduled so far, in order (the first: how it starts); export works out the clip from these. */
  plays: PlannedPlay[];
  epoch: number;
  seq: number;
  /** Seconds into the recording now; where this play holds (-1: nowhere) and its own speed to get there (null: the play's). */
  clip: number;
  stopAt: number;
  speedTo: number | null;
  /** Cross-fades: from the picture at `from` seconds, starting at timeline time `t`, over `dur` seconds. */
  fades: { t: number; dur: number; from: number }[];
  /** The second video that shows what a cross-fade starts from (made when a play first fades). */
  fade?: { video: HTMLVideoElement; copy: VideoStill; target: number; busy: Promise<void> | null; ready: Promise<boolean> };
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
  if (im.chrome) im.chrome.style.opacity = im.img.style.opacity;
  if (im.under) im.under.style.opacity = im.img.style.opacity;
  // The shadow is revealed with the window (its clip grows with the wipe), so it never shows ahead of it.
  if (im.shadow) {
    im.shadow.clip.setAttribute('width', String(im.shadow.width * v));
    im.shadow.node.style.opacity = String(Math.min(1, v * 2.5));
  }
  if (im.video) im.video.box.style.opacity = im.img.style.opacity;
}

export function preloadImage(src: string): Promise<void> {
  const img = new Image();
  img.src = src;
  return img.decode().catch(() => undefined);
}
