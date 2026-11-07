// What's playing at the clock's time: the current and next click (with a dragged click's preview),
// their sentences for the prompter, the beat's time budget, which line is being read, and a
// stable getter the active script line animates against.
import { useRef } from 'react';
import type { CompiledPresentation } from '../../engine/compile';
import type { Click } from '../../video/performance';
import { sentencesOf, type SentenceInfo, type TtsSidecar } from '../tts';
import type { Voicer } from '../settingsStore';

interface Options {
  presentation: CompiledPresentation;
  clicks: Click[];
  drag: { index: number; t0: number; t: number; ripple?: boolean } | null;
  time: number;
  total: number;
  now: () => number;
  tts: TtsSidecar;
  voicer: Voicer;
}

export function useNowPlaying({ presentation, clicks, drag, time, total, now, tts, voicer }: Options) {
  // ---------------------------------------------------------------- what's playing
  // While a beat is dragged it shows where it goes (and, with Shift, every beat after it too).
  const shift = drag ? drag.t - drag.t0 : 0;
  const shown = clicks.map((c, i) => (drag && (i === drag.index || (drag.ripple && i > drag.index)) ? { ...c, t: c.t + shift } : c));
  const currentIndex = Math.max(0, shown.reduce((found, c, i) => (c.t <= time + 1e-3 ? i : found), -1));
  const current = shown[currentIndex];
  const next = shown[currentIndex + 1];
  /** The beat before the current one (what was just said), once the current one has started. */
  const prev = currentIndex > 0 && current && current.t <= time + 1e-3 ? shown[currentIndex - 1] : undefined;
  const beatOf = (c?: Click) => (c ? presentation.scenes[c.scene].beats[c.beat] : undefined);
  const sceneTitle = (c?: Click) => (c ? presentation.scenes[c.scene].title ?? presentation.scenes[c.scene].id : '');
  const cuedCount = clicks.filter((c) => c.cued).length;

  // Sentences of the current and next beat, each with a duration from its generated clip or an estimate.
  const nowLines = sentencesOf(beatOf(current)?.notes, tts, voicer);
  const nextLines = sentencesOf(beatOf(next)?.notes, tts, voicer);
  const prevLines = sentencesOf(beatOf(prev)?.notes, tts, voicer);
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

  return { shown, currentIndex, current, next, prev, prevLines, beatOf, sceneTitle, cuedCount, nowLines, nextLines, budget, anyClip, beatElapsed, playDur, activeLine, getBeatElapsed };
}

export type NowPlaying = ReturnType<typeof useNowPlaying>;
