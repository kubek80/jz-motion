import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage } from '../engine';
import type { CompiledPresentation } from '../engine/compile';
import { palette } from '../engine/palette';
import type { Clip, Voiceover } from '../engine/schema';
import { clipsDuration, clipsOf } from '../engine/voiceover';
import { cueClicks, cuePerformance, stateAt, type Click } from '../video/performance';
import { Resizer, useResizable } from './Resizer';
import { useClipMixer } from './useClipMixer';
import { log, voiceoverSummary } from './debug';
import { loadVoicer } from './settingsStore';
import { entryFor, loadSidecar, requestTts, sentencesOf, splitSentences, type SentenceInfo, type TtsSidecar } from './tts';

export type { Voiceover } from '../engine/schema';

interface Props {
  presentation: CompiledPresentation;
  /** The presentation as saved (for the take). */
  text: string;
  presentationId: string;
  voiceover?: Voiceover;
  onVoiceover: (v: Voiceover | undefined) => void;
  /** Sets (or with undefined, clears) cues of beats that start clicks; `clearOthers` forgets every other cue first. */
  onCues: (changes: { scene: number; beat: number; cue: number | undefined }[], clearOthers?: boolean) => void;
  /** Replace the speaker notes of a beat; an empty string removes the field. */
  onNotes: (scene: number, beat: number, notes: string) => void;
  /** A take was made from this timing and voice-over, ready to export. */
  onTake: (id: string) => void;
  onClose: () => void;
}

const SCENE_COLORS = [palette.cyan, palette.pink, palette.yellow, palette.green, palette.orange, palette.white];
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

/**
 * Timing a presentation to a voice-over: the narration's waveform with every click placed on it. Drag a click
 * to move it, or play and tap T as each line starts. The board plays along, with the script line beside it.
 */
export function Timing({ presentation, text, presentationId, voiceover, onVoiceover, onCues, onNotes, onTake, onClose }: Props) {
  const onCue = (scene: number, beat: number, cue: number | undefined) => onCues([{ scene, beat, cue }]);
  const clicks = useMemo(() => cueClicks(presentation), [presentation]);
  // Voiceover is held either as a legacy single clip or as a multi-clip arrangement; `clipsOf()`
  // gives a flat array either way. `primary` is the clip that drives this phase's playback (the
  // first one in the list); mixing of all clips comes in a later phase.
  const clips = useMemo(() => clipsOf(voiceover), [voiceover]);
  const primary: Clip | undefined = clips[0];
  const voiceDuration = useMemo(() => clipsDuration(clips), [clips]);
  const perf = useMemo(() => cuePerformance(presentation, voiceDuration), [presentation, voiceDuration]);
  const total = Math.max(perf.duration, voiceDuration, 1);
  /**
   * Replace the voiceover with a new set of clips (or clear it if empty). Mutations from the UI
   * (drag, delete, trim, split) all go through this — once anything is edited the voiceover is
   * persisted in the new multi-clip shape, so legacy `{upload, duration}` fields drop away.
   * Playback is paused if active so the new arrangement takes effect from the next Play.
   */
  const setClips = (next: Clip[]) => {
    log('Timing.setClips', { recording: !!rec.current, before: voiceoverSummary(voiceover), after: voiceoverSummary(next.length ? { clips: next } : undefined) });
    if (mixer.isActive()) mixer.hardStop();
    onVoiceover(next.length ? { clips: next } : undefined);
  };

  // ---------------------------------------------------------------- the clock: mixed clip playback, or a silent stopwatch
  // The Web Audio mixer owns the AudioContext, buffer cache, and in-flight sources; see
  // useClipMixer for the full story. When no clips exist, we fall back to the silent stopwatch so
  // tapping along without a recording still works.
  const mixer = useClipMixer(clips);
  /** Current clip count read from the rAF tick (which closes over its first render). */
  const clipsCountRef = useRef(0);
  const silent = useRef({ startedAt: 0, at: 0, playing: false });
  const [silentPlaying, setSilentPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const playing = mixer.playing || silentPlaying;
  /**
   * While recording narration, two clocks run in parallel: the DISPLAY clock (`now()`) freezes
   * during a Space-pause so the prompter's countdown holds still while the user finishes a
   * sentence; the REAL clock (`realNow()`) keeps ticking because the MediaRecorder keeps writing
   * audio through the pause — the breath or finish-up is in the file. Cues placed via → and the
   * clip's final sourceDuration both use the real clock, so when the recording is played back
   * later the cues line up with the actual audio content.
   *
   * `pausedAt`: performance.now() at the start of the current pause, or null when active.
   * `pausedTotalMs`: total ms frozen so far this recording; subtracted from real elapsed to get
   * effective elapsed (what the display shows).
   * `clipOffset`: timeline position when Record was pressed, so the new clip lands there.
   * `lane`: 0 if free at `clipOffset`, else 1.
   */
  const rec = useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; startedAt: number; pausedAt: number | null; pausedTotalMs: number; clipOffset: number; lane: 0 | 1 } | null>(null);
  const [recPaused, setRecPaused] = useState(false);
  // Panel sizes the user can drag; separate stores for the Timing vs. Prompter script width so each
  // remembers its own comfortable width. Double-click any divider to reset.
  const laneH = useResizable('timing-lane-h', 200, 120, 600);
  const scriptWTiming = useResizable('timing-script-w', 360, 220, 900);
  const scriptWPrompter = useResizable('prompter-script-w', 820, 320, 1600);
  // During recording the clock is real elapsed time since start — never frozen — so cues placed
  // via → and the final `duration` line up with the actual audio blob (the mic keeps capturing
  // through a Space-pause, the breath is in the file). The pause only freezes the *display*,
  // handled in the rAF tick below.
  /** Live playhead time (seconds). Three clock sources, in priority: recording clock → clip
   * mixer → silent stopwatch. The recording clock is `clipOffset + effective_elapsed`, so the
   * board and prompter continue from where the playhead was when Record was pressed instead of
   * snapping to 0. During a recording pause the display clock freezes on the paused moment so the
   * prompter countdown and board hold still; `realNow()` below keeps running for cue placement. */
  const now = () => {
    if (rec.current) {
      const r = rec.current;
      const base = r.pausedAt !== null ? r.pausedAt : performance.now();
      return r.clipOffset + (base - r.startedAt - r.pausedTotalMs) / 1000;
    }
    if (clips.length) return mixer.now();
    return silent.current.playing ? silent.current.at + (performance.now() - silent.current.startedAt) / 1000 : silent.current.at;
  };
  /** Real elapsed seconds since Record was pressed, ignoring pauses. Used for things that must
   * track the actual audio file: cue placement (so cues sit at the right moment in the recording)
   * and the clip's `sourceDuration` on stop. */
  const realNow = () => (rec.current ? (performance.now() - rec.current.startedAt) / 1000 : now());
  const seek = (t: number) => {
    const v = Math.max(0, Math.min(total, t));
    if (clips.length) mixer.seek(v);
    silent.current.at = v;
    silent.current.startedAt = performance.now();
    setTime(v);
  };
  const play = () => {
    if (clips.length) { mixer.play(); return; }
    Object.assign(silent.current, { playing: true, startedAt: performance.now() });
    setSilentPlaying(true);
  };
  const pause = () => {
    if (clips.length) { mixer.pause(); return; }
    Object.assign(silent.current, { at: now(), playing: false });
    setSilentPlaying(false);
  };

  // ---------------------------------------------------------------- the board, following the clock
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const perfRef = useRef(perf);
  perfRef.current = perf;
  clipsCountRef.current = clips.length;
  useEffect(() => {
    const s = new Stage(host.current!);
    stage.current = s;
    let raf = 0;
    let alive = true;
    void s.load(presentation).then(() => {
      const tick = () => {
        if (!alive) return;
        // `now()` is frozen during a recording pause (see its definition), so the board and
        // prompter naturally hold still here without a guard in the tick itself.
        const t = now();
        const at = stateAt(perfRef.current, t);
        s.renderAt(at.scene, at.time, t);
        setTime(t);
        // Auto-pause when the clock runs off the end: for silent mode use silent.playing; for
        // clip playback use the mixer's active flag so we only pause when we were really playing.
        if (clipsCountRef.current === 0) { if (silent.current.playing && t >= total) pause(); }
        else if (mixer.isActive() && t >= total) pause();
        raf = requestAnimationFrame(tick);
      };
      tick();
    });
    return () => { alive = false; cancelAnimationFrame(raf); s.destroy(); stage.current = null; };
  }, [presentation]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- waveform (primary clip only for now)
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const PEAKS_PER_SECOND = 50;
  useEffect(() => {
    setPeaks(null);
    if (!primary) return;
    let alive = true;
    void (async () => {
      // Reuses the mix's shared AudioContext and buffer cache so each upload is only decoded once.
      const audioBuf = await mixer.loadBuffer(primary.upload);
      const data = audioBuf.getChannelData(0);
      const n = Math.ceil(audioBuf.duration * PEAKS_PER_SECOND);
      const step = data.length / n;
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let m = 0;
        for (let j = Math.floor(i * step); j < Math.floor((i + 1) * step); j += 4) m = Math.max(m, Math.abs(data[j]));
        out[i] = m;
      }
      if (alive) setPeaks(out);
    })().catch(() => undefined);
    return () => { alive = false; };
  }, [primary?.upload]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- zoom
  const lane = useRef<HTMLDivElement>(null);
  const [pps, setPps] = useState(0);
  useEffect(() => {
    // Start with the whole thing in view.
    if (!pps && lane.current) setPps(Math.max(8, (lane.current.clientWidth - 40) / total));
  }, [pps, total]);
  const width = Math.ceil(total * (pps || 20)) + 40;
  /**
   * Draw the peaks for a clip into its own inline canvas (callback ref). Peaks are sampled over
   * the whole source audio, so a clip whose window is `[trimStart, trimEnd]` renders the slice
   * `[trimStart*PEAKS_PER_SECOND, trimEnd*PEAKS_PER_SECOND)` into its block. Only clips that share
   * the primary clip's source have peak data today; others get a flat block until per-clip peak
   * loading lands in a later phase.
   */
  const drawClipPeaks = (canvasEl: HTMLCanvasElement | null, c: Clip) => {
    if (!canvasEl) return;
    const sec = Math.max(0.01, c.trimEnd - c.trimStart);
    const w = Math.max(1, Math.ceil(sec * (pps || 20)));
    const h = Math.max(1, canvasEl.clientHeight || 32);
    canvasEl.width = w;
    canvasEl.height = h;
    const g = canvasEl.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, w, h);
    if (!peaks || c.upload !== primary?.upload) return;
    const startIdx = Math.max(0, Math.floor(c.trimStart * PEAKS_PER_SECOND));
    const endIdx = Math.min(peaks.length, Math.ceil(c.trimEnd * PEAKS_PER_SECOND));
    const pxPerPeak = (pps || 20) / PEAKS_PER_SECOND;
    g.fillStyle = '#ffffffaa';
    for (let i = startIdx; i < endIdx; i++) {
      const v = Math.min(1, peaks[i] * 1.4) * (h / 2 - 2);
      const x = (i - startIdx) * pxPerPeak;
      g.fillRect(x, h / 2 - v, Math.max(1, pxPerPeak * 0.8), v * 2);
    }
  };

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = lane.current;
    if (!el || !playing) return;
    const x = time * pps;
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 80) el.scrollLeft = x - el.clientWidth * 0.3;
  }, [time, playing, pps]);

  // ---------------------------------------------------------------- dragging clips in the lane strip
  // The drag preview overlays the actual clip position so the move is visible before it's committed
  // on pointerup. Vertical movement swaps the lane; horizontal moves `offset`.
  //
  // Listeners live on `window`, not on the clip DOM node: pointer capture can be lost if the clip
  // is removed/replaced mid-drag or the pointer leaves the capturing element, which used to leave
  // a stale `pointermove` listener attached (next click near the clip would then "re-drag" it and
  // the uncommitted preview would snap back). With window listeners the drag always ends, and we
  // also handle `pointercancel`. Commits look up the clip by id against the latest clips list so
  // a concurrent change (e.g. a new recording appended) isn't clobbered by stale index math.
  const [clipDrag, setClipDrag] = useState<{ index: number; offset: number; lane: 0 | 1; trimStart?: number; trimEnd?: number } | null>(null);
  const LANE_HEIGHT = 32;
  const clipsRef = useRef<Clip[]>(clips);
  clipsRef.current = clips;
  const commitClipUpdate = (id: string, patch: Partial<Clip>) => {
    const list = clipsRef.current;
    if (!list.some((c) => c.id === id)) return;
    setClips(list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };
  const startDragClip = (e: React.PointerEvent, index: number) => {
    e.stopPropagation();
    if (rec.current) return;
    const x0 = e.clientX, y0 = e.clientY;
    const c = clips[index];
    const pointerId = e.pointerId;
    let latest = { offset: c.offset, lane: c.lane as 0 | 1 };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const dxSec = (ev.clientX - x0) / pps;
      const dyLane = Math.round((ev.clientY - y0) / LANE_HEIGHT);
      const nextOffset = Math.max(0, Math.round((c.offset + dxSec) * 20) / 20);
      const nextLane = Math.max(0, Math.min(1, c.lane + dyLane)) as 0 | 1;
      latest = { offset: nextOffset, lane: nextLane };
      setClipDrag({ index, ...latest });
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setClipDrag(null);
      if (latest.offset !== c.offset || latest.lane !== c.lane) commitClipUpdate(c.id, { offset: latest.offset, lane: latest.lane });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const deleteClip = (index: number) => {
    const c = clips[index];
    if (!c) return;
    log('Timing.deleteClip', { index, id: c.id, upload: c.upload, recording: !!rec.current });
    setClips(clipsRef.current.filter((cc) => cc.id !== c.id));
  };

  // Trimming the clip's edges on the timeline. Left edge keeps the right side anchored in space:
  // trimStart grows AND offset shifts by the same amount, so the clip seems to be "cut off" from
  // the left. Right edge keeps the left side anchored: only trimEnd changes. Both are clamped so
  // the clip keeps at least `minLen` seconds and stays inside `[0, sourceDuration]`. Listeners
  // live on window for the same robustness reasons as the body drag above.
  const MIN_CLIP_SEC = 0.1;
  const startTrimClip = (e: React.PointerEvent, index: number, side: 'start' | 'end') => {
    e.stopPropagation();
    if (rec.current) return;
    const x0 = e.clientX;
    const c = clips[index];
    const pointerId = e.pointerId;
    let latest = { trimStart: c.trimStart, trimEnd: c.trimEnd, offset: c.offset };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const dxSec = (ev.clientX - x0) / pps;
      if (side === 'start') {
        const nextTrimStart = Math.max(0, Math.min(c.trimEnd - MIN_CLIP_SEC, Math.round((c.trimStart + dxSec) * 20) / 20));
        const delta = nextTrimStart - c.trimStart;
        latest = { trimStart: nextTrimStart, trimEnd: c.trimEnd, offset: Math.max(0, c.offset + delta) };
      } else {
        const nextTrimEnd = Math.max(c.trimStart + MIN_CLIP_SEC, Math.min(c.sourceDuration, Math.round((c.trimEnd + dxSec) * 20) / 20));
        latest = { trimStart: c.trimStart, trimEnd: nextTrimEnd, offset: c.offset };
      }
      setClipDrag({ index, offset: latest.offset, lane: c.lane as 0 | 1, trimStart: latest.trimStart, trimEnd: latest.trimEnd });
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setClipDrag(null);
      if (latest.trimStart !== c.trimStart || latest.trimEnd !== c.trimEnd || latest.offset !== c.offset) commitClipUpdate(c.id, latest);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  /**
   * Split any clip that covers the current playhead into two adjacent clips pointing at the same
   * source. The cut point in source-time is `clip.trimStart + (time - clip.offset)`. The first
   * piece keeps the left half (trimEnd = cut), the second piece keeps the right half (trimStart =
   * cut, offset = clip.offset + (cut - clip.trimStart) so it sits where it was).
   */
  const splitAtPlayhead = () => {
    if (!clips.length) return;
    const t = now();
    const next: Clip[] = [];
    let changed = false;
    for (const c of clips) {
      const end = c.offset + (c.trimEnd - c.trimStart);
      if (t > c.offset + MIN_CLIP_SEC && t < end - MIN_CLIP_SEC) {
        const cutInSource = c.trimStart + (t - c.offset);
        const left: Clip = { ...c, id: `${c.id}-L${Date.now().toString(36)}`, trimEnd: cutInSource };
        const right: Clip = { ...c, id: `${c.id}-R${Date.now().toString(36)}`, trimStart: cutInSource, offset: c.offset + (cutInSource - c.trimStart) };
        next.push(left, right);
        changed = true;
      } else {
        next.push(c);
      }
    }
    if (changed) setClips(next);
  };

  // ---------------------------------------------------------------- dragging clicks, tapping
  const [drag, setDrag] = useState<{ index: number; t: number } | null>(null);
  const startDrag = (e: React.PointerEvent, index: number) => {
    e.stopPropagation();
    if (rec.current) return;
    const x0 = e.clientX;
    const t0 = clicks[index].t;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    let latest = t0;
    const move = (ev: PointerEvent) => {
      latest = Math.max(0, Math.round((t0 + (ev.clientX - x0) / pps) * 20) / 20);
      setDrag({ index, t: latest });
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      setDrag(null);
      if (Math.abs(latest - t0) > 0.01) onCue(clicks[index].scene, clicks[index].beat, latest);
      else seek(clicks[index].t);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tapping, setTapping] = useState(false);
  const [tapIndex, setTapIndex] = useState(0);
  const nextAfter = (t: number) => Math.max(0, clicks.findIndex((c) => c.t >= t - 0.05));
  const tap = () => {
    const c = clicks[tapIndex];
    if (!c) return;
    onCue(c.scene, c.beat, Math.round(now() * 20) / 20);
    setTapIndex(tapIndex + 1);
  };

  // ---------------------------------------------------------------- editing a beat's notes right from the prompter
  const [editingBeat, setEditingBeat] = useState<{ scene: number; beat: number } | null>(null);
  const [draftNotes, setDraftNotes] = useState('');
  const startEditing = (scene: number, beat: number, notes: string | undefined) => {
    pause();
    setDraftNotes(notes ?? '');
    setEditingBeat({ scene, beat });
  };
  const saveEditing = () => {
    if (editingBeat) onNotes(editingBeat.scene, editingBeat.beat, draftNotes);
    setEditingBeat(null);
  };
  const editingThis = (c?: Click) => !!editingBeat && !!c && editingBeat.scene === c.scene && editingBeat.beat === c.beat;

  // ---------------------------------------------------------------- generated voice: a clip per sentence of each beat's notes
  const voicer = useMemo(() => loadVoicer(), []);
  const [tts, setTts] = useState<TtsSidecar>({});
  const [generating, setGenerating] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => {
    void loadSidecar(presentationId).then(setTts).catch(() => undefined);
  }, [presentationId]);
  /** Every sentence that has no clip yet in the current voice/model, deduplicated. */
  const missingSentences = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const scene of presentation.scenes) for (const beat of scene.beats) for (const text of splitSentences(beat.notes)) {
      if (seen.has(text)) continue;
      seen.add(text);
      if (!entryFor(tts, voicer, text)) out.push(text);
    }
    return out;
  }, [presentation, tts, voicer]);
  const generateVoice = async () => {
    if (!missingSentences.length) return;
    setError(null);
    setGenerating({ done: 0, total: missingSentences.length });
    let current = { ...tts };
    try {
      for (let i = 0; i < missingSentences.length; i++) {
        const r = await requestTts(presentationId, missingSentences[i], voicer);
        current = { ...current, [r.hash]: { text: r.text, audio: r.audio, duration: r.duration, voice: r.voice, model: r.model } };
        setTts(current);
        setGenerating({ done: i + 1, total: missingSentences.length });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(null);
    }
  };

  // ---------------------------------------------------------------- recording narration, with the script as a prompter
  const [recording, setRecording] = useState(false);
  const [recIndex, setRecIndex] = useState(0);
  const [prompter, setPrompter] = useState(false);
  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } });
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
      setPrompter(true);
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
      const newClip: Clip = {
        id: `rec-${Date.now().toString(36)}`,
        upload,
        sourceDuration,
        offset: r.clipOffset,
        lane: r.lane,
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

  const keys = useRef({ playing, tapping, tap, play, pause, seek, now, onClose, recording, nextLine, previousLine, stopRecording, togglePauseRecording, splitAtPlayhead });
  keys.current = { playing, tapping, tap, play, pause, seek, now, onClose, recording, nextLine, previousLine, stopRecording, togglePauseRecording, splitAtPlayhead };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      const k = keys.current;
      if (k.recording) {
        // Space during recording: hold the prompter/board still while the mic keeps capturing,
        // so I can finish a sentence. Press again to resume.
        if (e.key === ' ') k.togglePauseRecording();
        else if (['ArrowRight', 'ArrowDown', 'PageDown', 'Enter'].includes(e.key)) k.nextLine();
        else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) k.previousLine();
        else if (e.key === 'Escape') void k.stopRecording();
        else return;
      } else if (e.key === ' ') (k.playing ? k.pause() : k.play());
      else if (e.key.toLowerCase() === 't' && k.tapping) k.tap();
      else if (e.key.toLowerCase() === 's') k.splitAtPlayhead();
      else if (e.key === 'ArrowLeft') k.seek(k.now() - (e.shiftKey ? 10 : 2));
      else if (e.key === 'ArrowRight') k.seek(k.now() + (e.shiftKey ? 10 : 2));
      else if (e.key === 'Escape') k.onClose();
      else return;
      // Captured before the editor's own shortcuts, so Space doesn't also step the board.
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

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

  // ---------------------------------------------------------------- what's playing
  const shown = clicks.map((c, i) => (drag?.index === i ? { ...c, t: drag.t } : c));
  const currentIndex = Math.max(0, shown.reduce((found, c, i) => (c.t <= time + 1e-3 ? i : found), -1));
  const current = shown[currentIndex];
  const next = shown[currentIndex + 1];
  const beatOf = (c?: Click) => (c ? presentation.scenes[c.scene].beats[c.beat] : undefined);
  const sceneTitle = (c?: Click) => (c ? presentation.scenes[c.scene].title ?? presentation.scenes[c.scene].id : '');
  const cuedCount = clicks.filter((c) => c.cued).length;

  // Sentences of the current and next beat, each with a duration from its generated clip or an estimate.
  const nowLines = sentencesOf(beatOf(current)?.notes, tts, voicer);
  const nextLines = sentencesOf(beatOf(next)?.notes, tts, voicer);
  const durOf = (l: SentenceInfo) => l.entry?.duration ?? l.estimated;
  const budget = nowLines.reduce((s, l) => s + durOf(l), 0);
  const anyClip = nowLines.some((l) => l.entry);
  const beatElapsed = Math.max(0, time - (current?.t ?? 0));
  // The beat's actual play length: the gap to the next click (or to the end). Click `t` values come
  // from cues or auto-even gaps and don't know anything about voice-clip lengths, so the raw sum of
  // sentence durations (`budget`) usually doesn't equal `beatDuration`. If we drove the per-sentence
  // countdown off raw durations, the Now beat would flip to Next while the current line's countdown
  // still showed seconds left — that reads as the prompter "skipping". Scale each line's start and
  // duration so they sum to the actual beat length; the countdown then hits zero right at the flip.
  const beatDuration = current ? Math.max(0.1, (next?.t ?? total) - current.t) : 0;
  const lineScale = budget > 0 && beatDuration > 0 ? beatDuration / budget : 1;
  const playDur = (l: SentenceInfo) => durOf(l) * lineScale;
  /** Index of the sentence we think is being read now, from the running durations. */
  const activeLine = (() => {
    if (!nowLines.length) return -1;
    let t = 0;
    for (let i = 0; i < nowLines.length; i++) {
      const d = playDur(nowLines[i]);
      if (beatElapsed < t + d) return i;
      t += d;
    }
    return nowLines.length - 1;
  })();

  // Stable getter the active ScriptLine's own rAF loop reads from, so the bar and countdown move
  // every frame regardless of React re-render timing (CSS transitions fought with React updates).
  const nowRef = useRef(now);
  nowRef.current = now;
  const currentTRef = useRef(current?.t ?? 0);
  currentTRef.current = current?.t ?? 0;
  const getBeatElapsed = useRef(() => Math.max(0, nowRef.current() - currentTRef.current)).current;

  return (
    <div className="timing">
      <header className="timing-head">
        <h2>Timing</h2>
        <span className="muted">{clicks.length} clicks · {cuedCount} placed on the {primary ? 'voice-over' : 'timeline'}</span>
        <span className="spacer" />
        <label className="file-btn" title="An audio or video file with your narration (mp3, m4a, wav, webm, mp4…)">
          {primary
            ? (clips.length > 1
              ? `${clips.length} clips · ${fmt(voiceDuration)}`
              : `Voice-over: ${primary.name ?? primary.upload} (${fmt(voiceDuration)})`)
            : 'Load a voice-over…'}
          <input type="file" accept="audio/*,video/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void loadVoiceover(f); }} />
        </label>
        {primary && <button onClick={() => onVoiceover(undefined)} title="Stop using this voice-over (the cues stay)">Remove</button>}
        <button
          onClick={() => void generateVoice()}
          disabled={!missingSentences.length || !!generating || !voicer.apiKey}
          title={voicer.apiKey ? `Generate a short voice clip for each sentence in Speaker notes, so the prompter can show how long each line should take (${voicer.model}, voice: ${voicer.voice}). Settings → Voice generation to change the model or key.` : 'Set an API key in Settings → Voice generation first'}
        >
          {generating ? `Generating voice ${generating.done}/${generating.total}…` : missingSentences.length ? `Generate voice (${missingSentences.length})` : 'Voice up to date'}
        </button>
        <button onClick={() => onCues([], true)} disabled={!cuedCount || recording} title="Forget every cue: clicks go back to even pauses">Clear cues</button>
        <button className="primary" disabled={!primary || !!busy} onClick={() => void makeTake()} title="A take with this timing and the voice-over as its sound, ready to export in the Video tab">
          Make a take for export
        </button>
        <button onClick={onClose} title="Close (Esc)">✕</button>
      </header>
      <div className={prompter ? 'timing-body prompter' : 'timing-body'}>
        <div className="timing-board" ref={host} />
        <Resizer
          orientation="vertical"
          value={prompter ? scriptWPrompter.value : scriptWTiming.value}
          onChange={prompter ? scriptWPrompter.setValue : scriptWTiming.setValue}
          onReset={prompter ? scriptWPrompter.reset : scriptWTiming.reset}
          reverse={!prompter}
          min={prompter ? 320 : 220}
          max={prompter ? 1600 : 900}
          style={prompter ? { order: -1 } : undefined}
        />
        <aside className="timing-script" style={{ flexBasis: (prompter ? scriptWPrompter.value : scriptWTiming.value) + 'px' }}>
          {recording && (
            <div className={recPaused ? 'rec-banner paused' : 'rec-banner'}>
              <span className="dot" />
              {recPaused ? <>Paused {fmt(time)} · prompter held, mic still on · <b>Space</b> resume · <b>→</b> next · <b>Esc</b> stop</>
                : <>Recording {fmt(time)} · <b>→</b> next line · <b>Space</b> pause prompter · <b>←</b> back · <b>Esc</b> stop</>}
            </div>
          )}
          <div className="now">
            <div className="now-head">
              <span className="muted">Now · {sceneTitle(current)}</span>
              {budget > 0 && !editingThis(current) && (
                <span className={['beat-budget', beatElapsed > budget + 0.2 ? 'over' : '', anyClip ? '' : 'estimated'].join(' ')} title={anyClip ? 'Seconds into this beat vs. the total length of its generated voice clips' : 'Seconds into this beat vs. an estimate from word count at ~150 wpm (generate voice for the real pace)'}>
                  {beatElapsed.toFixed(1)}s / {anyClip ? '' : '~'}{budget.toFixed(1)}s
                </span>
              )}
              {current && (editingThis(current) ? (
                <span className="line-tools">
                  <button className="small" onClick={saveEditing} title="Save (Ctrl+Enter)">Save</button>
                  <button className="small" onClick={() => setEditingBeat(null)} title="Discard (Esc)">Cancel</button>
                </span>
              ) : (
                <button className="small edit-notes" onClick={() => startEditing(current.scene, current.beat, beatOf(current)?.notes)} title="Edit this beat's speaker notes">✎ Edit</button>
              ))}
            </div>
            <b>{beatOf(current)?.title ?? `Beat ${(current?.beat ?? 0) + 1}`}</b>
            {editingThis(current) ? (
              <textarea
                className="notes-edit"
                autoFocus
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                onBlur={saveEditing}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditingBeat(null); }
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEditing(); }
                }}
                placeholder="What you say over this beat. End sentences with a period so the prompter can show one line each."
              />
            ) : nowLines.length ? (
              <ul
                className="lines clickable"
                onClick={() => current && startEditing(current.scene, current.beat, beatOf(current)?.notes)}
                title="Click to edit"
              >
                {nowLines.map((line, i) => <ScriptLine key={i} line={line} active={i === activeLine} playDur={playDur(line)} startAt={nowLines.slice(0, i).reduce((s, l) => s + playDur(l), 0)} getBeatElapsed={getBeatElapsed} />)}
              </ul>
            ) : (
              <p className="clickable" onClick={() => current && startEditing(current.scene, current.beat, '')}><span className="muted">Click to add speaker notes</span></p>
            )}
          </div>
          {next && (
            <div className="next">
              <div className="now-head">
                <span className="muted">Next at {fmt(next.t)} · {sceneTitle(next)}</span>
                {!editingThis(next) && <button className="small edit-notes" onClick={() => startEditing(next.scene, next.beat, beatOf(next)?.notes)} title="Edit this beat's speaker notes">✎ Edit</button>}
              </div>
              <b>{beatOf(next)?.title ?? `Beat ${next.beat + 1}`}</b>
              {editingThis(next) ? (
                <textarea
                  className="notes-edit"
                  autoFocus
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  onBlur={saveEditing}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditingBeat(null); }
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEditing(); }
                  }}
                />
              ) : nextLines.length ? (
                <ul
                  className="lines clickable"
                  onClick={() => startEditing(next.scene, next.beat, beatOf(next)?.notes)}
                  title="Click to edit"
                >
                  {nextLines.map((line, i) => <ScriptLine key={i} line={line} />)}
                </ul>
              ) : (
                <p className="clickable" onClick={() => startEditing(next.scene, next.beat, '')}><span className="muted">Click to add speaker notes</span></p>
              )}
            </div>
          )}
        </aside>
      </div>
      <div className="timing-controls">
        {recording ? (
          <button className="rec-btn on" onClick={() => void stopRecording()}>■ Stop recording</button>
        ) : (
          <button className="rec-btn" disabled={!!busy} onClick={() => void startRecording()} title="Record narration from the playhead onward: a new clip is added at the current timeline position (lane 0 if free, else lane 1). → places each beat's cue, Space holds the prompter still, Esc stops.">● Record narration</button>
        )}
        <button className={prompter ? 'on' : ''} onClick={() => setPrompter(!prompter)} title="Show the script large, as a teleprompter">Prompter</button>
        <button className="play" disabled={recording} onClick={() => (playing ? pause() : play())} title="Play / pause (Space)">{playing ? '❚❚' : '▶'}</button>
        <span className="clock">{fmt(time)} / {fmt(total)}</span>
        <button
          className={tapping ? 'tap on' : 'tap'}
          onClick={() => { setTapping(!tapping); setTapIndex(nextAfter(now())); }}
          title="Tap mode: play, and press T as each line starts; each tap places the next click"
        >
          Tap to place {tapping && clicks[tapIndex] ? `· next: ${beatOf(clicks[tapIndex])?.title ?? `beat ${clicks[tapIndex].beat + 1}`}` : ''}
        </button>
        {tapping && <button className="primary tap-now" onClick={tap} disabled={!clicks[tapIndex]}>T · place it now</button>}
        <button onClick={splitAtPlayhead} disabled={!clips.length || recording} title="Split any clip under the playhead into two adjacent clips (S)">✂ Split</button>
        <span className="spacer" />
        <span className="muted hint">Drag a click to move it · double-click to let it follow the one before · ←/→ seek</span>
        <label className="zoom" title="Zoom the timeline">
          <span className="muted">zoom</span>
          <input type="range" min={4} max={200} step={1} value={pps || 20} onChange={(e) => setPps(Number(e.target.value))} />
        </label>
      </div>
      {error && <p className="error-text">{error}</p>}
      {busy && <p className="muted">{busy}</p>}
      <Resizer
        orientation="horizontal"
        value={laneH.value}
        onChange={laneH.setValue}
        onReset={laneH.reset}
        reverse
        min={120}
        max={600}
      />
      <div
        className="timing-lane"
        ref={lane}
        style={{ height: laneH.value }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('.click') || rec.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          seek((e.clientX - r.left + e.currentTarget.scrollLeft - 20) / pps);
        }}
      >
        <div className="timing-track" style={{ width }}>
          <div className="ruler">
            {Array.from({ length: Math.ceil(total / rulerStep(pps)) + 1 }, (_, i) => i * rulerStep(pps)).map((s) => (
              <span key={s} style={{ left: 20 + s * pps }}>{fmt(s).replace(/\.\d$/, '')}</span>
            ))}
          </div>
          <div className="clip-lanes">
            {clips.map((c, i) => {
              const dragging = clipDrag?.index === i;
              const offset = dragging ? clipDrag!.offset : c.offset;
              const lane = dragging ? clipDrag!.lane : c.lane;
              const trimStart = dragging && clipDrag!.trimStart !== undefined ? clipDrag!.trimStart : c.trimStart;
              const trimEnd = dragging && clipDrag!.trimEnd !== undefined ? clipDrag!.trimEnd : c.trimEnd;
              const previewClip: Clip = { ...c, offset, lane, trimStart, trimEnd };
              const w = Math.max(6, (trimEnd - trimStart) * pps);
              return (
                <div
                  key={c.id}
                  className={['clip-block', `lane-${lane}`, dragging ? 'dragging' : ''].join(' ')}
                  style={{ left: 20 + offset * pps, width: w }}
                  onPointerDown={(e) => startDragClip(e, i)}
                  title={`${c.name ?? 'clip'} · drag body to move/swap lane · drag edges to trim · S splits at playhead`}
                >
                  <canvas className="clip-peaks" ref={(el) => drawClipPeaks(el, previewClip)} />
                  <span className="clip-name">{c.name ?? `clip ${i + 1}`}</span>
                  <button
                    className="clip-delete"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); deleteClip(i); }}
                    title="Remove this clip from the timeline"
                  >×</button>
                  <div
                    className="clip-trim clip-trim-start"
                    onPointerDown={(e) => startTrimClip(e, i, 'start')}
                    title="Drag to trim the start of this clip"
                  />
                  <div
                    className="clip-trim clip-trim-end"
                    onPointerDown={(e) => startTrimClip(e, i, 'end')}
                    title="Drag to trim the end of this clip"
                  />
                </div>
              );
            })}
            {!primary && <span className="muted wave-empty">No voice-over yet: load one above, or tap along in silence.</span>}
          </div>
          <div className="clicks">
            {shown.map((c, i) => {
              const color = SCENE_COLORS[c.scene % SCENE_COLORS.length];
              const b = beatOf(c);
              return (
                <div
                  key={`${c.scene}:${c.beat}`}
                  className={['click', i % 2 ? 'row2' : '', c.cued ? 'cued' : 'auto', c.late ? 'late' : '', i === currentIndex ? 'current' : '', tapping && i === tapIndex ? 'tap-next' : ''].join(' ')}
                  style={{ left: 20 + c.t * pps, '--c': color } as React.CSSProperties}
                  onPointerDown={(e) => startDrag(e, i)}
                  onDoubleClick={() => onCue(c.scene, c.beat, undefined)}
                  title={`${sceneTitle(c)} · ${b?.title ?? `beat ${c.beat + 1}`} at ${fmt(c.t)}${c.cued ? '' : ' (follows the one before)'}${c.late ? ' (starts before the previous animation ends: that one jumps to its end)' : ''}\n${b?.notes ?? ''}`}
                >
                  <span className="flag">{c.scene + 1}.{c.beat + 1} {b?.title ?? ''}</span>
                  <span className="anim" style={{ width: Math.max(2, (c.until - c.from) * pps) }} />
                </div>
              );
            })}
          </div>
          <div className="playhead" style={{ left: 20 + time * pps }} />
        </div>
      </div>
    </div>
  );
}

/** Seconds between ruler labels, so they stay about 80 px apart. */
function rulerStep(pps: number) {
  for (const s of [0.5, 1, 2, 5, 10, 15, 30, 60, 120]) if (s * (pps || 20) >= 80) return s;
  return 300;
}

/**
 * One sentence of a beat's notes. The clip's duration (or an estimate) drives the countdown and bar.
 * The active line's bar and remaining-time number are driven by its own requestAnimationFrame against
 * DOM refs: setState every frame fought a CSS transition and the bar only settled on pause.
 */
function ScriptLine({ line, active, playDur, startAt = 0, getBeatElapsed }: { line: SentenceInfo; active?: boolean; playDur?: number; startAt?: number; getBeatElapsed?: () => number }) {
  const dur = line.entry?.duration ?? line.estimated;
  // `dur` is the voice clip's own length (what the badge shows); `liveDur` is scaled to the actual
  // beat duration so the countdown and bar line up with when Now flips to Next.
  const liveDur = playDur ?? dur;
  const estimated = !line.entry;
  const liRef = useRef<HTMLLIElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!active || !getBeatElapsed) return;
    let raf = 0;
    const tick = () => {
      const into = Math.max(0, getBeatElapsed() - startAt);
      const left = liveDur - into;
      const pct = Math.min(100, (into / Math.max(0.1, liveDur)) * 100);
      const over = left < -0.2;
      if (barRef.current) barRef.current.style.width = `${pct.toFixed(2)}%`;
      if (countRef.current) countRef.current.textContent = left >= 0 ? `${left.toFixed(1)}s left` : `+${(-left).toFixed(1)}s`;
      if (liRef.current) liRef.current.classList.toggle('over', over);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, liveDur, startAt, getBeatElapsed]);
  return (
    <li ref={liRef} className={['line', active ? 'active' : '', estimated ? 'estimated' : ''].join(' ')}>
      <span className="line-text">{line.text}</span>
      <span className="line-meta">
        <span className="line-dur" title={estimated ? 'Estimated from word count — generate voice for the real length' : 'Length of the generated voice clip'}>{estimated ? '~' : ''}{dur.toFixed(1)}s</span>
        {active && <span className="line-count" ref={countRef}>{liveDur.toFixed(1)}s left</span>}
      </span>
      {active && (
        <span className="line-bar"><span ref={barRef} style={{ width: '0%' }} /></span>
      )}
    </li>
  );
}
