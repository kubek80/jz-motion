// Placing beat cues on the timeline by hand: dragging a click marker moves just that beat, between its neighbours;
// Shift + drag moves it and every beat after it together (to open or close a pause); Ctrl + drag also moves the voice
// clips that start after it. A hint shows while dragging. A plain click seeks to it and opens it;
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
  /** Ctrl + drag: the voice clips that start at or after `from` seconds move by `by` too. */
  onMoveClips?: (from: number, by: number) => void,
  /** Where the earliest clip starting at or after a moment begins (so moved clips can't go before 0). */
  firstClipFrom?: (from: number) => number | undefined,
) {
  // ---------------------------------------------------------------- dragging clicks, tapping
  /** The beat being dragged: where it was (`t0`) and is going (`t`), and what moves with it (Shift: later beats; Ctrl: voice clips after it). */
  const [drag, setDrag] = useState<{ index: number; t0: number; t: number; ripple: boolean; clips: boolean } | null>(null);
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
    let x = e.clientX;
    let ripple = e.shiftKey;
    let withClips = e.ctrlKey || e.metaKey;
    // Moved clips can't start before 0.
    const clipFloor = (() => { const first = firstClipFrom?.(t0); return first === undefined ? -Infinity : t0 - first; })();
    const update = () => {
      const t = Math.round((t0 + (x - x0) / pps) * 20) / 20;
      latest = Math.max(lo, withClips ? clipFloor : -Infinity, ripple ? t : Math.min(hi, t));
      setDrag({ index, t0, t: latest, ripple, clips: withClips });
    };
    const move = (ev: PointerEvent) => {
      x = ev.clientX;
      ripple = ev.shiftKey;
      withClips = ev.ctrlKey || ev.metaKey;
      update();
    };
    // Pressing or letting go of Shift / Ctrl mid-drag changes what moves, without moving the mouse.
    const keys = (ev: KeyboardEvent) => {
      if (ev.key !== 'Shift' && ev.key !== 'Control' && ev.key !== 'Meta') return;
      ripple = ev.shiftKey;
      withClips = ev.ctrlKey || ev.metaKey;
      update();
    };
    // The hint shows as soon as the beat is pressed.
    update();
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', keys);
      window.removeEventListener('keyup', keys);
      setDrag(null);
      if (Math.abs(latest - t0) > 0.01) {
        if (withClips) onMoveClips?.(t0, latest - t0);
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
    window.addEventListener('keydown', keys);
    window.addEventListener('keyup', keys);
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
