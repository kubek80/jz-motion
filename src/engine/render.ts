import gsap from 'gsap';
import { buildChart, renderChart, type ChartNodes } from './chart';
import { svgEl } from './dom';
import { splitSubpaths } from './pathSplit';
import type { CompiledElement, CompiledPresentation, CompiledScene, ElementState, Op, Spotlight } from './compile';
import { arrowCurve, arrowEnds, arrowHead, iconLabelSize, imageFrame, ISO_LABEL_SIZE, VIEW } from './geometry';
import { projectIso, resolveIsoParts, type IsoPart } from './iso';
import { ICON_GRID, iconHeight, icons, type PartColor } from './library';
import { board, palette } from './palette';
import type { Camera } from './schema';



/** One step of drawing an element: a stroke traced along its length, or text revealed left to right. */
export type DrawPart =
  | { kind: 'stroke'; node: SVGGeometryElement; length: number; scale: number; weight?: number }
  | { kind: 'write'; rect: SVGRectElement; x: number; width: number }
  | { kind: 'fill'; node: SVGElement; opacity: number }
  /** Something drawn by code from `cell.v` going 0 → 1 (an iso part, a bar, a pie slice). */
  | { kind: 'cell'; cell: { v: number }; weight?: number };

/** Target and values for a part fully drawn or not drawn at all. */
function partState(p: DrawPart, drawn: boolean): [gsap.TweenTarget, gsap.TweenVars] {
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

interface ElementNodes {
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
}

/**
 * A picture lives in its own layer under the marker glow (so it stays crisp), and copies the element's
 * position, scale and opacity every frame. It is revealed left to right while `reveal.v` goes 0 → 1.
 */
interface ImageNodes { outer: SVGGElement; fx: SVGGElement; clip: SVGRectElement; img: SVGImageElement; left: number; width: number; reveal: { v: number } }

interface IsoNodes {
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

interface FlowState { on: number; dir: number; speed: number }

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** Scene `scene` plays from timeline position `from` until `until` (equal when standing still). */
export interface PerformState { scene: number; from: number; until: number }

export interface StagePosition {
  scene: number;
  /** Beats completed in the current scene. */
  beat: number;
  time: number;
  duration: number;
  playing: boolean;
}

let uid = 0;

type LineStyle = 'solid' | 'dashed' | 'dotted';
/** A box's or arrow's line style; `dashed: true` is the older spelling of "dashed". */
const lineOf = (el: { line?: LineStyle; dashed?: boolean }): LineStyle => el.line ?? (el.dashed ? 'dashed' : 'solid');

/** Plays a compiled presentation into a container. */
export class Stage {
  readonly svg: SVGSVGElement;
  private camGroup: SVGGElement;
  private layer: SVGGElement;
  /** Pictures, under the glowing drawing. */
  private images: SVGGElement;
  /** The spotlight's dimming, above the drawing. */
  private spotPath: SVGPathElement;
  /** Drawing added while a spotlight is on, kept bright above it. */
  private layerTop: SVGGElement;
  private spot = { on: 0, x: 0, y: 0, width: 0, height: 0, amount: 0.7, ellipse: 0, fade: 0 };
  private overlay: SVGGElement;
  private defs: SVGDefsElement;
  private presentation?: CompiledPresentation;
  private sceneIndex = 0;
  private beat = 0;
  private tl = gsap.timeline({ paused: true });
  private cam: Camera = { x: VIEW.width / 2, y: VIEW.height / 2, zoom: 1 };
  private nodes = new Map<string, ElementNodes>();
  private flows = new Map<string, FlowState>();
  private ambient = 0;
  private stopAt: number | null = null;
  private playThrough = false;
  private listeners = new Set<(p: StagePosition) => void>();
  private performers = new Set<(e: PerformState) => void>();
  /** Export mode: frames are drawn only by renderAt, not by the real-time ticker. */
  private manual = false;
  private builtFor?: CompiledScene;
  private prefix = `jzm${uid++}`;

  constructor(container: HTMLElement) {
    this.svg = svgEl('svg', {
      viewBox: `0 0 ${VIEW.width} ${VIEW.height}`,
      preserveAspectRatio: 'xMidYMid meet',
      class: 'jzm-stage',
    });
    this.svg.style.display = 'block';
    this.svg.style.width = '100%';
    this.svg.style.height = '100%';
    this.svg.style.background = board.background;
    this.defs = svgEl('defs', {}, this.svg);
    this.buildBoard();
    this.camGroup = svgEl('g', {}, this.svg);
    this.images = svgEl('g', {}, this.camGroup);
    this.layer = svgEl('g', { filter: `url(#${this.prefix}-glow)` }, this.camGroup);
    this.spotPath = svgEl('path', { 'fill-rule': 'evenodd', 'pointer-events': 'none', display: 'none' }, this.camGroup) as SVGPathElement;
    this.layerTop = svgEl('g', { filter: `url(#${this.prefix}-glow)` }, this.camGroup);
    // Editor selection boxes: above the drawing, without the glow.
    this.overlay = svgEl('g', { 'pointer-events': 'none' }, this.camGroup);
    container.appendChild(this.svg);
    gsap.ticker.add(this.tick);
  }

  destroy() {
    gsap.ticker.remove(this.tick);
    this.tl.kill();
    this.svg.remove();
    this.listeners.clear();
  }

  /** Called whenever playback starts, stops or jumps: the raw material of a recorded performance. */
  onPerform(fn: (e: PerformState) => void): () => void {
    this.performers.add(fn);
    return () => this.performers.delete(fn);
  }

  /** What is playing right now, as a performance event. */
  performState(): PerformState {
    const t = this.tl.time();
    return { scene: this.sceneIndex, from: t, until: !this.tl.paused() && this.stopAt !== null ? this.stopAt : t };
  }

  private perform() {
    const e = this.performState();
    this.performers.forEach((fn) => fn(e));
  }

  /**
   * Export: draws scene `scene` at timeline position `time`, with `ambient` seconds on the clock that
   * drives flows and spins. Turns off real-time playback; call with increasing `ambient` for each frame.
   */
  renderAt(scene: number, time: number, ambient: number) {
    if (!this.presentation) return;
    this.manual = true;
    this.stopAt = null;
    if (scene !== this.sceneIndex || this.builtFor !== this.presentation.scenes[scene]) {
      this.sceneIndex = scene;
      this.buildScene(this.presentation.scenes[scene]);
    }
    this.tl.pause(time);
    const dt = Math.max(0, ambient - this.ambient);
    this.ambient = ambient;
    this.frame(dt);
  }

  onChange(fn: (p: StagePosition) => void): () => void {
    this.listeners.add(fn);
    fn(this.position());
    return () => this.listeners.delete(fn);
  }

  position(): StagePosition {
    return {
      scene: this.sceneIndex,
      beat: this.beat,
      time: this.tl.time(),
      duration: this.scene?.duration ?? 0,
      playing: !this.tl.paused(),
    };
  }

  get scene(): CompiledScene | undefined {
    return this.presentation?.scenes[this.sceneIndex];
  }

  async load(p: CompiledPresentation, at: { scene: number; beat: number } = { scene: 0, beat: 0 }) {
    this.presentation = p;
    await Promise.all([
      document.fonts.load(`40px Caveat`),
      document.fonts.load(`700 40px Caveat`),
      this.backgroundReady,
      // Pictures load before the first frame, so exports never catch one half-loaded.
      ...[...new Set(p.scenes.flatMap((sc) => sc.elements.flatMap((e) => (e.type === 'image' ? [e.src] : []))))].map(preloadImage),
    ]).catch(() => undefined);
    const scene = Math.min(at.scene, p.scenes.length - 1);
    this.showScene(scene, Math.min(at.beat, p.scenes[scene].beats.length));
  }

  /** Jumps to a scene with `beat` beats already completed. */
  showScene(index: number, beat = 0) {
    if (!this.presentation) return;
    this.sceneIndex = index;
    this.buildScene(this.presentation.scenes[index]);
    this.jumpToBeat(beat);
  }

  jumpToBeat(beat: number) {
    const scene = this.scene;
    if (!scene) return;
    this.stopAt = null;
    this.beat = Math.max(0, Math.min(beat, scene.beats.length));
    const t = this.beat === 0 ? 0 : scene.beats[this.beat - 1].end;
    this.tl.pause(t);
    this.perform();
    this.emit();
  }

  /** Scrubs within the current scene. */
  seek(time: number) {
    const scene = this.scene;
    if (!scene) return;
    this.stopAt = null;
    this.playThrough = false;
    this.tl.pause(time);
    this.beat = scene.beats.filter((b) => b.end <= time + 1e-6).length;
    this.perform();
    this.emit();
  }

  /** Presenter "next": finishes the running beat, or plays the next one, or moves to the next scene. */
  next() {
    const scene = this.scene;
    if (!scene || !this.presentation) return;
    this.playThrough = false;
    if (!this.tl.paused() && this.stopAt !== null) {
      this.tl.pause(this.stopAt);
      this.finishBeat();
      return;
    }
    if (this.beat < scene.beats.length) {
      this.playBeat(this.beat);
    } else if (this.sceneIndex < this.presentation.scenes.length - 1) {
      this.showScene(this.sceneIndex + 1, 0);
      if (this.scene!.beats[0]?.auto) this.playBeat(0);
    }
  }

  prev() {
    if (!this.scene) return;
    this.playThrough = false;
    if (this.beat > 0) {
      // Step back over auto beats so "previous" lands where a click would.
      let b = this.beat - 1;
      while (b > 0 && this.scene.beats[b].auto) b--;
      this.jumpToBeat(b);
    } else if (this.sceneIndex > 0) {
      const prevScene = this.presentation!.scenes[this.sceneIndex - 1];
      this.showScene(this.sceneIndex - 1, prevScene.beats.length);
    }
  }

  /** Plays every remaining beat and scene without waiting for clicks, like the final video. */
  playAll() {
    const scene = this.scene;
    if (!scene) return;
    if (this.beat >= scene.beats.length && this.sceneIndex < this.presentation!.scenes.length - 1) {
      this.showScene(this.sceneIndex + 1, 0);
    }
    this.playThrough = true;
    this.stopAt = this.scene!.duration;
    this.tl.play();
    this.perform();
    this.emit();
  }

  pause() {
    this.playThrough = false;
    this.stopAt = null;
    this.tl.pause();
    this.beat = this.scene?.beats.filter((b) => b.end <= this.tl.time() + 1e-6).length ?? 0;
    this.perform();
    this.emit();
  }

  private playBeat(i: number) {
    const b = this.scene!.beats[i];
    this.tl.pause(b.start);
    this.stopAt = b.end;
    this.tl.play();
    this.perform();
    this.emit();
  }

  private finishBeat() {
    const scene = this.scene!;
    this.beat = scene.beats.filter((b) => b.end <= this.tl.time() + 1e-6).length;
    this.stopAt = null;
    this.perform();
    if (this.playThrough) {
      if (this.sceneIndex < this.presentation!.scenes.length - 1) {
        this.showScene(this.sceneIndex + 1, 0);
        this.playAll();
        return;
      }
      this.playThrough = false;
    } else if (this.beat < scene.beats.length && scene.beats[this.beat].auto) {
      this.playBeat(this.beat);
      return;
    }
    this.emit();
  }

  /** The dimming outside the spotlight: a huge rectangle with the lit region cut out of it. */
  private renderSpotlight() {
    const s = this.spot;
    const alpha = s.on * s.amount;
    if (alpha < 0.002 || s.width <= 0) {
      this.spotPath.setAttribute('display', 'none');
      return;
    }
    const { x, y, width: w, height: h } = s;
    const hole = s.ellipse > 0.5
      ? `M${x} ${y + h / 2}a${w / 2} ${h / 2} 0 1 0 ${w} 0a${w / 2} ${h / 2} 0 1 0 ${-w} 0Z`
      : (() => {
          const r = Math.min(18, w / 4, h / 4);
          return `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;
        })();
    this.spotPath.setAttribute('d', `M-100000 -100000H100000V100000H-100000Z${hole}`);
    this.spotPath.setAttribute('fill', s.fade > 0.5 ? board.background : '#000');
    this.spotPath.setAttribute('opacity', String(alpha));
    this.spotPath.removeAttribute('display');
  }

  private applyCamera() {
    const { x, y, zoom } = this.cam;
    this.camGroup.setAttribute('transform', `translate(${VIEW.width / 2} ${VIEW.height / 2}) scale(${zoom}) translate(${-x} ${-y})`);
  }

  private emit() {
    const p = this.position();
    this.listeners.forEach((fn) => fn(p));
  }

  private tick = (_time: number, deltaMs: number) => {
    if (this.manual) return;
    const dt = Math.min(deltaMs, 100) / 1000;
    this.ambient += dt;
    if (this.stopAt !== null && !this.tl.paused() && this.tl.time() >= this.stopAt - 1e-6) {
      this.tl.pause(this.stopAt);
      this.finishBeat();
    } else if (!this.tl.paused()) {
      this.emit();
    }
    this.frame(dt);
  };

  /** Draws the parts that are computed rather than tweened: camera, charts, 3D, flows. */
  private frame(dt: number) {
    this.applyCamera();
    this.renderSpotlight();
    for (const n of this.nodes.values()) if (n.image) renderImage(n);
    for (const n of this.nodes.values()) {
      if (n.chart) renderChart(n.chart);
      if (!n.iso) continue;
      if (n.iso.spin.on > 0.5) n.iso.phase += dt * n.iso.spin.speed;
      renderIso(n.iso);
    }
    for (const [id, f] of this.flows) {
      const path = this.nodes.get(id)?.flowPath;
      if (!path) continue;
      path.style.opacity = f.on > 0.5 ? '1' : '0';
      path.style.strokeDashoffset = String(-((this.ambient * f.speed * f.dir) % FLOW_PERIOD));
    }
  }

  // ---------------------------------------------------------------- editing

  /**
   * Editing view of a scene: every element fully drawn where the scene places it, nothing animated.
   * Elements not in `editable` (inherited from an earlier scene, or made by actions) are dimmed.
   */
  showLayout(index: number, editable: Set<string>, camera?: Camera) {
    if (!this.presentation) return;
    this.sceneIndex = index;
    this.stopAt = null;
    this.playThrough = false;
    const scene = this.presentation.scenes[index];
    this.buildScene(scene);
    this.tl.pause(0);
    for (const [id, n] of this.nodes) {
      const isRing = scene.elements.find((e) => e.id === id)?.type === 'ring';
      gsap.set(n.outer, { opacity: isRing ? 0 : editable.has(id) ? 1 : 0.3 });
      for (const part of n.parts) gsap.set(...partState(part, true));
      if (n.iso) n.iso.spin.on = 0;
      if (n.areaOutline) n.areaOutline.setAttribute('stroke-opacity', '0.6');
      if (n.image) renderImage(n);
    }
    this.spot.on = 0;
    this.renderSpotlight();
    for (const f of this.flows.values()) f.on = 0;
    this.cam = camera ? { ...camera } : this.fitCamera();
    this.applyCamera();
    this.emit();
  }

  get camera(): Camera {
    return { ...this.cam };
  }

  set camera(c: Camera) {
    this.cam = { ...c };
    this.applyCamera();
  }

  /** Camera that shows everything currently drawn, with some room around it. */
  fitCamera(padding = 90): Camera {
    const boxes = [...this.nodes.values()].filter((n) => Number(gsap.getProperty(n.outer, 'opacity')) > 0).map((n) => this.boxOf(n));
    if (!boxes.length) return { x: VIEW.width / 2, y: VIEW.height / 2, zoom: 1 };
    const x1 = Math.min(...boxes.map((b) => b.x));
    const y1 = Math.min(...boxes.map((b) => b.y));
    const x2 = Math.max(...boxes.map((b) => b.x + b.width));
    const y2 = Math.max(...boxes.map((b) => b.y + b.height));
    const zoom = Math.min((VIEW.width - 2 * padding) / Math.max(x2 - x1, 1), (VIEW.height - 2 * padding) / Math.max(y2 - y1, 1), 1);
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2, zoom };
  }

  /** Board coordinates under a point on the screen. */
  boardPoint(clientX: number, clientY: number): { x: number; y: number } {
    const m = this.camGroup.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  /** Board units per screen pixel, for drag thresholds and handles. */
  get unitsPerPixel(): number {
    const m = this.camGroup.getScreenCTM();
    return m ? 1 / m.a : 1;
  }

  /** The smallest element whose box contains the point; `among` limits the candidates. */
  elementAt(point: { x: number; y: number }, among: Set<string>, margin = 12): string | undefined {
    let best: { id: string; area: number } | undefined;
    for (const [id, n] of this.nodes) {
      if (!among.has(id)) continue;
      const b = this.boxOf(n);
      if (point.x < b.x - margin || point.x > b.x + b.width + margin || point.y < b.y - margin || point.y > b.y + b.height + margin) continue;
      const area = Math.max(b.width, 1) * Math.max(b.height, 1);
      if (!best || area < best.area) best = { id, area };
    }
    return best?.id;
  }

  /** Box of an element in board coordinates, as currently drawn. */
  elementBox(id: string) {
    const n = this.nodes.get(id);
    return n ? this.boxOf(n) : undefined;
  }

  /** Moves an element while dragging, before the presentation is updated. */
  previewMove(id: string, x: number, y: number) {
    const n = this.nodes.get(id);
    if (n) gsap.set(n.outer, { x, y });
  }

  /** Dashed boxes around the selected elements; `secondary` ones (e.g. an action's targets) are drawn fainter. */
  setSelection(ids: string[], secondary: string[] = [], opts: { handles?: boolean } = {}) {
    this.overlay.replaceChildren();
    this.handles = [];
    const k = this.unitsPerPixel;
    const draw = (id: string, strong: boolean) => {
      const b = this.elementBox(id);
      if (!b) return;
      const pad = 10 * k;
      svgEl('rect', {
        x: b.x - pad, y: b.y - pad, width: b.width + 2 * pad, height: b.height + 2 * pad, rx: 6 * k,
        fill: 'none', stroke: strong ? '#3ef0ff' : '#fff05a', 'stroke-width': (strong ? 2 : 1.5) * k,
        'stroke-dasharray': `${6 * k} ${5 * k}`, opacity: strong ? 0.95 : 0.7,
      }, this.overlay);
      if (strong && opts.handles && ids.length === 1) {
        const size = 12 * k;
        const corners: [Corner, number, number][] = [
          ['nw', b.x - pad, b.y - pad], ['ne', b.x + b.width + pad, b.y - pad],
          ['sw', b.x - pad, b.y + b.height + pad], ['se', b.x + b.width + pad, b.y + b.height + pad],
        ];
        for (const [corner, x, y] of corners) {
          svgEl('rect', { x: x - size / 2, y: y - size / 2, width: size, height: size, rx: 2 * k, fill: '#0d1114', stroke: '#3ef0ff', 'stroke-width': 2 * k }, this.overlay);
          this.handles.push({ corner, x, y });
        }
      }
    };
    secondary.filter((id) => !ids.includes(id)).forEach((id) => draw(id, false));
    ids.forEach((id) => draw(id, true));
  }

  private handles: { corner: Corner; x: number; y: number }[] = [];

  /**
   * Where an element's editable text (`text`, `label` or `title`) is on screen, for editing it in place.
   * Without that text yet (an icon with no label), the spot just below the element.
   */
  textField(id: string, field: string): { left: number; top: number; width: number; height: number; fontPx: number; color: string; align: 'start' | 'middle' | 'end' } | undefined {
    const n = this.nodes.get(id);
    if (!n) return undefined;
    const color = getComputedStyle(n.outer).color;
    const node = n.outer.querySelector<SVGTextElement>(`text[data-field="${field}"]`);
    if (node) {
      const r = node.getBoundingClientRect();
      const scale = node.getScreenCTM()?.a ?? 1;
      return { left: r.left, top: r.top, width: r.width, height: r.height, fontPx: Number(node.getAttribute('font-size')) * scale, color, align: (node.getAttribute('text-anchor') ?? 'middle') as 'start' | 'middle' | 'end' };
    }
    const b = this.boxOf(n);
    const m = this.camGroup.getScreenCTM();
    if (!m) return undefined;
    const p = new DOMPoint(b.x, b.y + b.height + 8).matrixTransform(m);
    const q = new DOMPoint(b.x + b.width, b.y + b.height + 60).matrixTransform(m);
    return { left: p.x, top: p.y, width: q.x - p.x, height: q.y - p.y, fontPx: 40 * m.a, color, align: 'middle' };
  }

  /** Hides a piece of text while it is being edited in place. */
  setTextHidden(id: string, field: string, hidden: boolean) {
    const node = this.nodes.get(id)?.outer.querySelector<SVGTextElement>(`text[data-field="${field}"]`);
    if (node) node.style.visibility = hidden ? 'hidden' : '';
  }

  /** The resize handle under a board point, if any (see setSelection's `handles`). */
  handleAt(point: { x: number; y: number }): Corner | undefined {
    const r = 12 * this.unitsPerPixel;
    return this.handles.find((h) => Math.abs(h.x - point.x) <= r && Math.abs(h.y - point.y) <= r)?.corner;
  }

  /** Stretches an element around its own position while a resize handle is dragged. */
  previewScale(id: string, sx: number, sy: number) {
    const n = this.nodes.get(id);
    if (n) gsap.set(n.fx, { scaleX: sx, scaleY: sy, svgOrigin: '0 0' });
  }

  private boxOf(n: ElementNodes) {
    const b = n.outer.getBBox();
    const m = this.camGroup.getCTM()!.inverse().multiply(n.outer.getCTM()!);
    const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
      .map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }

  // ---------------------------------------------------------------- building

  private buildBoard() {
    const p = this.prefix;
    this.defs.innerHTML = `
      <filter id="${p}-glow" x="-20%" y="-20%" width="140%" height="140%">
        <!-- Tight inner glow plus a soft, dimmed halo; the crisp stroke stays on top so text keeps its shape. -->
        <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="nearBlur"/>
        <feComponentTransfer in="nearBlur" result="near"><feFuncA type="linear" slope="0.7"/></feComponentTransfer>
        <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="farBlur"/>
        <feComponentTransfer in="farBlur" result="far"><feFuncA type="linear" slope="0.45"/></feComponentTransfer>
        <feMerge>
          <feMergeNode in="far"/><feMergeNode in="near"/><feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="${p}-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7"/>
        <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.05 0"/>
      </filter>
      <filter id="${p}-smudge" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="60"/>
      </filter>
      <radialGradient id="${p}-vignette" cx="50%" cy="50%" r="75%">
        <stop offset="55%" stop-color="#000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.65"/>
      </radialGradient>`;
    const bg = svgEl('g', { 'pointer-events': 'none' }, this.svg);
    svgEl('rect', { width: VIEW.width, height: VIEW.height, fill: board.background }, bg);
    const smudges = svgEl('g', { filter: `url(#${p}-smudge)`, fill: '#ffffff', opacity: 0.035 }, bg);
    for (const [cx, cy, rx, ry] of [[420, 300, 360, 120], [1350, 760, 420, 140], [1500, 220, 260, 90], [600, 880, 300, 80]]) {
      svgEl('ellipse', { cx, cy, rx, ry, transform: `rotate(-8 ${cx} ${cy})` }, smudges);
    }
    svgEl('rect', { width: VIEW.width, height: VIEW.height, filter: `url(#${p}-grain)` }, bg);
    svgEl('rect', { width: VIEW.width, height: VIEW.height, fill: `url(#${p}-vignette)` }, bg);
    this.backgroundReady = this.flattenBackground(bg);
  }

  /** Resolves once the board background has been flattened (see flattenBackground). */
  private backgroundReady: Promise<void> = Promise.resolve();

  /**
   * The board texture is static but its filters (noise, a large blur) cost more to redraw than
   * everything else on the board. Paint it once into a bitmap and show that instead.
   */
  private async flattenBackground(bg: SVGGElement) {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return;
    try {
      const scale = 1;
      const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEW.width * scale}" height="${VIEW.height * scale}" viewBox="0 0 ${VIEW.width} ${VIEW.height}"><defs>${this.defs.innerHTML}</defs>${bg.innerHTML}</svg>`;
      const svgUrl = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
      const img = new Image();
      img.src = svgUrl;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = VIEW.width * scale;
      canvas.height = VIEW.height * scale;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      URL.revokeObjectURL(svgUrl);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
      if (!blob) return;
      const flat = svgEl('image', { href: URL.createObjectURL(blob), width: VIEW.width, height: VIEW.height, preserveAspectRatio: 'none' });
      bg.replaceChildren(flat);
    } catch {
      // Keep the live (slower) background.
    }
  }

  private buildScene(scene: CompiledScene) {
    this.builtFor = scene;
    this.tl.kill();
    this.tl = gsap.timeline({ paused: true });
    this.layer.replaceChildren();
    this.layerTop.replaceChildren();
    this.images.replaceChildren();
    this.overlay.replaceChildren();
    Object.assign(this.spot, { on: 0 });
    this.nodes.clear();
    this.flows.clear();
    // Previous scene's masks; the board's own defs come first and are kept.
    this.defs.querySelectorAll('[data-scene]').forEach((n) => n.remove());

    const lookup = (id: string) => scene.elements.find((e) => e.id === id);
    for (const el of scene.elements) this.nodes.set(el.id, this.buildElement(el, lookup, scene.initial[el.id]));

    this.applyState(scene.initial);
    this.cam = { ...scene.camera };
    for (const op of scene.ops) this.addOp(op);
    this.tl.set({}, {}, scene.duration);
  }

  private applyState(states: Record<string, ElementState>) {
    for (const [id, s] of Object.entries(states)) {
      const n = this.nodes.get(id);
      if (!n) continue;
      gsap.set(n.outer, { x: s.x, y: s.y, opacity: s.visible ? 1 : 0, color: palette[s.color], filter: 'blur(0px)' });
      for (const part of n.parts) gsap.set(...partState(part, true));
      if (n.iso && s.iso) {
        Object.assign(n.iso.view, { rotate: s.iso.rotate, explode: s.iso.explode });
        Object.assign(n.iso.spin, { on: s.iso.spin === null ? 0 : 1, speed: s.iso.spin ?? 30 });
        n.iso.phase = 0;
        n.iso.progress.forEach((c) => (c.v = 1));
      }
      if (n.chart && s.chart) {
        s.chart.values.forEach((v, i) => (n.chart!.values[i].v = v));
        n.chart.growth.forEach((c) => (c.v = 1));
        n.chart.intro.v = 1;
        renderChart(n.chart);
      }
      if (n.flowPath) this.flows.set(id, { on: s.flow ? 1 : 0, dir: s.flow?.reverse ? -1 : 1, speed: s.flow?.speed ?? 160 });
    }
  }

  private buildElement(el: CompiledElement, lookup: (id: string) => CompiledElement | undefined, initial?: ElementState): ElementNodes {
    const outer = svgEl('g', { 'data-id': el.id, class: `jzm-el jzm-${el.type}` }, this.builtFor?.above.includes(el.id) ? this.layerTop : this.layer);
    const fx = svgEl('g', {}, outer);
    const parts: DrawPart[] = [];
    const stroke = (d: string, width: number, parent: SVGElement = fx, line: LineStyle = 'solid', scale = 1): SVGGraphicsElement => {
      const patterned = line !== 'solid';
      // A path with several pieces draws them one after another (a dash pattern restarts on every piece).
      const pieces = patterned ? [d] : splitSubpaths(d);
      if (pieces.length > 1) {
        const group = svgEl('g', {}, parent);
        for (const piece of pieces) stroke(piece, width, group, 'solid', scale);
        return group;
      }
      const path = svgEl('path', {
        d,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': width,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      }, parent);
      if (patterned) {
        // Dashed and dotted strokes are drawn through a mask so the dash pattern and the draw-on don't fight.
        const id = `${this.prefix}-m${uid++}`;
        // The default mask region is a percentage of the viewport, which cuts off shapes drawn around their center.
        const mask = svgEl('mask', { id, maskUnits: 'userSpaceOnUse', x: -1e5, y: -1e5, width: 2e5, height: 2e5, 'data-scene': '' }, this.defs);
        // userSpaceOnUse: the mask follows the element's own transforms.
        const reveal = svgEl('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': width + 6, 'stroke-linecap': 'round' }, mask);
        // Dots are zero-length dashes with round ends.
        path.setAttribute('stroke-dasharray', line === 'dotted' ? `0 ${width * 2.4}` : `${width * 3} ${width * 3}`);
        const holder = svgEl('g', { mask: `url(#${id})` }, parent);
        holder.appendChild(path);
        // One unit longer than the path, so "not drawn" hides even the rounded line end.
        const length = reveal.getTotalLength() + 1;
        setDash(reveal, length);
        parts.push({ kind: 'stroke', node: reveal, length, scale });
        return path;
      }
      const length = path.getTotalLength() + 1;
      setDash(path, length);
      parts.push({ kind: 'stroke', node: path, length, scale });
      return path;
    };
    /** `field` marks text that can be edited in place (the element's text, label or title). */
    const write = (text: string, x: number, y: number, size: number, anchor: 'start' | 'middle' | 'end' = 'middle', field?: string) => {
      const t = svgEl('text', {
        x,
        y,
        'font-size': size,
        'font-family': board.font,
        'font-weight': 700,
        'text-anchor': anchor,
        'dominant-baseline': 'central',
        fill: 'currentColor',
      }, fx);
      t.textContent = text;
      if (field) t.setAttribute('data-field', field);
      const width = t.getComputedTextLength() || text.length * size * 0.42;
      const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
      const id = `${this.prefix}-c${uid++}`;
      const clip = svgEl('clipPath', { id, 'data-scene': '' }, this.defs);
      // Generous vertical room for descenders and the glow; the clip is in the text's user space.
      const rect = svgEl('rect', { x: left - size * 0.2, y: y - size, width: width + size * 0.4, height: size * 2 }, clip);
      clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
      t.setAttribute('clip-path', `url(#${id})`);
      parts.push({ kind: 'write', rect, x: left - size * 0.2, width: width + size * 0.4 });
    };

    let pivot = { x: 0, y: 0 };
    let flowPath: SVGPathElement | undefined;
    let iso: IsoNodes | undefined;
    let chart: ChartNodes | undefined;
    let image: ImageNodes | undefined;
    let areaOutline: SVGElement | undefined;

    switch (el.type) {
      case 'icon': {
        const def = icons[el.icon];
        const [bw, bh] = def.box ?? [ICON_GRID, ICON_GRID];
        const scale = el.size / bw;
        const g = svgEl('g', { transform: `scale(${scale}) translate(${-bw / 2} ${-bh / 2})` }, fx);
        if (def.parts) {
          // Clipart: each part in its own colour; outlines draw first, then their fills fade in.
          const colour = (c: PartColor) => (c === 'board' ? board.background : palette[c]);
          for (const part of def.parts) {
            const holder = part.transform ? svgEl('g', { transform: part.transform }, g) : g;
            const path = stroke(part.d, part.width ?? 2, holder, 'solid', scale);
            // Strokes are drawn in currentColor, so setting `color` colours every piece of the part.
            if (part.color) path.style.color = colour(part.color);
            if (part.opacity !== undefined) path.setAttribute('opacity', String(part.opacity));
            if (part.fill) {
              const f = svgEl('path', { d: part.d, fill: colour(part.fill), stroke: 'none', 'fill-rule': 'evenodd' });
              holder.insertBefore(f, path);
              parts.push({ kind: 'fill', node: f, opacity: part.fillOpacity ?? 1 });
            }
          }
        } else if (def.style === 'logo') {
          // Brand logos are filled shapes: trace their outline thinly, then fade in a faint fill.
          const w = Math.max(2, el.size * 0.02) / scale;
          for (const d of def.paths) stroke(d, w, g, 'solid', scale);
          const fill = svgEl('g', { fill: 'currentColor', 'fill-rule': 'evenodd', stroke: 'none' }, g);
          for (const d of def.paths) svgEl('path', { d }, fill);
          parts.push({ kind: 'fill', node: fill, opacity: 0.22 });
        } else {
          const w = def.stroke ?? Math.max(3.5, el.size * 0.045) / scale;
          for (const d of def.paths) stroke(d, w, g, 'solid', scale);
        }
        if (el.label) {
          const ls = iconLabelSize(el.size);
          write(el.label, 0, iconHeight(el.icon, el.size) / 2 + ls * 0.75, ls, 'middle', 'label');
        }
        break;
      }
      case 'text':
        write(el.text, 0, 0, el.size, el.align, 'text');
        break;
      case 'box': {
        const w = el.width / 2;
        const h = el.height / 2;
        const r = Math.min(el.radius, w, h);
        const d = `M${-w + r} ${-h}H${w - r}Q${w} ${-h} ${w} ${-h + r}V${h - r}Q${w} ${h} ${w - r} ${h}H${-w + r}Q${-w} ${h} ${-w} ${h - r}V${-h + r}Q${-w} ${-h} ${-w + r} ${-h}Z`;
        stroke(d, board.stroke * (el.weight === 'bold' ? 1.8 : 1), fx, lineOf(el));
        if (el.label) write(el.label, 0, 0, Math.min(56, el.height * 0.4), 'middle', 'label');
        break;
      }
      case 'arrow': {
        const { start, end } = arrowEnds(el, lookup);
        const { control, d } = arrowCurve(start, end, el.curve);
        const bold = el.weight === 'bold';
        const width = board.stroke * (bold ? 1.9 : 1);
        const shaft = stroke(d, width, fx, lineOf(el)) as SVGPathElement;
        if (el.head === 'end' || el.head === 'both') stroke(arrowHead(end, control, bold ? 40 : 26), width);
        if (el.head === 'start' || el.head === 'both') stroke(arrowHead(start, control, bold ? 40 : 26), width);
        const mid = { x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x, y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y };
        pivot = mid;
        if (el.label) {
          // Label sits on the upper side of the arrow (or the right side of a vertical one).
          const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
          let nx = -(end.y - start.y) / len;
          let ny = (end.x - start.x) / len;
          if (ny > 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; }
          const vertical = Math.abs(nx) > 0.9;
          write(el.label, mid.x + nx * 34, mid.y + ny * 34, 40, vertical ? (nx > 0 ? 'start' : 'end') : 'middle', 'label');
        }
        flowPath = svgEl('path', {
          d: shaft.getAttribute('d')!,
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': board.stroke * 2.2,
          'stroke-linecap': 'round',
          'stroke-dasharray': `0.1 ${FLOW_PERIOD}`,
          opacity: 0,
        }, outer);
        break;
      }
      case 'ring':
        stroke(ringPath(el.rx, el.ry, el.id), board.stroke * 0.9);
        break;
      case 'image': {
        const { bar, top, imageTop } = imageFrame(el);
        const w = el.width / 2;
        const t = top - el.y;
        const it = imageTop - el.y;
        const bottom = it + el.height;
        // An invisible box so the element can be picked and framed even without a frame drawn.
        svgEl('rect', { x: -w, y: t, width: el.width, height: el.height + bar, fill: 'none', stroke: 'none' }, fx);
        const outer2 = svgEl('g', {}, this.images) as SVGGElement;
        const fx2 = svgEl('g', {}, outer2) as SVGGElement;
        const clipId = `${this.prefix}-c${uid++}`;
        const clipPath = svgEl('clipPath', { id: clipId, 'data-scene': '' }, this.defs);
        const clip = svgEl('rect', { x: -w, y: it, width: el.width, height: el.height, rx: bar ? 0 : 8 }, clipPath) as SVGRectElement;
        const img = svgEl('image', { href: el.src, x: -w, y: it, width: el.width, height: el.height, preserveAspectRatio: 'xMidYMid slice', 'clip-path': `url(#${clipId})` }, fx2) as SVGImageElement;
        const reveal = { v: 1 };
        image = { outer: outer2, fx: fx2, clip, img, left: -w, width: el.width, reveal };
        if (bar) {
          // A browser window in marker: outline, the bar's bottom edge, three dots, the address field.
          const r = Math.min(18, bar * 0.45);
          stroke(`M${-w + r} ${t}H${w - r}Q${w} ${t} ${w} ${t + r}V${bottom - r}Q${w} ${bottom} ${w - r} ${bottom}H${-w + r}Q${-w} ${bottom} ${-w} ${bottom - r}V${t + r}Q${-w} ${t} ${-w + r} ${t}Z`, board.stroke);
          stroke(`M${-w} ${it}H${w}`, board.stroke * 0.8);
          const dotR = bar * 0.11;
          for (let i = 0; i < 3; i++) {
            const cx = -w + bar * 0.55 + i * bar * 0.42;
            const cy = t + bar / 2;
            stroke(`M${cx - dotR} ${cy}a${dotR} ${dotR} 0 1 0 ${dotR * 2} 0a${dotR} ${dotR} 0 1 0 ${-dotR * 2} 0`, board.stroke * 0.7);
          }
          const fieldX = -w + bar * 1.9;
          const fieldW = Math.min(el.width * 0.55, el.width - bar * 2.6);
          const fh = bar * 0.56;
          stroke(`M${fieldX + fh / 2} ${t + (bar - fh) / 2}H${fieldX + fieldW - fh / 2}a${fh / 2} ${fh / 2} 0 0 1 0 ${fh}H${fieldX + fh / 2}a${fh / 2} ${fh / 2} 0 0 1 0 ${-fh}Z`, board.stroke * 0.7);
          if (el.url) write(el.url, fieldX + fh * 0.6, t + bar / 2, fh * 0.62, 'start', 'url');
        }
        parts.push({ kind: 'cell', cell: reveal, weight: el.width * 0.9 });
        if (el.label) write(el.label, 0, bottom + 34, 40, 'middle', 'label');
        break;
      }
      case 'area': {
        const w = el.width / 2;
        const h = el.height / 2;
        const d = el.shape === 'ellipse'
          ? `M${-w} 0a${w} ${h} 0 1 0 ${el.width} 0a${w} ${h} 0 1 0 ${-el.width} 0Z`
          : `M${-w} ${-h}H${w}V${h}H${-w}Z`;
        // Not part of the drawing: a faint dashed outline while editing, invisible otherwise.
        areaOutline = svgEl('path', { d, fill: 'none', stroke: 'currentColor', 'stroke-width': 3, 'stroke-dasharray': '10 8', 'stroke-opacity': 0 }, fx);
        break;
      }
      case 'chart':
        chart = buildChart(el, initial?.chart?.max ?? el.max ?? 1, { fx, stroke, write, parts });
        break;
      case 'iso': {
        const isoParts = resolveIsoParts(el);
        iso = {
          parts: isoParts,
          scale: el.scale,
          group: svgEl('g', { 'stroke-linejoin': 'round' }, fx),
          pool: [],
          view: { rotate: el.rotate, explode: 0 },
          progress: isoParts.map(() => ({ v: 1 })),
          spin: { on: 0, speed: 30 },
          phase: 0,
        };
        for (const cell of iso.progress) parts.push({ kind: 'cell', cell });
        if (el.label) {
          const { box } = projectIso(isoParts, iso.view, el.scale);
          write(el.label, 0, box.y + box.height + ISO_LABEL_SIZE * 0.85, ISO_LABEL_SIZE, 'middle', 'label');
        }
        renderIso(iso);
        break;
      }
    }
    return { outer, fx, parts, pivot, flowPath, iso, chart, image, areaOutline };
  }

  private addOp(op: Op) {
    const tl = this.tl;
    const instant = 0.001;
    if (op.kind === 'camera') {
      tl.fromTo(this.cam, { ...op.from }, { ...op.to, duration: op.dur, ease: 'power2.inOut', immediateRender: false }, op.t);
      return;
    }
    if (op.kind === 'spotlight') {
      // Turning on or off keeps the lit region still; moving between targets slides it.
      const from = spotValues(op.from ?? op.to!, op.from ? 1 : 0);
      const to = spotValues(op.to ?? op.from!, op.to ? 1 : 0);
      tl.fromTo(this.spot, from, { ...to, duration: Math.max(op.dur, 0.001), ease: 'power2.inOut', immediateRender: false }, op.t);
      return;
    }
    const n = this.nodes.get(op.id);
    if (!n) return;
    const origin = `${n.pivot.x} ${n.pivot.y}`;
    switch (op.kind) {
      case 'show': {
        tl.fromTo(n.outer, { opacity: 0, filter: 'blur(0px)' }, { opacity: 1, filter: 'blur(0px)', duration: op.mode === 'fade' ? op.dur : instant, immediateRender: false }, op.t);
        if (op.mode === 'pop') {
          tl.fromTo(n.fx, { scale: 0.2, svgOrigin: origin }, { scale: 1, svgOrigin: origin, duration: op.dur, ease: 'back.out(2.2)', immediateRender: false }, op.t);
        }
        if (op.mode === 'draw') {
          // Each part gets time in proportion to its size, with a floor so dots and short ticks still show.
          // A fill fades in over a quarter of the time the strokes before it took.
          const lineWeights = n.parts.map((p) => (p.kind === 'stroke' ? p.weight ?? p.length * p.scale : p.kind === 'write' ? p.width * 0.7 : p.kind === 'cell' ? p.weight ?? 60 : 0));
          const weights = n.parts.map((p, i) => (p.kind === 'fill'
            ? lineWeights.slice(0, i).reduce((a, b) => a + b, 0) * 0.25
            : Math.max(lineWeights[i], 12)));
          const total = weights.reduce((a, b) => a + b, 0);
          // Undraw every part up front, otherwise later parts show fully drawn until their turn.
          for (const p of n.parts) tl.set(...partState(p, false), op.t);
          let at = op.t;
          n.parts.forEach((p, i) => {
            const d = (op.dur * weights[i]) / total;
            const [target, from] = partState(p, false);
            const ease = p.kind === 'stroke' ? 'power1.inOut' : 'none';
            tl.fromTo(target, from, { ...partState(p, true)[1], duration: d, ease, immediateRender: false }, at);
            at += d;
          });
        } else {
          for (const p of n.parts) tl.set(...partState(p, true), op.t);
        }
        break;
      }
      case 'hide':
        tl.fromTo(
          n.outer,
          { opacity: 1, filter: 'blur(0px)' },
          { opacity: 0, filter: op.mode === 'erase' ? 'blur(10px)' : 'blur(0px)', duration: op.dur, ease: 'power1.in', immediateRender: false },
          op.t,
        );
        break;
      case 'pulse':
        tl.fromTo(n.fx, { scale: 1, svgOrigin: origin }, {
          scale: 1.18,
          svgOrigin: origin,
          duration: op.dur / (op.times * 2),
          repeat: op.times * 2 - 1,
          yoyo: true,
          ease: 'sine.inOut',
          immediateRender: false,
        }, op.t);
        break;
      case 'move':
        tl.fromTo(n.outer, { ...op.from }, { ...op.to, duration: op.dur, ease: 'power2.inOut', immediateRender: false }, op.t);
        break;
      case 'recolor':
        tl.fromTo(n.outer, { color: palette[op.from] }, { color: palette[op.to], duration: op.dur, immediateRender: false }, op.t);
        break;
      case 'iso':
        if (n.iso) tl.fromTo(n.iso.view, { ...op.from }, { ...op.to, duration: op.dur, ease: 'power2.inOut', immediateRender: false }, op.t);
        break;
      case 'values':
        if (n.chart) {
          op.to.forEach((v, i) => tl.fromTo(n.chart!.values[i], { v: op.from[i] }, { v, duration: op.dur, ease: 'power2.inOut', immediateRender: false }, op.t));
        }
        break;
      case 'spin':
        if (n.iso) {
          const toSpin = (v: number | null) => ({ on: v === null ? 0 : 1, speed: v ?? n.iso!.spin.speed });
          tl.fromTo(n.iso.spin, toSpin(op.from), { ...toSpin(op.to), duration: instant, immediateRender: false }, op.t);
        }
        break;
      case 'flow': {
        const state = this.flows.get(op.id);
        if (!state) return;
        const toFlow = (f: typeof op.from): FlowState => ({ on: f ? 1 : 0, dir: f?.reverse ? -1 : 1, speed: f?.speed ?? state.speed });
        tl.fromTo(state, toFlow(op.from), { ...toFlow(op.to), duration: instant, immediateRender: false }, op.t);
        break;
      }
    }
  }
}

const FLOW_PERIOD = 34;

/** Re-projects an iso object and updates its face paths. Faces are filled with the board color so hidden lines stay hidden. */
function renderIso(iso: IsoNodes) {
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

function setDash(path: SVGGeometryElement, length: number) {
  path.style.strokeDasharray = `${length} ${length}`;
}

/** A hand-drawn loop: slightly wobbly ellipse that overshoots its start. */
function ringPath(rx: number, ry: number, seed: string): string {
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
function spotValues(s: Spotlight, on: number) {
  return { on, x: s.x, y: s.y, width: s.width, height: s.height, amount: s.amount, ellipse: s.shape === 'ellipse' ? 1 : 0, fade: s.style === 'fade' ? 1 : 0 };
}

/** Copies the element's position, scale and visibility onto its picture, and applies the reveal. */
function renderImage(n: ElementNodes) {
  const im = n.image!;
  const t1 = n.outer.getAttribute('transform');
  const t2 = n.fx.getAttribute('transform');
  if (t1 !== null) im.outer.setAttribute('transform', t1); else im.outer.removeAttribute('transform');
  if (t2 !== null) im.fx.setAttribute('transform', t2); else im.fx.removeAttribute('transform');
  im.outer.style.opacity = n.outer.style.opacity;
  const v = Math.max(0, Math.min(1, im.reveal.v));
  im.clip.setAttribute('width', String(im.width * v));
  im.img.style.opacity = String(Math.min(1, v * 2.5));
}

function preloadImage(src: string): Promise<void> {
  const img = new Image();
  img.src = src;
  return img.decode().catch(() => undefined);
}
