import type { CompiledPresentation } from '../engine/compile';
import type { LayoutName } from '../engine/schema';

// A performance is how a presentation was (or will be) played: from time `t` seconds into the video,
// scene `scene` plays its timeline from `from` and stops at `until`. Recorded live from the presenter's
// clicks, or generated with even pauses. Given one, every frame of the video is fully determined.

export interface PerformEvent { t: number; scene: number; from: number; until: number }
export interface Performance { events: PerformEvent[]; duration: number }

export interface AutoTiming {
  /** Seconds before the first beat of each scene. */
  lead: number;
  /** Seconds between beats (time for the narrator to talk). */
  gap: number;
  /** Seconds after the last beat of each scene. */
  tail: number;
}

export const DEFAULT_TIMING: AutoTiming = { lead: 0.8, gap: 1.5, tail: 2 };

/** Plays every beat in order with fixed pauses, like "Play all" with breathing room. */
export function autoPerformance(p: CompiledPresentation, timing: AutoTiming = DEFAULT_TIMING): Performance {
  const events: PerformEvent[] = [];
  let t = 0;
  p.scenes.forEach((scene, si) => {
    events.push({ t, scene: si, from: 0, until: 0 });
    t += timing.lead;
    for (let b = 0; b < scene.beats.length;) {
      // Auto beats run on from the beat before them.
      let e = b;
      while (e + 1 < scene.beats.length && scene.beats[e + 1].auto) e++;
      const from = scene.beats[b].start;
      const until = scene.beats[e].end;
      events.push({ t, scene: si, from, until });
      t += until - from;
      b = e + 1;
      t += b < scene.beats.length ? timing.gap : timing.tail;
    }
    if (!scene.beats.length) t += timing.tail;
  });
  return { events, duration: t };
}

/**
 * Timing from beat cues (seconds into a recording): each beat plays when its cue comes up. A beat without
 * a cue follows the one before it; cues that go backwards are treated as missing.
 */
export function cuePerformance(p: CompiledPresentation, recordingSeconds: number, timing: AutoTiming = DEFAULT_TIMING): Performance {
  const events: PerformEvent[] = [{ t: 0, scene: 0, from: 0, until: 0 }];
  let t = 0;
  p.scenes.forEach((scene, si) => {
    for (let b = 0; b < scene.beats.length;) {
      let e = b;
      while (e + 1 < scene.beats.length && scene.beats[e + 1].auto) e++;
      const cue = scene.beats[b].cue;
      const at = cue !== undefined && cue >= t ? cue : t + (si === 0 && b === 0 ? timing.lead : timing.gap);
      const from = scene.beats[b].start;
      const until = scene.beats[e].end;
      events.push({ t: at, scene: si, from, until });
      t = at + (until - from);
      b = e + 1;
    }
  });
  return { events, duration: Math.max(recordingSeconds, t + timing.tail) };
}

/** Scene and timeline position at `time` seconds into the performance. */
export function stateAt(perf: Performance, time: number): { scene: number; time: number } {
  const { events } = perf;
  if (!events.length) return { scene: 0, time: 0 };
  let lo = 0;
  let hi = events.length - 1;
  if (time < events[0].t) return { scene: events[0].scene, time: events[0].from };
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (events[mid].t <= time) lo = mid;
    else hi = mid - 1;
  }
  const e = events[lo];
  return { scene: e.scene, time: Math.min(e.until, e.from + (time - e.t)) };
}

export interface LayoutChoice { layout: LayoutName; track: string }

/** The layout of the beat playing (or last played) at timeline position `time` in a scene. */
export function layoutAt(p: CompiledPresentation, scene: number, time: number): LayoutChoice {
  const s = p.scenes[scene];
  let beat: (typeof s.beats)[number] | undefined;
  for (const b of s.beats) {
    if (b.end > b.start && b.start < time - 1e-6) beat = b;
  }
  return { layout: beat?.layout ?? s.layout ?? 'pip', track: beat?.track ?? s.track ?? 'me' };
}

export interface Segment extends LayoutChoice { start: number; end: number }

/** Layout over time, as runs of equal layout, sampled at the video frame rate. */
export function layoutSegments(p: CompiledPresentation, perf: Performance, fps: number): Segment[] {
  const out: Segment[] = [];
  const frames = Math.ceil(perf.duration * fps);
  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    const st = stateAt(perf, t);
    const l = layoutAt(p, st.scene, st.time);
    const last = out.at(-1);
    if (last && last.layout === l.layout && last.track === l.track) last.end = (f + 1) / fps;
    else out.push({ ...l, start: t, end: (f + 1) / fps });
  }
  return out;
}
