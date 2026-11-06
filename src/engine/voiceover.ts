import type { Clip, Voiceover } from './schema';

/**
 * Normalise either voiceover shape to a flat Clip[]. Legacy `{upload, duration, name}` becomes a
 * single clip at offset 0 on lane 0. An empty or missing voiceover returns [].
 *
 * Nothing mutates the source: the returned clips are the ones the UI edits and persists. Writing
 * them back as `{clips}` in the new multi-clip form supersedes the legacy fields.
 */
export function clipsOf(v: Voiceover | undefined): Clip[] {
  if (!v) return [];
  if (v.clips && v.clips.length > 0) return v.clips;
  if (v.upload && v.duration) {
    return [{
      id: 'legacy',
      upload: v.upload,
      sourceDuration: v.duration,
      offset: 0,
      lane: 0,
      trimStart: 0,
      trimEnd: v.duration,
      name: v.name,
    }];
  }
  return [];
}

/** Seconds the whole clip arrangement spans (max of each clip's end). 0 for empty. */
export function clipsDuration(clips: Clip[]): number {
  let end = 0;
  for (const c of clips) end = Math.max(end, c.offset + (c.trimEnd - c.trimStart));
  return end;
}

/** Return the clip (and its index) under `t` on `lane`, if any. */
export function clipAt(clips: Clip[], lane: number, t: number): { clip: Clip; index: number } | null {
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    if (c.lane !== lane) continue;
    const end = c.offset + (c.trimEnd - c.trimStart);
    if (t >= c.offset && t < end) return { clip: c, index: i };
  }
  return null;
}
