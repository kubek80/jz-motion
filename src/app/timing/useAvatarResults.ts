import { useEffect, useMemo, useRef } from 'react';
import type { Clip, Voiceover } from '../../engine/schema';
import type { RawDoc } from '../editor/doc';
import { avatarRows } from './AvatarLane';
import { onAvatarDone, setCast, useAvatarJobs } from './avatarJobs';
import { onStudioDone, type StudioShot } from './studioJobs';

/**
 * Timing's avatar videos, made in the background: each put on its clip (and the pieces it was cut into) when it's
 * ready, without stopping playback (avatarJobs.ts); a podcast's studio wide shots put on the timeline in place of any
 * they overlap (studioJobs.ts); the studio picture and its sharpness into the latest presentation (`onStudio`).
 * Returns the video lane's rows too.
 */
export function useAvatarResults({ clips, doc, onVoiceover, onDoc }: { clips: Clip[]; doc: RawDoc; onVoiceover: (v: Voiceover | undefined) => void; onDoc: (next: unknown) => void }) {
  const jobs = useAvatarJobs();
  const avatars = useMemo(() => avatarRows(clips, doc, jobs), [clips, doc, jobs]);
  const latest = useRef({ clips, onVoiceover, doc, onDoc });
  latest.current = { clips, onVoiceover, doc, onDoc };
  useEffect(() => onAvatarDone((clipId, a) => {
    const cs = latest.current.clips;
    const c = cs.find((x) => x.id === clipId);
    if (!c) return false;
    const next = cs.map((x) => (x.id === clipId || (x.upload === c.upload && x.trimStart >= a.trimStart - 0.05 && x.trimEnd <= a.trimEnd + 0.05) ? { ...x, avatar: a } : x));
    latest.current.onVoiceover({ clips: next });
    return true;
  }), []);
  useEffect(() => onStudioDone((shot: StudioShot) => {
    const { doc: d, onDoc: put } = latest.current;
    const kept = (d.voiceover?.studio ?? []).filter((s) => !(s.offset < shot.offset + shot.length - 0.05 && s.offset + s.length > shot.offset + 0.05));
    put({ ...d, voiceover: { ...d.voiceover, studio: [...kept, shot].sort((a, b) => a.offset - b.offset) } });
    return true;
  }), []);
  // A podcast's speakers each have their own avatar: the avatar jobs need to know whose is whose.
  setCast(doc.cast);
  const onStudio = (studio: NonNullable<RawDoc['studio']>) => latest.current.onDoc({ ...latest.current.doc, studio });
  return { avatars, onStudio };
}
