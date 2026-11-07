// Export speed-up: whether anything on the board can change between two moments of a scene. When nothing can,
// the exporter repeats the previous frame instead of drawing and photographing it again (most of an export's
// time). It errs on the side of "it moves": any tween touching the span, a flow or spin that is on, clipart
// that sways, a recording that plays or cross-fades.
import type { FlowState } from './stageNodes';
import type { ElementNodes } from './stageNodes';

export function changesBetween(
  tl: gsap.core.Timeline,
  nodes: Map<string, ElementNodes>,
  flows: Map<string, FlowState>,
  recordingsMove: (from: number, to: number) => boolean,
  from: number,
  to: number,
): boolean {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  // A tween (or a set, which takes no time) that starts, runs or ends within the span changes the picture.
  if (hi > lo) {
    for (const child of tl.getChildren(true, true, false)) {
      const start = child.startTime();
      const end = start + child.totalDuration();
      if (start <= hi + 1e-9 && end > lo + 1e-9) return true;
    }
  }
  // Things that move with the clock rather than the timeline.
  for (const f of flows.values()) if (f.on > 0.5) return true;
  for (const n of nodes.values()) {
    if (n.iso && n.iso.spin.on > 0.5) return true;
    if (n.idle && n.outer.style.opacity !== '0') return true;
  }
  return recordingsMove(lo, hi);
}
