// Recording narration with the script as a prompter: start/stop the microphone, place each beat's
// cue with → (or take it back with ←), hold the prompter still with Space, and add the finished
// recording as a new clip on the timeline. In a podcast, the clip says who speaks (the beat's speaker); a take
// across lines by different people (a guest in the room) is cut at the cues placed into one clip per person.
// Also releases the mic and the audio graph on close.
import { micConstraints } from './micDevice';
import { useEffect, useRef, useState } from 'react';
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
  /** The scene playing at a moment (its id): new narration belongs to the scene where it starts. */
  sceneIdAt: (t: number) => string | undefined;
  /** Who says a beat (a podcast's cast; none otherwise). */
  speakerOf?: (scene: number, beat: number) => string | undefined;
  /** A speaker's name, for the clips' names. */
  nameOf?: (speaker: string) => string;
}

/** A recording cut where the speaker changes: [from, to) seconds into it, and who speaks. */
export function speakerPieces(marks: { at: number; speaker?: string }[], duration: number): { from: number; to: number; speaker?: string }[] {
  const out: { from: number; to: number; speaker?: string }[] = [];
  for (const m of [...marks].sort((a, b) => a.at - b.at)) {
    const at = Math.max(0, Math.min(duration, m.at));
    const last = out.at(-1);
    if (last && last.speaker === m.speaker) continue;
    if (last) last.to = at;
    if (last && last.to - last.from < 0.05) out.pop();
    const prev = out.at(-1);
    if (prev && prev.speaker === m.speaker) { prev.to = duration; continue; }
    out.push({ from: at, to: duration, speaker: m.speaker });
  }
  if (!out.length) out.push({ from: 0, to: duration });
  out[0].from = 0;
  return out;
}

export function useNarrationRecording({ clock, clips, clicks, setClips, onCue, onCues, setBusy, setError, sceneIdAt, speakerOf, nameOf }: Options) {
  const { rec, now, realNow, pause, mixer, silent, setTime } = clock;
  const [recPaused, setRecPaused] = useState(false);
  // ---------------------------------------------------------------- recording narration, with the script as a prompter
  const [recording, setRecording] = useState(false);
  const [recIndex, setRecIndex] = useState(0);
  // The lines placed during the take: seconds into the recording, and who says each (a podcast).
  const marks = useRef<{ at: number; speaker?: string }[]>([]);
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
      marks.current = clicks[startIndex] ? [{ at: 0, speaker: speakerOf?.(clicks[startIndex].scene, clicks[startIndex].beat) }] : [];
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
    marks.current.push({ at: realNow(), speaker: speakerOf?.(c.scene, c.beat) });
    setRecIndex(i);
  };
  const previousLine = () => {
    // Pressed too early: the line goes back to following the one before, to be placed again.
    if (recIndex === 0) return;
    const c = clicks[recIndex];
    onCue(c.scene, c.beat, undefined);
    if (marks.current.length > 1) marks.current.pop();
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
      // One clip, or (a podcast take across people) one per person's stretch, each saying who speaks.
      const id = `rec-${Date.now().toString(36)}`;
      const name = `narration ${new Date().toLocaleString()}`;
      const pieces = speakerPieces(marks.current, sourceDuration);
      const newClips: Clip[] = pieces.map((p, i) => {
        const offset = Math.round((r.clipOffset + p.from) * 1000) / 1000;
        const scene = sceneIdAt(offset);
        return {
          id: i ? `${id}-${i + 1}` : id, upload, sourceDuration, offset, lane,
          trimStart: Math.round(p.from * 1000) / 1000, trimEnd: Math.round(p.to * 1000) / 1000,
          name: p.speaker && pieces.length > 1 ? `${name} · ${nameOf?.(p.speaker) ?? p.speaker}` : name,
          ...(scene ? { scene } : {}), ...(p.speaker ? { speaker: p.speaker } : {}),
        };
      });
      setClips([...clips, ...newClips]);
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
