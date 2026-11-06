import type { ColorName } from './palette';
import type { Camera, Element, LayoutName, Point, Presentation } from './schema';

// The compiled plan's types: per scene, its elements, their start and end states, the ops on its timeline
// and its beats. compile.ts produces it; the board renders it.

/** Highlight ellipse created by a "circle" action. */
export interface RingElement { type: 'ring'; id: string; x: number; y: number; rx: number; ry: number; color: ColorName; pinned?: boolean }

/** On the screen rather than the board (see `pinned` in the schema). */
export const isPinned = (el?: { pinned?: boolean }) => !!el?.pinned;
export type CompiledElement = Element | RingElement;

export interface ElementState {
  visible: boolean;
  x: number;
  y: number;
  color: ColorName;
  flow: { reverse: boolean; speed: number } | null;
  /** Only for iso elements. */
  iso?: { rotate: number; explode: number; spin: number | null };
  /** Only for images: playing speed of an animated picture (null: paused). */
  play?: number | null;
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
  | { kind: 'spotlight'; from: Spotlight | null; to: Spotlight | null; t: number; dur: number }
  | { kind: 'play'; id: string; from: number | null; to: number | null; seek?: number; t: number };

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

export const isPositioned = (el: CompiledElement): el is Exclude<CompiledElement, { type: 'arrow' }> => el.type !== 'arrow';
