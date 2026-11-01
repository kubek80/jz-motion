import { DEFAULT_CAMERA, frameBox, fullBox, union, type Box } from './geometry';
import { isoModels } from './iso';
import { icons } from './library';
import type { ColorName } from './palette';
import { Presentation, type Action, type LayoutName, type Camera, type Element, type Point } from './schema';

// Turns a presentation into a flat, timed plan per scene. Pure and DOM-free so it is easy to test;
// render.ts turns the plan into SVG and a GSAP timeline.

/** Highlight ellipse created by a "circle" action. */
export interface RingElement { type: 'ring'; id: string; x: number; y: number; rx: number; ry: number; color: ColorName }
export type CompiledElement = Element | RingElement;

export interface ElementState {
  visible: boolean;
  x: number;
  y: number;
  color: ColorName;
  flow: { reverse: boolean; speed: number } | null;
  /** Only for iso elements. */
  iso?: { rotate: number; explode: number; spin: number | null };
  /** Only for charts: the values shown now. */
  chart?: { values: number[]; max: number };
}

export type Op =
  | { kind: 'show'; id: string; mode: 'draw' | 'fade' | 'pop'; t: number; dur: number }
  | { kind: 'hide'; id: string; mode: 'fade' | 'erase'; t: number; dur: number }
  | { kind: 'pulse'; id: string; times: number; t: number; dur: number }
  | { kind: 'move'; id: string; from: Point; to: Point; t: number; dur: number }
  | { kind: 'recolor'; id: string; from: ColorName; to: ColorName; t: number; dur: number }
  | { kind: 'flow'; id: string; from: ElementState['flow']; to: ElementState['flow']; t: number }
  | { kind: 'camera'; from: Camera; to: Camera; t: number; dur: number }
  | { kind: 'iso'; id: string; from: { rotate: number; explode: number }; to: { rotate: number; explode: number }; t: number; dur: number }
  | { kind: 'spin'; id: string; from: number | null; to: number | null; t: number }
  | { kind: 'values'; id: string; from: number[]; to: number[]; t: number; dur: number }
  | { kind: 'spotlight'; from: Spotlight | null; to: Spotlight | null; t: number; dur: number };

/** A spotlight: the lit region in board coordinates, and how everything outside it is dimmed. */
export interface Spotlight { x: number; y: number; width: number; height: number; shape: 'rect' | 'ellipse'; style: 'dark' | 'fade'; amount: number }

export interface CompiledBeat {
  title?: string;
  notes?: string;
  auto: boolean;
  start: number;
  end: number;
  /** Video layout and camera track, with the scene's defaults applied. */
  layout?: LayoutName;
  track?: string;
  /** Seconds into the recording at which it starts, if made from a recording. */
  cue?: number;
  /** When each action runs, in seconds from the start of the beat (same order as the actions). */
  actions: { start: number; end: number }[];
}

export interface CompiledScene {
  id: string;
  title?: string;
  elements: CompiledElement[];
  initial: Record<string, ElementState>;
  final: Record<string, ElementState>;
  camera: Camera;
  finalCamera: Camera;
  /** Video layout and camera track for the scene's beats that don't set their own. */
  layout?: LayoutName;
  track?: string;
  ops: Op[];
  /** Elements first drawn while a spotlight is on (notes, circles): they stay bright above the dimming. */
  above: string[];
  beats: CompiledBeat[];
  duration: number;
}

export interface CompiledPresentation { title: string; scenes: CompiledScene[] }

export type CompileResult =
  | { ok: true; presentation: CompiledPresentation; source: Presentation }
  | { ok: false; errors: string[] };

const SHOW = { draw: 'draw', 'fade-in': 'fade', pop: 'pop' } as const;

function defaultDuration(action: Action, el?: CompiledElement): number {
  switch (action.do) {
    case 'draw':
      if (!el) return 1;
      if (el.type === 'text') return Math.min(2.2, Math.max(0.5, el.text.length * 0.06));
      if (el.type === 'arrow') return 0.8;
      if (el.type === 'ring') return 0.7;
      if (el.type === 'image') return el.frame === 'browser' ? 1.6 : 0.9;
      if (el.type === 'area') return 0;
      return 1.2;
    case 'fade-in':
    case 'fade-out':
      return 0.5;
    case 'pop':
      return 0.45;
    case 'erase':
      return 0.6;
    case 'pulse':
      return 0.5 * action.times;
    case 'move':
      return 1;
    case 'recolor':
      return 0.4;
    case 'circle':
      return 0.7;
    case 'rotate':
    case 'explode':
    case 'set-values':
      return 1.2;
    case 'spin':
      return 0;
    case 'camera':
      return 1.3;
    case 'wait':
      return 1;
    case 'spotlight':
      return 0.6;
    case 'flow':
      return 0;
  }
}

const isPositioned = (el: CompiledElement): el is Exclude<CompiledElement, { type: 'arrow' }> => el.type !== 'arrow';

/** A round number a little above `v`: 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8 times a power of ten. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const target = v * 1.05;
  const exp = 10 ** Math.floor(Math.log10(target));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * exp >= target) return m * exp;
  return 10 * exp;
}

export function compile(input: unknown): CompileResult {
  const parsed = Presentation.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  const source = parsed.data;
  const errors: string[] = [];
  const scenes: CompiledScene[] = [];

  source.scenes.forEach((scene, si) => {
    try {
      compileScene(scene, si);
    } catch (e) {
      // Errors are reported, never thrown: an LLM gets them back as a list it can fix.
      errors.push(`scenes.${si}: ${(e as Error).message}`);
    }
  });

  function compileScene(scene: Presentation['scenes'][number], si: number) {
    const where = `scenes.${si}`;
    const prev = scenes[si - 1];
    const elements: CompiledElement[] = [];
    const byId = new Map<string, CompiledElement>();
    const state: Record<string, ElementState> = {};

    if (scene.inherit && prev) {
      for (const el of prev.elements) {
        const s = prev.final[el.id];
        if (!s.visible) continue;
        const moved = isPositioned(el) ? { ...el, x: s.x, y: s.y } : el;
        const carried = { ...moved, color: s.color } as CompiledElement;
        elements.push(carried);
        byId.set(el.id, carried);
        state[el.id] = { ...s };
      }
    }

    // Elements revealed by a beat start hidden unless they say otherwise.
    const revealed = new Set<string>();
    for (const beat of scene.beats) {
      for (const a of beat.actions) {
        if (a.do in SHOW && 'target' in a && a.target) [a.target].flat().forEach((id) => revealed.add(id));
      }
    }

    scene.elements.forEach((el, ei) => {
      if (byId.has(el.id)) {
        errors.push(`${where}.elements.${ei}: id "${el.id}" is already used${state[el.id] ? ' (inherited from the previous scene)' : ''}`);
        return;
      }
      if (el.type === 'chart' && el.kind === 'pie' && el.data.every((d) => d.value === 0)) {
        errors.push(`${where}.elements.${ei}: a pie chart needs at least one value above 0`);
        return;
      }
      if (el.type === 'icon' && !icons[el.icon]) {
        errors.push(`${where}.elements.${ei}: unknown icon "${el.icon}" (see docs/library.md)`);
        return;
      }
      if (el.type === 'iso' && !el.parts?.length && !isoModels[el.model ?? '']) {
        errors.push(`${where}.elements.${ei}: ${el.model ? `unknown iso model "${el.model}"` : 'an iso element needs "model" or "parts"'} (see docs/library.md)`);
        return;
      }
      elements.push(el);
      byId.set(el.id, el);
      state[el.id] = {
        visible: el.visible ?? !revealed.has(el.id),
        x: 'x' in el ? el.x : 0,
        y: 'y' in el ? el.y : 0,
        color: el.color,
        flow: null,
        ...(el.type === 'iso' ? { iso: { rotate: el.rotate, explode: 0, spin: null } } : {}),
        ...(el.type === 'chart' ? { chart: { values: el.data.map((d) => d.value), max: el.max ?? 0 } } : {}),
      };
    });

    const lookup = (id: string) => byId.get(id);
    for (const [ei, el] of scene.elements.entries()) {
      if (el.type !== 'arrow' || byId.get(el.id) !== el) continue;
      try {
        fullBox(el, lookup);
      } catch (e) {
        errors.push(`${where}.elements.${ei} (${el.id}): ${(e as Error).message}`);
        // Leave the broken arrow out so later steps (framing, circles) don't trip over it.
        elements.splice(elements.indexOf(el), 1);
        byId.delete(el.id);
        delete state[el.id];
      }
    }

    const initial = structuredClone(state);
    const startCamera: Camera = scene.camera ?? (scene.inherit && prev ? prev.finalCamera : DEFAULT_CAMERA);
    let camera = startCamera;
    /** The light on the board, if a spotlight is on. Every scene starts without one. */
    let spotlight: Spotlight | null = null;
    const ops: Op[] = [];
    const beats: CompiledBeat[] = [];
    let time = 0;
    let rings = 0;

    /** Current box of an element, following moves. */
    const boxOf = (id: string): Box => {
      const el = byId.get(id)!;
      const s = state[id];
      const shifted = isPositioned(el) ? ({ ...el, x: s.x, y: s.y } as CompiledElement) : el;
      return fullBox(shifted, lookup);
    };

    scene.beats.forEach((beat, bi) => {
      const beatStart = time;
      let prevStart = beatStart;
      let prevEnd = beatStart;
      let beatEnd = beatStart;
      const timing: CompiledBeat['actions'] = [];

      beat.actions.forEach((action, ai) => {
        const at = `${where}.beats.${bi}.actions.${ai}`;
        const start = (action.start === 'with' ? prevStart : prevEnd) + action.delay;
        let end = start;

        const targets: string[] = 'target' in action && action.target ? [action.target].flat() : [];
        const missing = targets.filter((id) => !byId.has(id));
        if (missing.length) {
          errors.push(`${at}: unknown element ${missing.map((m) => `"${m}"`).join(', ')}`);
          return;
        }

        const each = (fn: (id: string, t: number, el: CompiledElement) => number) => {
          const stagger = 'stagger' in action ? action.stagger : 0;
          targets.forEach((id, i) => {
            const t = start + i * stagger;
            end = Math.max(end, t + fn(id, t, byId.get(id)!));
          });
        };
        const dur = (el?: CompiledElement) => action.duration ?? defaultDuration(action, el);

        switch (action.do) {
          case 'draw':
          case 'fade-in':
          case 'pop':
            each((id, t, el) => {
              const d = dur(el);
              ops.push({ kind: 'show', id, mode: SHOW[action.do], t, dur: d });
              state[id].visible = true;
              return d;
            });
            break;
          case 'fade-out':
          case 'erase':
            each((id, t, el) => {
              const d = dur(el);
              ops.push({ kind: 'hide', id, mode: action.do === 'erase' ? 'erase' : 'fade', t, dur: d });
              state[id].visible = false;
              if (state[id].flow) {
                ops.push({ kind: 'flow', id, from: state[id].flow, to: null, t: t + d });
                state[id].flow = null;
              }
              return d;
            });
            break;
          case 'pulse':
            each((id, t, el) => {
              const d = dur(el);
              ops.push({ kind: 'pulse', id, times: action.times, t, dur: d });
              return d;
            });
            break;
          case 'move':
            each((id, t, el) => {
              if (!isPositioned(el)) {
                errors.push(`${at}: arrows cannot be moved; move what they point at instead`);
                return 0;
              }
              const d = dur(el);
              const s = state[id];
              ops.push({ kind: 'move', id, from: { x: s.x, y: s.y }, to: action.to, t, dur: d });
              s.x = action.to.x;
              s.y = action.to.y;
              return d;
            });
            break;
          case 'recolor':
            each((id, t, el) => {
              const d = dur(el);
              ops.push({ kind: 'recolor', id, from: state[id].color, to: action.color, t, dur: d });
              state[id].color = action.color;
              return d;
            });
            break;
          case 'flow':
            each((id, t, el) => {
              if (el.type !== 'arrow') {
                errors.push(`${at}: flow only works on arrows, "${id}" is a ${el.type}`);
                return 0;
              }
              const to = action.on ? { reverse: action.reverse, speed: action.speed } : null;
              ops.push({ kind: 'flow', id, from: state[id].flow, to, t });
              state[id].flow = to;
              return action.duration ?? 0;
            });
            break;
          case 'set-values':
            each((id, t, el) => {
              const chart = state[id].chart;
              if (el.type !== 'chart' || !chart) {
                errors.push(`${at}: set-values only works on charts, "${id}" is a ${el.type}`);
                return 0;
              }
              if (action.values.length !== chart.values.length) {
                errors.push(`${at}: "${id}" has ${chart.values.length} data items but got ${action.values.length} values`);
                return 0;
              }
              const d = dur(el);
              ops.push({ kind: 'values', id, from: [...chart.values], to: [...action.values], t, dur: d });
              chart.values = [...action.values];
              return d;
            });
            break;
          case 'rotate':
          case 'explode':
          case 'spin':
            each((id, t, el) => {
              const iso = state[id].iso;
              if (el.type !== 'iso' || !iso) {
                errors.push(`${at}: ${action.do} only works on iso elements, "${id}" is a ${el.type}`);
                return 0;
              }
              if (action.do === 'spin') {
                const to = action.on ? action.speed : null;
                ops.push({ kind: 'spin', id, from: iso.spin, to, t });
                iso.spin = to;
                return action.duration ?? 0;
              }
              const d = dur(el);
              const from = { rotate: iso.rotate, explode: iso.explode };
              if (action.do === 'rotate') iso.rotate = action.to ?? iso.rotate + (action.by ?? 90);
              else iso.explode = action.amount;
              ops.push({ kind: 'iso', id, from, to: { rotate: iso.rotate, explode: iso.explode }, t, dur: d });
              return d;
            });
            break;
          case 'circle': {
            const box = union(targets.map(boxOf));
            const ring: RingElement = {
              type: 'ring',
              id: action.id ?? `${targets.join('-')}-circle${rings ? rings + 1 : ''}`,
              x: box.x + box.width / 2,
              y: box.y + box.height / 2,
              rx: box.width / 2 + Math.max(24, box.width * 0.12),
              ry: box.height / 2 + Math.max(16, box.height * 0.3),
              color: action.color,
            };
            rings++;
            if (byId.has(ring.id)) {
              errors.push(`${at}: id "${ring.id}" is already used`);
              break;
            }
            elements.push(ring);
            byId.set(ring.id, ring);
            state[ring.id] = { visible: true, x: ring.x, y: ring.y, color: ring.color, flow: null };
            initial[ring.id] = { ...state[ring.id], visible: false };
            const d = dur(ring);
            ops.push({ kind: 'show', id: ring.id, mode: 'draw', t: start, dur: d });
            end = start + d;
            break;
          }
          case 'camera': {
            let to: Camera;
            if (action.focus !== undefined) {
              const ids = action.focus === 'all'
                ? Object.keys(state).filter((id) => state[id].visible)
                : [action.focus].flat();
              const unknown = ids.filter((id) => !byId.has(id));
              if (unknown.length) {
                errors.push(`${at}: unknown element ${unknown.map((m) => `"${m}"`).join(', ')}`);
                return;
              }
              to = ids.length ? frameBox(union(ids.map(boxOf)), action.padding) : DEFAULT_CAMERA;
              if (action.zoom !== undefined) to.zoom = action.zoom;
            } else {
              to = { x: action.x ?? camera.x, y: action.y ?? camera.y, zoom: action.zoom ?? camera.zoom };
            }
            const d = dur();
            ops.push({ kind: 'camera', from: camera, to, t: start, dur: d });
            camera = to;
            end = start + d;
            break;
          }
          case 'spotlight': {
            let to: Spotlight | null = null;
            if (action.on) {
              const ids = targets.length ? targets : [];
              if (!ids.length) {
                errors.push(`${at}: spotlight needs a target (or "on": false to turn it off)`);
                return;
              }
              const box = union(ids.map(boxOf));
              const area = ids.length === 1 ? byId.get(ids[0]) : undefined;
              const p = action.padding;
              to = {
                x: box.x - p, y: box.y - p, width: box.width + 2 * p, height: box.height + 2 * p,
                shape: action.shape ?? (area?.type === 'area' ? area.shape : 'rect'),
                style: action.style, amount: action.amount,
              };
            }
            const d = dur();
            ops.push({ kind: 'spotlight', from: spotlight, to, t: start, dur: d });
            spotlight = to;
            end = start + d;
            break;
          }
          case 'wait':
            end = start + dur();
            break;
        }
        prevStart = start;
        prevEnd = end;
        beatEnd = Math.max(beatEnd, end);
        timing[ai] = { start: start - beatStart, end: end - beatStart };
      });

      beats.push({
        title: beat.title, notes: beat.notes, auto: beat.auto, start: beatStart, end: beatEnd,
        layout: beat.layout ?? scene.layout, track: beat.track ?? scene.track, cue: beat.cue,
        actions: Array.from({ length: beat.actions.length }, (_, i) => timing[i] ?? { start: 0, end: 0 }),
      });
      time = beatEnd;
    });

    // A chart's value axis covers every value it shows during the scene, so later set-values don't overflow.
    for (const el of elements) {
      if (el.type !== 'chart' || el.max !== undefined) continue;
      const seen = [...el.data.map((d) => d.value), ...(initial[el.id]?.chart?.values ?? []), ...ops.flatMap((o) => (o.kind === 'values' && o.id === el.id ? o.to : []))];
      for (const st of [initial, state]) if (st[el.id]?.chart) st[el.id].chart!.max = niceMax(Math.max(...seen));
    }

    scenes.push({
      id: scene.id,
      title: scene.title,
      elements,
      initial,
      final: structuredClone(state),
      camera: startCamera,
      layout: scene.layout,
      track: scene.track,
      finalCamera: camera,
      ops,
      beats,
      duration: time,
      above: drawnInSpotlight(ops),
    });
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, presentation: { title: source.title, scenes }, source };
}

/** Elements whose first appearance happens while a spotlight is on. */
export function drawnInSpotlight(ops: Op[]): string[] {
  const lights = ops.filter((o): o is Extract<Op, { kind: 'spotlight' }> => o.kind === 'spotlight').sort((a, b) => a.t - b.t);
  const onAt = (t: number) => {
    let on = false;
    for (const l of lights) if (l.t <= t + 1e-6) on = l.to !== null;
    return on;
  };
  const seen = new Set<string>();
  const above: string[] = [];
  for (const o of [...ops].sort((a, b) => a.t - b.t)) {
    if (o.kind !== 'show' || seen.has(o.id)) continue;
    seen.add(o.id);
    if (onAt(o.t)) above.push(o.id);
  }
  return above;
}
