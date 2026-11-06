// Turns one compiled op (show, hide, move, camera, spotlight, play...) into tweens on the scene's GSAP
// timeline. Everything is a fromTo with immediateRender off, so scrubbing in any direction works.
import type { Op } from './compile';
import { palette } from './palette';
import type { Camera } from './schema';
import { partState, spotValues, type ElementNodes, type FlowState, type ImageNodes } from './stageNodes';

/** What the ops animate: the timeline, the camera, the spotlight's numbers and the scene's elements. */
export interface OpTargets {
  tl: gsap.core.Timeline;
  cam: Camera;
  spot: object;
  nodes: Map<string, ElementNodes>;
  flows: Map<string, FlowState>;
  /** Hooks up a play of an animated picture (now, or once it has loaded). */
  play(image: ImageNodes, op: Extract<Op, { kind: 'play' }>): void;
}

export function addOp(ctx: OpTargets, op: Op) {
  const tl = ctx.tl;
  const instant = 0.001;
  if (op.kind === 'camera') {
    tl.fromTo(ctx.cam, { ...op.from }, { ...op.to, duration: op.dur, ease: 'power2.inOut', immediateRender: false }, op.t);
    return;
  }
  if (op.kind === 'play') {
    const image = ctx.nodes.get(op.id)?.image;
    if (!image) return;
    ctx.play(image, op);
    return;
  }
  if (op.kind === 'spotlight') {
    // Turning on or off keeps the lit region still; moving between targets slides it.
    const from = spotValues(op.from ?? op.to!, op.from ? 1 : 0);
    const to = spotValues(op.to ?? op.from!, op.to ? 1 : 0);
    tl.fromTo(ctx.spot, from, { ...to, duration: Math.max(op.dur, 0.001), ease: 'power2.inOut', immediateRender: false }, op.t);
    return;
  }
  const n = ctx.nodes.get(op.id);
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
      const state = ctx.flows.get(op.id);
      if (!state) return;
      const toFlow = (f: typeof op.from): FlowState => ({ on: f ? 1 : 0, dir: f?.reverse ? -1 : 1, speed: f?.speed ?? state.speed });
      tl.fromTo(state, toFlow(op.from), { ...toFlow(op.to), duration: instant, immediateRender: false }, op.t);
      break;
    }
  }
}
