// "Clean up voice" on a narration clip: the server makes a copy with the background noise removed (RNNoise,
// see server/cleanVoice.ts) and the clip switches to it, keeping its place and trims and remembering the
// original, so "Back to the original recording" can undo it at any time.
import { useRef } from 'react';
import type { Clip } from '../../engine/schema';

export function useCleanVoice(clips: Clip[], setClips: (next: Clip[]) => void, setBusy: (s: string | null) => void, setError: (s: string | null) => void) {
  // The clips as they are when the server answers (they may have been moved meanwhile).
  const latest = useRef(clips);
  latest.current = clips;

  const cleanClip = async (index: number) => {
    const c = clips[index];
    if (!c || c.cleanedFrom) return;
    setError(null);
    setBusy(`Cleaning up the voice in “${c.name ?? 'clip'}”…`);
    try {
      const res = await fetch(`/api/uploads/${encodeURIComponent(c.upload)}/clean`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      setClips(latest.current.map((x) => (x.id === c.id
        ? { ...x, upload: body.upload, cleanedFrom: x.upload, sourceDuration: Math.max(x.trimEnd, body.duration || x.sourceDuration) }
        : x)));
    } catch (e) {
      setError(`Could not clean up the voice: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const restoreClip = (index: number) => {
    const c = clips[index];
    if (!c?.cleanedFrom) return;
    const { cleanedFrom, ...rest } = c;
    setClips(clips.map((x) => (x.id === c.id ? { ...rest, upload: cleanedFrom } : x)));
  };

  return { cleanClip, restoreClip };
}
