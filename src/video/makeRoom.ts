// Making room on a presentation's voice-over timeline: everything from `at` on (clips and cues) moves later by
// `length` seconds, and a clip that runs across `at` is split there. Used to put a scene's generated narration
// into a timed presentation without disturbing the timing of the rest.

export interface TimelineClip {
  id: string;
  upload: string;
  sourceDuration: number;
  offset: number;
  lane: 0 | 1;
  trimStart: number;
  trimEnd: number;
  name?: string;
  [key: string]: unknown;
}

interface TimedDoc {
  scenes: { beats: { cue?: number }[] }[];
  voiceover?: { clips: TimelineClip[] };
}

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

/** Moves clips and cues at or after `at` later by `length`; splits a clip running across `at` (`tag` names the new part). */
export function makeRoom(doc: TimedDoc, at: number, length: number, tag: string): void {
  const clips: TimelineClip[] = [];
  for (const c of doc.voiceover?.clips ?? []) {
    const end = c.offset + (c.trimEnd - c.trimStart);
    if (end <= at + 1e-6) clips.push(c);
    else if (c.offset >= at - 1e-6) clips.push({ ...c, offset: round(c.offset + length) });
    else {
      const cut = at - c.offset;
      clips.push({ ...c, trimEnd: round(c.trimStart + cut) });
      clips.push({ ...c, id: `${c.id}-after-${tag}`, trimStart: round(c.trimStart + cut), offset: round(at + length) });
    }
  }
  if (doc.voiceover) doc.voiceover.clips = clips.sort((a, b) => a.offset - b.offset || a.lane - b.lane);
  for (const s of doc.scenes) for (const b of s.beats) if (b.cue !== undefined && b.cue >= at - 1e-6) b.cue = round(b.cue + length, 2);
}

/** A lane with nothing on it between `from` and `to` (0 first), or null. */
export function freeLane(clips: TimelineClip[], from: number, to: number): 0 | 1 | null {
  for (const lane of [0, 1] as const) {
    if (!clips.some((c) => c.lane === lane && c.offset < to - 1e-6 && c.offset + (c.trimEnd - c.trimStart) > from + 1e-6)) return lane;
  }
  return null;
}
