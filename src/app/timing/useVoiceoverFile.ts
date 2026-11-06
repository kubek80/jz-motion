// Loading a voice-over file into the Timing window (upload it, read its length) and making a take
// for export from the current timing, with every clip as its own audio track.
import type { Clip, Voiceover } from '../../engine/schema';
import type { Performance } from '../../video/performance';

interface Options {
  clips: Clip[];
  perf: Performance;
  /** The presentation as saved (for the take). */
  text: string;
  presentationId: string;
  onVoiceover: (v: Voiceover | undefined) => void;
  onTake: (id: string) => void;
  seek: (t: number) => void;
  setPps: (pps: number) => void;
  setBusy: (b: string | null) => void;
  setError: (e: string | null) => void;
}

export function useVoiceoverFile({ clips, perf, text, presentationId, onVoiceover, onTake, seek, setPps, setBusy, setError }: Options) {
  // ---------------------------------------------------------------- voice-over file, take
  const loadVoiceover = async (file: File) => {
    setBusy('Uploading…');
    setError(null);
    try {
      const url = URL.createObjectURL(file);
      const duration = await new Promise<number>((resolve, reject) => {
        const a = new Audio();
        a.preload = 'metadata';
        a.onloadedmetadata = () => resolve(a.duration);
        a.onerror = () => reject(new Error('could not read that file as audio'));
        a.src = url;
      });
      URL.revokeObjectURL(url);
      const ext = (file.name.split('.').pop() ?? 'mp3').toLowerCase();
      const res = await fetch(`/api/uploads?ext=${ext}`, { method: 'POST', body: file });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
      const { upload } = await res.json();
      onVoiceover({ upload, duration: Math.round(duration * 100) / 100, name: file.name });
      seek(0);
      setPps(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const makeTake = async () => {
    // Every clip becomes its own audio track on the take; the exporter trims each via `atrim` and
    // positions it with `adelay`, then mixes with `amix`. The take's presentation is persisted as
    // it is, so the per-clip arrangement is reproducible from the take alone.
    if (!clips.length) return;
    setBusy('Making the take…');
    setError(null);
    try {
      const doc = JSON.parse(text);
      const take = await (await fetch('/api/takes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: `${doc.title} · voice-over`, performance: perf, presentation: doc, presentationId }),
      })).json();
      for (let i = 0; i < clips.length; i++) {
        const c = clips[i];
        const trackName = `voice-${i}`;
        const params = new URLSearchParams({
          from: c.upload,
          copy: '1',
          offset: String(c.offset),
          trimStart: String(c.trimStart),
          trimEnd: String(c.trimEnd),
        });
        const res = await fetch(`/api/takes/${take.id}/tracks/${trackName}?${params.toString()}`, { method: 'PUT' });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
      }
      onTake(take.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return { loadVoiceover, makeTake };
}
