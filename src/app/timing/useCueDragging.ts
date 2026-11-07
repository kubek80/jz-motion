// Placing beat cues on the timeline by hand: dragging a click marker (a plain click seeks to it and opens it),
// and tap mode, where each T press places the next click at the playhead.
import { useState, type RefObject } from 'react';
import type { Click } from '../../video/performance';
import type { LiveRecording } from './useClock';

export function useCueDragging(
  clicks: Click[],
  rec: RefObject<LiveRecording | null>,
  pps: number,
  onCue: (scene: number, beat: number, cue: number | undefined) => void,
  seek: (t: number) => void,
  now: () => number,
  /** A plain click (no drag) on a beat: open its options. */
  onOpen?: (index: number) => void,
) {
  // ---------------------------------------------------------------- dragging clicks, tapping
  const [drag, setDrag] = useState<{ index: number; t: number } | null>(null);
  const startDrag = (e: React.PointerEvent, index: number) => {
    e.stopPropagation();
    if (rec.current || e.button !== 0) return;
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
