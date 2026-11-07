// Placing beat cues on the timeline by hand: dragging a click marker moves just that beat, between its neighbours;
// Shift + drag moves it and every beat after it together (to open or close a pause). A plain click seeks to it and opens it;
// and tap mode, where each T press places the next click at the playhead.
import { useState, type RefObject } from 'react';
import type { Click } from '../../video/performance';
import type { LiveRecording } from './useClock';

export function useCueDragging(
  clicks: Click[],
  rec: RefObject<LiveRecording | null>,
  pps: number,
  onCue: (scene: number, beat: number, cue: number | undefined) => void,
  onCues: (changes: { scene: number; beat: number; cue: number | undefined }[]) => void,
  seek: (t: number) => void,
  now: () => number,
  /** A plain click (no drag) on a beat: open its options. */
  onOpen?: (index: number) => void,
) {
  // ---------------------------------------------------------------- dragging clicks, tapping
  const [drag, setDrag] = useState<{ index: number; t: number; ripple: boolean } | null>(null);
  const startDrag = (e: React.PointerEvent, index: number) => {
    e.stopPropagation();
    if (rec.current || e.button !== 0) return;
    const x0 = e.clientX;
    const t0 = clicks[index].t;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    // A beat stays after the one before it; alone, it also stays before the next beat that has its own cue
    // (beats without one just follow it). Past that, the later cue would count as going backwards and be dropped.
    const lo = index > 0 ? clicks[index - 1].t + 0.05 : 0;
    const nextCued = clicks.find((c, i) => i > index && c.cued);
    const hi = nextCued ? nextCued.t - 0.05 : Infinity;
    let latest = t0;
    let ripple = e.shiftKey;
    const move = (ev: PointerEvent) => {
      ripple = ev.shiftKey;
      const t = Math.round((t0 + (ev.clientX - x0) / pps) * 20) / 20;
      latest = Math.max(lo, ripple ? t : Math.min(hi, t));
      setDrag({ index, t: latest, ripple });
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      setDrag(null);
      if (Math.abs(latest - t0) > 0.01) {
        if (!ripple) onCue(clicks[index].scene, clicks[index].beat, latest);
        else {
          // This beat and every later one with a cue move by the same amount (beats without one follow anyway).
          const d = latest - t0;
          onCues(clicks.flatMap((c, i) => (i === index || (i > index && c.cued) ? [{ scene: c.scene, beat: c.beat, cue: Math.round((c.t + d) * 1000) / 1000 }] : [])));
        }
      }
      else {
        seek(clicks[index].t);
        onOpen?.(index);
      }
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  const [tapping, setTapping] = useState(false);
  const [tapIndex, setTapIndex] = useState(0);
  const nextAfter = (t: number) => Math.max(0, clicks.findIndex((c) => c.t >= t - 0.05));
  const tap = () => {
    const c = clicks[tapIndex];
    if (!c) return;
    onCue(c.scene, c.beat, Math.round(now() * 20) / 20);
    setTapIndex(tapIndex + 1);
  };

  return { drag, startDrag, tapping, setTapping, tapIndex, setTapIndex, nextAfter, tap };
}
