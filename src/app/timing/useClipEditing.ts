// Editing voice-over clips on the two timeline lanes: dragging a clip (move, swap lane), trimming
// its edges, deleting it, and splitting clips at the playhead. Holds the live drag preview.
import { useRef, useState, type RefObject } from 'react';
import type { Clip } from '../../engine/schema';
import { log } from '../debug';
import type { LiveRecording } from './useClock';

/** The preview of a clip being dragged or trimmed, shown before it is committed on pointerup. */
export type ClipDrag = { index: number; offset: number; lane: 0 | 1; trimStart?: number; trimEnd?: number };

export function useClipEditing(clips: Clip[], setClips: (next: Clip[]) => void, rec: RefObject<LiveRecording | null>, pps: number, now: () => number) {
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
  const [clipDrag, setClipDrag] = useState<ClipDrag | null>(null);
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

  return { clipDrag, startDragClip, deleteClip, startTrimClip, splitAtPlayhead };
}
