// The Timing window's clock: mixed clip playback, or a silent stopwatch when there are no clips,
// or (while recording narration) the recording's own clock. Owns the live recording's ref, since
// `now()` reads it.
import { useRef, useState } from 'react';
import type { Clip } from '../../engine/schema';
import { useClipMixer } from './useClipMixer';

/** A narration recording in progress (see `rec` below). */
export interface LiveRecording {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  startedAt: number;
  pausedAt: number | null;
  pausedTotalMs: number;
  clipOffset: number;
  lane: 0 | 1;
}

export function useClock(clips: Clip[], total: number) {
  // ---------------------------------------------------------------- the clock: mixed clip playback, or a silent stopwatch
  // The Web Audio mixer owns the AudioContext, buffer cache, and in-flight sources; see
  // useClipMixer for the full story. When no clips exist, we fall back to the silent stopwatch so
  // tapping along without a recording still works.
  const mixer = useClipMixer(clips);
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
  const rec = useRef<LiveRecording | null>(null);
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

  return { mixer, silent, rec, time, setTime, playing, now, realNow, seek, play, pause };
}

export type Clock = ReturnType<typeof useClock>;
