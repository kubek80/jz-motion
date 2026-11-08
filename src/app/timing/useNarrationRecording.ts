// Recording narration with the script as a prompter: start/stop the microphone, place each beat's
// cue with → (or take it back with ←), hold the prompter still with Space, and add the finished
// recording as a new clip on the timeline. Also releases the mic and the audio graph on close.
import { micConstraints } from './micDevice';
import { useEffect, useState } from 'react';
import type { Clip } from '../../engine/schema';
import type { Click } from '../../video/performance';
import { log } from '../debug';
import type { Clock } from './useClock';

interface Options {
  clock: Clock;
  clips: Clip[];
  clicks: Click[];
  setClips: (next: Clip[]) => void;
  onCue: (scene: number, beat: number, cue: number | undefined) => void;
  onCues: (changes: { scene: number; beat: number; cue: number | undefined }[], clearOthers?: boolean) => void;
  setBusy: (b: string | null) => void;
  setError: (e: string | null) => void;
}

export function useNarrationRecording({ clock, clips, clicks, setClips, onCue, onCues, setBusy, setError }: Options) {
  const { rec, now, realNow, pause, mixer, silent, setTime } = clock;
  const [recPaused, setRecPaused] = useState(false);
  // ---------------------------------------------------------------- recording narration, with the script as a prompter
  const [recording, setRecording] = useState(false);
  const [recIndex, setRecIndex] = useState(0);
  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints() });
      pause();
      const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? { mimeType: 'audio/webm;codecs=opus' } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      // Snap the clip's timeline position to the same 0.05 s grid the cues use. Lane 0 if nothing
      // on lane 0 overlaps the start, else lane 1 (clips can still be moved afterwards).
      const clipOffset = Math.max(0, Math.round(now() * 20) / 20);
      const occupies = (c: Clip, t: number) => t >= c.offset && t < c.offset + (c.trimEnd - c.trimStart);
      const lane: 0 | 1 = clips.some((c) => c.lane === 0 && occupies(c, clipOffset)) ? 1 : 0;
      log('Timing.startRecording', { clipOffset, lane, existingClips: clips.length });
      rec.current = { recorder, stream, chunks, startedAt: performance.now(), pausedAt: null, pausedTotalMs: 0, clipOffset, lane };
      recorder.start(1000);
      // First recording on a fresh timing: pin click 0 to 0 so the narrator doesn't need to press
      // → to place it. On later recordings the existing cues are kept — → only places new ones
      // from the clicks after the current playhead onwards.
      if (!clips.length && clicks[0]) onCues([{ scene: clicks[0].scene, beat: clicks[0].beat, cue: 0 }], true);
      // Start recIndex at the last click whose cue is <= clipOffset, so the next → places the
      // first click past the playhead.
      const startIndex = Math.max(0, clicks.reduce((found, c, i) => (c.t <= clipOffset + 0.05 ? i : found), -1));
      setRecIndex(startIndex);
      setRecording(true);
      setRecPaused(false);
    } catch (e) {
      setError(`Could not use the microphone: ${(e as Error).message}`);
    }
  };
  const nextLine = () => {
    const i = recIndex + 1;
    const c = clicks[i];
    if (!c) return void stopRecording();
    // Use the REAL audio clock (not the display clock) so the cue lands where it actually was
    // said in the recording — pauses included. The display stays frozen for the user's comfort.
    const timelineT = (rec.current?.clipOffset ?? 0) + realNow();
    onCue(c.scene, c.beat, Math.round(timelineT * 20) / 20);
    setRecIndex(i);
  };
  const previousLine = () => {
    // Pressed too early: the line goes back to following the one before, to be placed again.
    if (recIndex === 0) return;
    const c = clicks[recIndex];
    onCue(c.scene, c.beat, undefined);
    setRecIndex(recIndex - 1);
  };
  /**
   * Toggle: hold the prompter/board still so I can finish a sentence. The mic keeps capturing but
   * `now()` freezes (via `pausedAt`), so the countdown, bar, board animation and line highlight
   * all sit still. On resume the frozen interval is added to `pausedTotalMs` and the effective
   * clock continues from where it left off. `realNow()` is unaffected and stays aligned with the
   * audio file, so cues placed by → after resume match the real audio content.
   */
  const togglePauseRecording = () => {
    const r = rec.current;
    if (!r) return;
    if (r.pausedAt === null) {
      r.pausedAt = performance.now();
      setRecPaused(true);
      log('Timing.pauseRecording', { pausedTotalMs: r.pausedTotalMs });
    } else {
      r.pausedTotalMs += performance.now() - r.pausedAt;
      r.pausedAt = null;
      setRecPaused(false);
      log('Timing.resumeRecording', { pausedTotalMs: r.pausedTotalMs });
    }
  };
  const stopRecording = async () => {
    const r = rec.current;
    if (!r) return;
    // sourceDuration must match the real audio file length (including any paused intervals the mic
    // captured), otherwise the clip's trimEnd would under-report what's on disk.
    const duration = realNow();
    log('Timing.stopRecording', { duration, clipOffset: r.clipOffset, existingClips: clips.length });
    rec.current = null;
    setRecording(false);
    const done = new Promise<void>((resolve) => { r.recorder.onstop = () => resolve(); });
    r.recorder.stop();
    await done;
    r.stream.getTracks().forEach((t) => t.stop());
    setBusy('Saving the narration…');
    try {
      const blob = new Blob(r.chunks, { type: r.recorder.mimeType || 'audio/webm' });
      const res = await fetch('/api/uploads?ext=webm', { method: 'POST', body: blob });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
      const { upload } = await res.json();
      // Append the new recording as a clip on the timeline: it sits at the playhead position the
      // user was at when Record was pressed, on the free lane. Existing clips are untouched, so
      // multi-take editing is additive.
      const sourceDuration = Math.round(duration * 100) / 100;
      // Now that its length is known, put it on a lane where nothing else plays during it: the lane chosen
      // at the start if that is still free for the whole recording, else the other one. If both have
      // something in the way, the lane with the least overlap, and say so (both would play at once).
      const span = { from: r.clipOffset, to: r.clipOffset + sourceDuration };
      const overlap = (lane: number) => clips.filter((c) => c.lane === lane)
        .reduce((sum, c) => sum + Math.max(0, Math.min(span.to, c.offset + (c.trimEnd - c.trimStart)) - Math.max(span.from, c.offset)), 0);
      const lanes = [r.lane, r.lane === 0 ? 1 : 0] as const;
      const lane = lanes.find((l) => overlap(l) === 0) ?? (overlap(lanes[0]) <= overlap(lanes[1]) ? lanes[0] : lanes[1]);
      if (overlap(lane) > 0) setError(`The new recording overlaps another clip on lane ${lane + 1}; trim or move one of them so they don't play at once.`);
      const newClip: Clip = {
        id: `rec-${Date.now().toString(36)}`,
        upload,
        sourceDuration,
        offset: r.clipOffset,
        lane,
        trimStart: 0,
        trimEnd: sourceDuration,
        name: `narration ${new Date().toLocaleString()}`,
      };
      setClips([...clips, newClip]);
      // Park the playhead at the end of the just-finished recording so pressing Play picks up
      // where I stopped talking, instead of snapping back to where Record was pressed.
      const endT = r.clipOffset + sourceDuration;
      mixer.seek(endT);
      silent.current.at = endT;
      silent.current.startedAt = performance.now();
      setTime(endT);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  useEffect(() => () => {
    rec.current?.stream.getTracks().forEach((t) => t.stop());
    // Release the shared audio graph when the Timing modal closes.
    mixer.dispose();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { recording, recPaused, startRecording, nextLine, previousLine, togglePauseRecording, stopRecording };
}
