import { DEFAULT_CAMERA, frameBox, union, type Box } from './geometry';
import { isPinned, isPositioned, type CompiledElement, type ElementState, type Op, type RingElement, type Spotlight } from './compileTypes';
import type { Action, Camera } from './schema';

// One action of a beat turned into timed ops, updating the scene's running state (what is visible, where things
// are, the camera, the spotlight). Called by compile() for each action in order.

export const SHOW = { draw: 'draw', 'fade-in': 'fade', pop: 'pop' } as const;

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
    case 'avatar':
      return 0.8;
    case 'spotlight':
      return 0.6;
    case 'play':
      return 0;
    case 'flow':
      return 0;
  }
}

/**
 * How long an instant switch (flow, spin, play on or off) takes: just long enough that a beat ending on one
 * stops after it rather than exactly on it, so the switch has happened when the beat is shown.
 */
const SWITCH = 0.002;

/** What an action needs to know about its scene, and the scene state it updates. */
export interface ActionContext {
  action: Action;
  /** Where the action is, for error messages ("scenes.0.beats.2.actions.1"). */
  at: string;
  start: number;
  targets: string[];
  state: Record<string, ElementState>;
  initial: Record<string, ElementState>;
  byId: Map<string, CompiledElement>;
  elements: CompiledElement[];
  ops: Op[];
  errors: string[];
  /** Current box of an element, following moves. */
  boxOf: (id: string) => Box;
  /** Scene-wide state the actions change: the camera, the spotlight, how many circles were drawn. */
  sc: { camera: Camera; spotlight: Spotlight | null; rings: number };
}

/** Adds the action's ops and returns when it ends, or null when it can't be compiled (its errors are recorded). */
export function compileAction(c: ActionContext): number | null {
  const { action, at, start, targets, state, initial, byId, elements, ops, errors, boxOf, sc } = c;
  let end = start;
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
        // Something already off the board stays off (fading it would flash it in first).
        if (!state[id].visible) return 0;
        // Circles drawn around it leave with it.
        const rings = elements.filter((r) => r.type === 'ring' && r.around.includes(id) && state[r.id]?.visible).map((r) => r.id);
        for (const hid of [id, ...rings]) {
          ops.push({ kind: 'hide', id: hid, mode: action.do === 'erase' ? 'erase' : 'fade', t, dur: d });
          state[hid].visible = false;
        }
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
        return Math.max(action.duration ?? 0, SWITCH);
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
          return Math.max(action.duration ?? 0, SWITCH);
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
      const pinnedTargets = targets.filter((id) => isPinned(byId.get(id)));
      if (pinnedTargets.length && pinnedTargets.length < targets.length) {
        errors.push(`${at}: one circle can't go around things fixed on the screen and things on the board together`);
        return null;
      }
      const box = union(targets.map(boxOf));
      const ring: RingElement = {
        type: 'ring',
        id: action.id ?? `${targets.join('-')}-circle${sc.rings ? sc.rings + 1 : ''}`,
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
        rx: box.width / 2 + Math.max(24, box.width * 0.12),
        ry: box.height / 2 + Math.max(16, box.height * 0.3),
        color: action.color,
        around: targets,
        ...(pinnedTargets.length ? { pinned: true } : {}),
      };
      sc.rings++;
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
        // Things fixed on the screen aren't on the board, so the camera doesn't frame them.
        const ids = action.focus === 'all'
          ? Object.keys(state).filter((id) => state[id].visible && !isPinned(byId.get(id)))
          : [action.focus].flat();
        const unknown = ids.filter((id) => !byId.has(id));
        if (unknown.length) {
          errors.push(`${at}: unknown element ${unknown.map((m) => `"${m}"`).join(', ')}`);
          return null;
        }
        const onScreen = ids.filter((id) => isPinned(byId.get(id)));
        if (onScreen.length) {
          errors.push(`${at}: ${onScreen.map((m) => `"${m}"`).join(', ')} ${onScreen.length === 1 ? 'is' : 'are'} fixed on the screen ("pinned"), so the camera can't move to ${onScreen.length === 1 ? 'it' : 'them'}`);
          return null;
        }
        to = ids.length ? frameBox(union(ids.map(boxOf)), action.padding) : DEFAULT_CAMERA;
        if (action.zoom !== undefined) to.zoom = action.zoom;
      } else {
        to = { x: action.x ?? sc.camera.x, y: action.y ?? sc.camera.y, zoom: action.zoom ?? sc.camera.zoom };
      }
      const d = dur();
      ops.push({ kind: 'camera', from: sc.camera, to, t: start, dur: d });
      sc.camera = to;
      end = start + d;
      break;
    }
    case 'play':
      each((id, t, el) => {
        if (el.type !== 'image') {
          errors.push(`${at}: play only works on (animated) images, "${id}" is a ${el.type}`);
          return 0;
        }
        if (action.until !== undefined && action.goto !== undefined && action.until < action.goto) {
          errors.push(`${at}: "until" (frame ${action.until}) comes before "goto" (frame ${action.goto}); a recording only plays forwards`);
          return 0;
        }
        if (action.fade && action.goto === undefined) {
          errors.push(`${at}: "fade" cross-fades to a new frame, so it needs "goto"`);
          return 0;
        }
        // A jump to a frame stays there unless it is told to play (or to play on to another frame).
        const on = action.until !== undefined || (action.on ?? action.goto === undefined);
        const to = on ? action.speed : null;
        const fade = action.fade ? action.duration ?? 0.5 : undefined;
        const arriveIn = action.until !== undefined && action.duration ? action.duration : undefined;
        ops.push({
          kind: 'play', id, from: state[id].play ?? null, to, t,
          ...(action.goto !== undefined ? { seekFrame: action.goto - 1 } : action.from !== undefined ? { seek: action.from } : {}),
          ...(action.until !== undefined ? { untilFrame: action.until - 1 } : {}),
          ...(arriveIn ? { arriveIn } : {}),
          ...(fade ? { fade } : {}),
        });
        // Once it reaches `until` it holds still; later plays start from there.
        state[id].play = action.until !== undefined ? null : to;
        return Math.max(fade ?? arriveIn ?? action.duration ?? 0, SWITCH);
      });
      break;
    case 'spotlight': {
      let to: Spotlight | null = null;
      if (targets.some((id) => isPinned(byId.get(id)))) {
        errors.push(`${at}: a spotlight lights part of the board; things fixed on the screen ("pinned") are always lit`);
        return null;
      }
      if (action.on) {
        const ids = targets.length ? targets : [];
        if (!ids.length) {
          errors.push(`${at}: spotlight needs a target (or "on": false to turn it off)`);
          return null;
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
      ops.push({ kind: 'spotlight', from: sc.spotlight, to, t: start, dur: d });
      sc.spotlight = to;
      end = start + d;
      break;
    }
    case 'wait':
    case 'avatar':
      // Nothing on the board: a pause (the avatar's glide is drawn over the board, see src/video/avatarPlan.ts).
      end = start + dur();
      break;
  }
  return end;
}
