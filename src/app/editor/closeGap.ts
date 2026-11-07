import type { Clip } from '../../engine/schema';
import { clipsOf } from '../../engine/voiceover';
import type { Click } from '../../video/performance';
import type { RawDoc } from './doc';

// Deleting a scene from a timed presentation, like a ripple delete in a video editor: the time the scene
// took on the timeline (from its first beat to the next scene's first beat) is taken out. Later beats with a
// cue move earlier by that much, and the narration recorded over the scene is cut out of the voice clips
// (clips are trimmed or split, later ones move earlier), so the words still line up with their beats.

export interface Gap { start: number; end: number }

/** The stretch of timeline scene `si` takes, when deleting it would leave a hole (later beats have cues). */
export function sceneGap(clicks: Click[], si: number): Gap | undefined {
  const own = clicks.filter((c) => c.scene === si);
  const next = clicks.find((c) => c.scene > si);
  if (!own.length || !next) return undefined;
  // Beats without a cue follow the one before them, so they close up by themselves; cued ones would stay put.
  if (!clicks.some((c) => c.scene > si && c.cued)) return undefined;
  const start = Math.min(...own.map((c) => c.t));
  return next.t > start + 1e-3 ? { start, end: next.t } : undefined;
}

/** Cuts `gap` out of the voice clips: what lies after it moves earlier, what lies in it goes. */
export function cutClips(clips: Clip[], gap: Gap): Clip[] {
  const len = gap.end - gap.start;
  return clips.flatMap((c): Clip[] => {
    const from = c.offset;
    const to = c.offset + (c.trimEnd - c.trimStart);
    if (to <= gap.start + 1e-6) return [c];
    if (from >= gap.end - 1e-6) return [{ ...c, offset: from - len }];
    const keepLeft = from < gap.start - 0.05;
    const keepRight = to > gap.end + 0.05;
    const left: Clip = { ...c, trimEnd: c.trimStart + (gap.start - from) };
    const right: Clip = { ...c, id: keepLeft ? `${c.id}-after` : c.id, offset: gap.start, trimStart: c.trimStart + (gap.end - from) };
    return [...(keepLeft ? [left] : []), ...(keepRight ? [right] : [])];
  });
}

/** The presentation with scene `si`'s time taken out of later cues and the narration (the scene itself is not removed here). */
export function closeGap(doc: RawDoc, si: number, gap: Gap): RawDoc {
  const len = gap.end - gap.start;
  const scenes = doc.scenes.map((s, i) => (i <= si ? s : {
    ...s,
    beats: s.beats?.map((b) => (b.cue === undefined ? b : { ...b, cue: Math.max(0, Math.round((b.cue - len) * 1000) / 1000) })),
  }));
  const clips = clipsOf(doc.voiceover as Parameters<typeof clipsOf>[0]);
  return { ...doc, scenes, ...(clips.length ? { voiceover: { clips: cutClips(clips, gap) } } : {}) };
}
