// Playback of a compiled presentation on an SVG board, one GSAP timeline per scene: the layers, the
// beats and scenes (next, previous, play-through), export frames and the per-frame redraw. The Stage
// (render.ts) adds the editing view on top. Building elements, timeline ops, animated pictures, the
// spotlight and the board background live in their own modules.
import gsap from 'gsap';
import { AnimatedPictures } from './animatedPictures';
import { buildBoard } from './boardBackground';
import { buildElement } from './buildElement';
import type { CompiledPresentation, CompiledScene } from './compile';
import { svgEl } from './dom';
import { VIEW } from './geometry';
import { board } from './palette';
import { applyState, redrawComputed } from './sceneState';
import type { Camera } from './schema';
import { SpotlightLayer } from './spotlight';
import { nextUid, preloadImage, type ElementNodes, type FlowState } from './stageNodes';
import { stillOf } from './videoClock';
import { addOp } from './timelineOps';

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

/** Plays a compiled presentation into a container (the Stage adds editing on top). */
export class StagePlayer {
  readonly svg: SVGSVGElement;
  protected camGroup: SVGGElement;
  private layer: SVGGElement;
  /** Pictures, under the glowing drawing. */
  private images: SVGGElement;
  /** The spotlight's dimming, above the drawing. */
  protected spotlight: SpotlightLayer;
  /** Drawing added while a spotlight is on, kept bright above it. */
  private layerTop: SVGGElement;
  protected overlay: SVGGElement;
  /** Things fixed on the screen ("pinned"): outside the camera, above everything on the board. */
  private screenImages: SVGGElement;
  private screenLayer: SVGGElement;
  private defs: SVGDefsElement;
  protected presentation?: CompiledPresentation;
  protected sceneIndex = 0;
  private beat = 0;
  protected tl = gsap.timeline({ paused: true });
  protected cam: Camera = { x: VIEW.width / 2, y: VIEW.height / 2, zoom: 1 };
  protected nodes = new Map<string, ElementNodes>();
  protected flows = new Map<string, FlowState>();
  private ambient = 0;
  protected stopAt: number | null = null;
  protected playThrough = false;
  private listeners = new Set<(p: StagePosition) => void>();
  private performers = new Set<(e: PerformState) => void>();
  /** Export mode: frames are drawn only by renderAt, not by the real-time ticker. */
  private manual = false;
  private builtFor?: CompiledScene;
  private prefix = `jzm${nextUid()}`;
  private animations = new AnimatedPictures(() => this.tl, () => this.builtFor);
  /** Resolves once the board background has been flattened (see boardBackground.ts). */
  private backgroundReady: Promise<void>;

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
    this.backgroundReady = buildBoard(this.svg, this.defs, this.prefix);
    this.camGroup = svgEl('g', {}, this.svg);
    this.images = svgEl('g', {}, this.camGroup);
    this.layer = svgEl('g', { filter: `url(#${this.prefix}-glow)` }, this.camGroup);
    this.spotlight = new SpotlightLayer(this.camGroup);
    this.layerTop = svgEl('g', { filter: `url(#${this.prefix}-glow)` }, this.camGroup);
    // Editor selection boxes: above the drawing, without the glow.
    this.overlay = svgEl('g', { 'pointer-events': 'none' }, this.camGroup);
    this.screenImages = svgEl('g', {}, this.svg);
    this.screenLayer = svgEl('g', { filter: `url(#${this.prefix}-glow)` }, this.svg);
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
      document.fonts.load(`40px Bungee`),
      document.fonts.load(`500 40px 'JetBrains Mono'`),
      this.backgroundReady,
      // Pictures load before the first frame, so exports never catch one half-loaded.
      ...[...new Set(p.scenes.flatMap((sc) => sc.elements.flatMap((e) => (e.type === 'image' ? [stillOf(e.src) ?? ''] : []))))].filter(Boolean).map(preloadImage),
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

  /** Resolves when every animated picture has loaded and drawn the frame asked for (export waits for this). */
  settled() {
    return this.animations.settled();
  }

  protected applyCamera() {
    const { x, y, zoom } = this.cam;
    this.camGroup.setAttribute('transform', `translate(${VIEW.width / 2} ${VIEW.height / 2}) scale(${zoom}) translate(${-x} ${-y})`);
  }

  protected emit() {
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
    this.spotlight.render();
    this.animations.render(dt, this.manual);
    redrawComputed(this.nodes, this.flows, dt, this.ambient);
  }

  // ---------------------------------------------------------------- building

  protected buildScene(scene: CompiledScene) {
    this.builtFor = scene;
    this.tl.kill();
    this.tl = gsap.timeline({ paused: true });
    this.layer.replaceChildren();
    this.layerTop.replaceChildren();
    this.images.replaceChildren();
    this.screenLayer.replaceChildren();
    this.screenImages.replaceChildren();
    this.animations.reset();
    this.overlay.replaceChildren();
    Object.assign(this.spotlight.state, { on: 0 });
    this.nodes.clear();
    this.flows.clear();
    // Previous scene's masks; the board's own defs come first and are kept.
    this.defs.querySelectorAll('[data-scene]').forEach((n) => n.remove());

    const lookup = (id: string) => scene.elements.find((e) => e.id === id);
    const ctx = {
      defs: this.defs, prefix: this.prefix, layer: this.layer, layerTop: this.layerTop, screenLayer: this.screenLayer,
      images: this.images, screenImages: this.screenImages, above: scene.above,
      watchAnimation: this.animations.watch.bind(this.animations),
    };
    for (const el of scene.elements) this.nodes.set(el.id, buildElement(ctx, el, lookup, scene.initial[el.id]));

    applyState(this.nodes, this.flows, scene.initial);
    this.cam = { ...scene.camera };
    const targets = { tl: this.tl, cam: this.cam, spot: this.spotlight.state, nodes: this.nodes, flows: this.flows, play: this.animations.play.bind(this.animations) };
    for (const op of scene.ops) addOp(targets, op);
    this.tl.set({}, {}, scene.duration);
  }
}
