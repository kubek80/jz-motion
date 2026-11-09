import type { Raw } from './doc';

// Every action a beat can run, in plain words: how it looks in the storyboard (symbol, verb, colour family),
// what it does, what it can be used on, and what a new one starts with. Used by "+ action", the storyboard
// and the action's properties.

export type Family = 'reveal' | 'hide' | 'attention' | 'motion' | 'camera' | 'data' | 'wait';

export interface ActionInfo {
  icon: string;
  label: string;
  family: Family;
  /** One line: what it does. */
  does: string;
  /** Which element types it works on; undefined: any. `null`: it needs no target. */
  on?: string[] | null;
  /** Shown when the selected elements are the wrong kind. */
  onNote?: string;
}

export const ACTIONS: Record<string, ActionInfo> = {
  draw: { icon: '✎', label: 'Draw', family: 'reveal', does: 'Draws it stroke by stroke, like a marker' },
  'fade-in': { icon: '◐', label: 'Fade in', family: 'reveal', does: 'Makes it appear gently' },
  pop: { icon: '✦', label: 'Pop in', family: 'reveal', does: 'Makes it appear with a little bounce' },
  'fade-out': { icon: '◑', label: 'Fade out', family: 'hide', does: 'Makes it disappear gently (circles around it go too)' },
  erase: { icon: '⌫', label: 'Erase', family: 'hide', does: 'Wipes it off with a blur (circles around it go too)' },
  pulse: { icon: '◉', label: 'Pulse', family: 'attention', does: 'Grows and shrinks to catch the eye' },
  circle: { icon: '○', label: 'Circle', family: 'attention', does: 'Draws a loop around it; it stays until it is faded out' },
  recolor: { icon: '●', label: 'Recolour', family: 'attention', does: 'Changes its marker colour' },
  spotlight: { icon: '◎', label: 'Spotlight', family: 'camera', on: undefined, does: 'Darkens everything else; with nothing chosen, turns the spotlight off' },
  camera: { icon: '⌖', label: 'Camera', family: 'camera', on: undefined, does: 'Moves the view to frame it (or everything)' },
  move: { icon: '➜', label: 'Move', family: 'motion', does: 'Slides it to another place on the board' },
  flow: { icon: '⇢', label: 'Flow', family: 'motion', on: ['arrow'], onNote: 'arrows', does: 'Sends dots along an arrow until turned off' },
  // "Go to frame" and "Play to frame" are a play with `goto` or `until`; offered (and shown) as actions of their own.
  'goto-frame': { icon: '⏭', label: 'Go to frame', family: 'motion', on: ['image'], onNote: 'recordings', does: 'Jumps to one frame of a recording and holds it, with a cross-fade if you like' },
  'play-to-frame': { icon: '⏩', label: 'Play to frame', family: 'motion', on: ['image'], onNote: 'recordings', does: 'Plays a recording on from where it is and stops on a frame' },
  play: { icon: '▶', label: 'Play', family: 'motion', on: ['image'], onNote: 'recordings', does: 'Plays a recording, goes to one of its frames (with a fade if you like), or plays on to a frame and stops' },
  rotate: { icon: '↻', label: 'Rotate', family: 'motion', on: ['iso'], onNote: '3D models', does: 'Turns a 3D model' },
  spin: { icon: '⟳', label: 'Spin', family: 'motion', on: ['iso'], onNote: '3D models', does: 'Keeps a 3D model turning until stopped' },
  explode: { icon: '✺', label: 'Explode', family: 'motion', on: ['iso'], onNote: '3D models', does: 'Pulls a 3D model apart to show its layers' },
  'set-values': { icon: '▤', label: 'New values', family: 'data', on: ['chart'], onNote: 'charts', does: 'Animates a chart to new numbers' },
  wait: { icon: '⋯', label: 'Pause', family: 'wait', on: null, does: 'Waits before the next action' },
  avatar: { icon: '🧑', label: 'Move my avatar', family: 'camera', on: null, does: 'Moves your avatar in the video: hidden, a corner, side by side or full frame, gliding there' },
};

/** "+ action" sections, in the order people reach for them. */
export const GROUPS: { title: string; kinds: string[] }[] = [
  { title: 'Bring in', kinds: ['draw', 'fade-in', 'pop'] },
  { title: 'Take away', kinds: ['fade-out', 'erase'] },
  { title: 'Point at', kinds: ['circle', 'pulse', 'recolor', 'spotlight'] },
  { title: 'View', kinds: ['camera'] },
  { title: 'Move and play', kinds: ['move', 'play', 'goto-frame', 'play-to-frame', 'flow', 'rotate', 'spin', 'explode'] },
  { title: 'Data and timing', kinds: ['set-values', 'wait', 'avatar'] },
];

export const actionInfo = (kind: string): ActionInfo => ACTIONS[kind] ?? { icon: '•', label: kind, family: 'wait', does: '' };

/** The kind an action is shown as: a play with `goto` (and no `until`) is "Go to frame", with `until` "Play to frame". */
export const kindOf = (a: Raw): string => (a.do !== 'play' ? String(a.do) : a.until !== undefined ? 'play-to-frame' : a.goto !== undefined ? 'goto-frame' : 'play');

/** How an action reads in the storyboard and its properties: "Go to frame 4", "Play to frame 9", or the kind's name. */
export function describeAction(a: Raw): ActionInfo {
  const kind = kindOf(a);
  const info = actionInfo(kind);
  if (kind === 'goto-frame') return { ...info, label: `Go to frame ${a.goto}${a.fade ? ', fading' : ''}` };
  if (kind === 'play-to-frame') return { ...info, label: `Play to frame ${a.until}` };
  return info;
}

/** Actions that need something chosen on the board (camera and spotlight work without). */
export const needsTarget = (kind: string) => actionInfo(kind).on !== null && kind !== 'camera' && kind !== 'spotlight';

/** Why `kind` can't be added for these elements, or null when it can. */
export function cannotAdd(kind: string, picked: string[], types: Record<string, string>): string | null {
  const info = actionInfo(kind);
  if (!needsTarget(kind)) return null;
  if (!picked.length) return 'Select something on the board first';
  if (info.on) {
    const wrong = picked.filter((id) => !info.on!.includes(types[id]));
    if (wrong.length) return `Only for ${info.onNote}`;
  }
  if (kind === 'move' && picked.some((id) => types[id] === 'arrow')) return 'Arrows follow what they connect; move that instead';
  return null;
}

/** A new action of `kind` for the selected elements, with values that work straight away. */
export function newAction(kind: string, picked: string[], data?: (id: string) => number[] | undefined): Raw {
  const target = picked.length === 1 ? picked[0] : picked;
  switch (kind) {
    case 'camera': return { do: 'camera', focus: picked.length ? target : 'all' };
    case 'move': return { do: 'move', target, to: { x: 960, y: 540 } };
    case 'wait': return { do: 'wait', duration: 1 };
    case 'avatar': return { do: 'avatar', layout: 'camera', duration: 0.8 };
    case 'spotlight': return picked.length ? { do: 'spotlight', target } : { do: 'spotlight', on: false };
    case 'recolor': return { do: 'recolor', target, color: 'yellow' };
    case 'rotate': return { do: 'rotate', target, by: 90 };
    case 'set-values': return { do: 'set-values', target, values: (data?.(picked[0]) ?? [1]).map((v) => Math.round(v * 1.5 * 100) / 100) };
    case 'goto-frame': return { do: 'play', target, goto: 1 };
    case 'play-to-frame': return { do: 'play', target, until: 2 };
    default: return { do: kind, target };
  }
}
