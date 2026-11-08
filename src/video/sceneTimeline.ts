// Recordings that belong to scenes. A voice clip can name its scene (`scene` on the clip); its beats' cues and its
// clips then move together with the scene: when scenes are moved, added, deleted, left out or put back, the scenes
// that play are laid out again in their order, each keeping its own timing inside, the pauses between them kept.

export interface TimedClip { id: string; offset: number; trimStart: number; trimEnd: number; scene?: string; [k: string]: unknown }
export interface TimedScene { id: string; skip?: boolean; beats?: { cue?: number; [k: string]: unknown }[]; [k: string]: unknown }
export interface TimedDoc { scenes: TimedScene[]; voiceover?: { clips: TimedClip[]; [k: string]: unknown }; [k: string]: unknown }

const GAP = 0.8;
const r = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const end = (c: TimedClip) => c.offset + (c.trimEnd - c.trimStart);

/** Where a scene sits on the timeline, from its own cues and clips; null when it has neither. */
export function sceneSpan(doc: TimedDoc, sceneId: string): { start: number; end: number } | null {
  const s = doc.scenes.find((x) => x.id === sceneId);
  if (!s) return null;
  const cues = (s.beats ?? []).flatMap((b) => (b.cue !== undefined ? [b.cue] : []));
  const clips = (doc.voiceover?.clips ?? []).filter((c) => c.scene === sceneId);
  if (!cues.length && !clips.length) return null;
  const start = Math.min(...cues, ...clips.map((c) => c.offset));
  // Its end: where its narration ends, or a little after its last cue.
  return { start, end: Math.max(...clips.map(end), ...cues.map((c) => c + 1)) };
}

const playing = (doc: TimedDoc) => doc.scenes.filter((s) => !s.skip).map((s) => s.id);
export const hasBoundClips = (doc: TimedDoc) => !!doc.voiceover?.clips.some((c) => c.scene);

/**
 * `next` laid out as its scenes now play: each playing scene with a span starts where the one before ends plus
 * the pause it had after it in `prev` (a scene coming back gets a short pause), and its cues and clips move with it. Nothing changes
 * when the scenes that play, and their order, are the same as before.
 */
export function layoutScenes(prev: TimedDoc, next: TimedDoc, length: (sceneId: string) => number = () => 0): TimedDoc {
  const order = playing(next);
  const before = playing(prev);
  if (order.length === before.length && order.every((id, i) => id === before[i])) return next;
  // The pause after each scene, as it was.
  const pause = new Map<string, number>();
  before.forEach((id, i) => {
    const a = sceneSpan(prev, id);
    const nextId = before.slice(i + 1).find((x) => sceneSpan(prev, x));
    const b = nextId ? sceneSpan(prev, nextId) : null;
    if (a && b) pause.set(id, Math.max(0.3, b.start - a.end));
  });
  const shift = new Map<string, number>();
  // The timeline starts where it started.
  const firstBefore = before.map((id) => sceneSpan(prev, id)).find(Boolean);
  let cursor: number | null = firstBefore ? firstBefore.start : null;
  for (const id of order) {
    const span = sceneSpan(next, id);
    if (!span) { if (cursor !== null) cursor += length(id) + GAP; continue; }
    if (cursor === null) cursor = span.start;
    shift.set(id, cursor - span.start);
    cursor += span.end - span.start + (pause.get(id) ?? GAP);
  }
  if ([...shift.values()].every((d) => Math.abs(d) < 1e-6)) return next;
  return {
    ...next,
    scenes: next.scenes.map((s) => {
      const d = shift.get(s.id);
      return d ? { ...s, beats: s.beats?.map((b) => (b.cue !== undefined ? { ...b, cue: r(b.cue + d, 2) } : b)) } : s;
    }),
    ...(next.voiceover ? { voiceover: { ...next.voiceover, clips: next.voiceover.clips.map((c) => { const d = c.scene ? shift.get(c.scene) : undefined; return d ? { ...c, offset: r(c.offset + d) } : c; }) } } : {}),
  };
}

/** Clips that belong to scenes left out of the video: kept, but not on the timeline while the scene is out. */
export function splitHidden(doc: TimedDoc): { shown: TimedClip[]; hidden: TimedClip[] } {
  const out = new Set(doc.scenes.filter((s) => s.skip).map((s) => s.id));
  const clips = doc.voiceover?.clips ?? [];
  return { shown: clips.filter((c) => !c.scene || !out.has(c.scene)), hidden: clips.filter((c) => c.scene && out.has(c.scene)) };
}

/** The playing scene a moment on the timeline belongs to: the last one that starts at or before it. */
export function sceneAt(doc: TimedDoc, t: number): string | undefined {
  let found: string | undefined;
  for (const id of playing(doc)) {
    const span = sceneSpan(doc, id);
    if (span && span.start <= t + 0.05) found = id;
  }
  return found;
}
