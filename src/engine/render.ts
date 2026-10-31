import gsap from 'gsap';
import type { CompiledElement, CompiledPresentation, CompiledScene, ElementState, Op } from './compile';
import { arrowCurve, arrowEnds, arrowHead, iconLabelSize, ISO_LABEL_SIZE, VIEW } from './geometry';
import { projectIso, resolveIsoParts, type IsoPart } from './iso';
import { ICON_GRID, icons } from './library';
import { board, palette } from './palette';
import type { Camera } from './schema';

const NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: SVGElement): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

/** One step of drawing an element: a stroke traced along its length, or text revealed left to right. */
type DrawPart =
  | { kind: 'stroke'; node: SVGGeometryElement; length: number; scale: number }
  | { kind: 'write'; rect: SVGRectElement; x: number; width: number }
  | { kind: 'fill'; node: SVGElement; opacity: number }
  /** One part of an iso object; `cell.v` goes 0 → 1 as it is drawn. */
  | { kind: 'iso'; cell: { v: number } };

/** Target and values for a part fully drawn or not drawn at all. */
function partState(p: DrawPart, drawn: boolean): [gsap.TweenTarget, gsap.TweenVars] {
  switch (p.kind) {
    case 'stroke':
      return [p.node, { strokeDashoffset: drawn ? 0 : p.length }];
    case 'write':
      return [p.rect, { attr: { width: drawn ? p.width : 0 } }];
    case 'fill':
      return [p.node, { fillOpacity: drawn ? p.opacity : 0 }];
    case 'iso':
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
}

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

export interface StagePosition {
  scene: number;
  /** Beats completed in the current scene. */
  beat: number;
  time: number;
  duration: number;
  playing: boolean;
}

let uid = 0;

/** Plays a compiled presentation into a container. */
export class Stage {
  readonly svg: SVGSVGElement;
  private camGroup: SVGGElement;
  private layer: SVGGElement;
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
    this.layer = svgEl('g', { filter: `url(#${this.prefix}-glow)` }, this.camGroup);
    container.appendChild(this.svg);
    gsap.ticker.add(this.tick);
  }

  destroy() {
    gsap.ticker.remove(this.tick);
    this.tl.kill();
    this.svg.remove();
    this.listeners.clear();
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
    this.emit();
  }

  pause() {
    this.playThrough = false;
    this.stopAt = null;
    this.tl.pause();
    this.beat = this.scene?.beats.filter((b) => b.end <= this.tl.time() + 1e-6).length ?? 0;
    this.emit();
  }

  private playBeat(i: number) {
    const b = this.scene!.beats[i];
    this.tl.pause(b.start);
    this.stopAt = b.end;
    this.tl.play();
    this.emit();
  }

  private finishBeat() {
    const scene = this.scene!;
    this.beat = scene.beats.filter((b) => b.end <= this.tl.time() + 1e-6).length;
    this.stopAt = null;
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

  private emit() {
    const p = this.position();
    this.listeners.forEach((fn) => fn(p));
  }

  private tick = (_time: number, deltaMs: number) => {
    this.ambient += Math.min(deltaMs, 100) / 1000;
    if (this.stopAt !== null && !this.tl.paused() && this.tl.time() >= this.stopAt - 1e-6) {
      this.tl.pause(this.stopAt);
      this.finishBeat();
    } else if (!this.tl.paused()) {
      this.emit();
    }
    const { x, y, zoom } = this.cam;
    this.camGroup.setAttribute('transform', `translate(${VIEW.width / 2} ${VIEW.height / 2}) scale(${zoom}) translate(${-x} ${-y})`);
    for (const n of this.nodes.values()) {
      if (!n.iso) continue;
      if (n.iso.spin.on > 0.5) n.iso.phase += (Math.min(deltaMs, 100) / 1000) * n.iso.spin.speed;
      renderIso(n.iso);
    }
    for (const [id, f] of this.flows) {
      const path = this.nodes.get(id)?.flowPath;
      if (!path) continue;
      path.style.opacity = f.on > 0.5 ? '1' : '0';
      path.style.strokeDashoffset = String(-((this.ambient * f.speed * f.dir) % FLOW_PERIOD));
    }
  };

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
  }

  private buildScene(scene: CompiledScene) {
    this.tl.kill();
    this.tl = gsap.timeline({ paused: true });
    this.layer.replaceChildren();
    this.nodes.clear();
    this.flows.clear();
    // Previous scene's masks; the board's own defs come first and are kept.
    this.defs.querySelectorAll('[data-scene]').forEach((n) => n.remove());

    const lookup = (id: string) => scene.elements.find((e) => e.id === id);
    for (const el of scene.elements) this.nodes.set(el.id, this.buildElement(el, lookup));

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
      if (n.flowPath) this.flows.set(id, { on: s.flow ? 1 : 0, dir: s.flow?.reverse ? -1 : 1, speed: s.flow?.speed ?? 160 });
    }
  }

  private buildElement(el: CompiledElement, lookup: (id: string) => CompiledElement | undefined): ElementNodes {
    const outer = svgEl('g', { 'data-id': el.id, class: `jzm-el jzm-${el.type}` }, this.layer);
    const fx = svgEl('g', {}, outer);
    const parts: DrawPart[] = [];
    const stroke = (d: string, width: number, parent: SVGElement = fx, dashed = false, scale = 1) => {
      const path = svgEl('path', {
        d,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': width,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      }, parent);
      if (dashed) {
        // Dashed strokes are drawn through a mask so the dash pattern and the draw-on don't fight.
        const id = `${this.prefix}-m${uid++}`;
        // The default mask region is a percentage of the viewport, which cuts off shapes drawn around their center.
        const mask = svgEl('mask', { id, maskUnits: 'userSpaceOnUse', x: -1e5, y: -1e5, width: 2e5, height: 2e5, 'data-scene': '' }, this.defs);
        // userSpaceOnUse: the mask follows the element's own transforms.
        const reveal = svgEl('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': width + 6, 'stroke-linecap': 'round' }, mask);
        path.setAttribute('stroke-dasharray', `${width * 3} ${width * 3}`);
        const holder = svgEl('g', { mask: `url(#${id})` }, parent);
        holder.appendChild(path);
        const length = reveal.getTotalLength();
        setDash(reveal, length);
        parts.push({ kind: 'stroke', node: reveal, length, scale });
        return path;
      }
      const length = path.getTotalLength();
      setDash(path, length);
      parts.push({ kind: 'stroke', node: path, length, scale });
      return path;
    };
    const write = (text: string, x: number, y: number, size: number, anchor: 'start' | 'middle' | 'end' = 'middle') => {
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

    switch (el.type) {
      case 'icon': {
        const def = icons[el.icon];
        const scale = el.size / ICON_GRID;
        const g = svgEl('g', { transform: `scale(${scale}) translate(${-ICON_GRID / 2} ${-ICON_GRID / 2})` }, fx);
        if (def.style === 'logo') {
          // Brand logos are filled shapes: trace their outline thinly, then fade in a faint fill.
          const w = Math.max(2, el.size * 0.02) / scale;
          for (const d of def.paths) stroke(d, w, g, false, scale);
          const fill = svgEl('g', { fill: 'currentColor', 'fill-rule': 'evenodd', stroke: 'none' }, g);
          for (const d of def.paths) svgEl('path', { d }, fill);
          parts.push({ kind: 'fill', node: fill, opacity: 0.22 });
        } else {
          const w = def.stroke ?? Math.max(3.5, el.size * 0.045) / scale;
          for (const d of def.paths) stroke(d, w, g, false, scale);
        }
        if (el.label) {
          const ls = iconLabelSize(el.size);
          write(el.label, 0, el.size / 2 + ls * 0.75, ls);
        }
        break;
      }
      case 'text':
        write(el.text, 0, 0, el.size, el.align);
        break;
      case 'box': {
        const w = el.width / 2;
        const h = el.height / 2;
        const r = Math.min(el.radius, w, h);
        const d = `M${-w + r} ${-h}H${w - r}Q${w} ${-h} ${w} ${-h + r}V${h - r}Q${w} ${h} ${w - r} ${h}H${-w + r}Q${-w} ${h} ${-w} ${h - r}V${-h + r}Q${-w} ${-h} ${-w + r} ${-h}Z`;
        stroke(d, board.stroke, fx, el.dashed);
        if (el.label) write(el.label, 0, 0, Math.min(56, el.height * 0.4));
        break;
      }
      case 'arrow': {
        const { start, end } = arrowEnds(el, lookup);
        const { control, d } = arrowCurve(start, end, el.curve);
        const shaft = stroke(d, board.stroke, fx, el.dashed);
        if (el.head === 'end' || el.head === 'both') stroke(arrowHead(end, control), board.stroke);
        if (el.head === 'start' || el.head === 'both') stroke(arrowHead(start, control), board.stroke);
        const mid = { x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x, y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y };
        pivot = mid;
        if (el.label) {
          // Label sits on the upper side of the arrow (or the right side of a vertical one).
          const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
          let nx = -(end.y - start.y) / len;
          let ny = (end.x - start.x) / len;
          if (ny > 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; }
          const vertical = Math.abs(nx) > 0.9;
          write(el.label, mid.x + nx * 34, mid.y + ny * 34, 40, vertical ? (nx > 0 ? 'start' : 'end') : 'middle');
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
        for (const cell of iso.progress) parts.push({ kind: 'iso', cell });
        if (el.label) {
          const { box } = projectIso(isoParts, iso.view, el.scale);
          write(el.label, 0, box.y + box.height + ISO_LABEL_SIZE * 0.85, ISO_LABEL_SIZE);
        }
        renderIso(iso);
        break;
      }
    }
    return { outer, fx, parts, pivot, flowPath, iso };
  }

  private addOp(op: Op) {
    const tl = this.tl;
    const instant = 0.001;
    if (op.kind === 'camera') {
      tl.fromTo(this.cam, { ...op.from }, { ...op.to, duration: op.dur, ease: 'power2.inOut', immediateRender: false }, op.t);
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
          const lineWeights = n.parts.map((p) => (p.kind === 'stroke' ? p.length * p.scale : p.kind === 'write' ? p.width * 0.7 : p.kind === 'iso' ? 60 : 0));
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
  path.style.strokeDasharray = `${length + 1} ${length + 1}`;
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
