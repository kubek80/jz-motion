// Editing an arrow on the board (edit mode, one arrow selected): drag its start or end onto what it should point
// at (it snaps to the nearest anchor of the drawing under it: its sides, corners; elsewhere on the drawing, the side
// facing the arrow; on the empty board, that point), drag a knot to move it, drag a "+" to add one, double-click a
// knot to remove it. The values (from, to, via) change in the presentation, so the side panel shows them.
import { useRef } from 'react';
import type { ArrowGeometry, ArrowHandle, Stage } from '../../engine';
import type { Point } from '../../engine/schema';
import { updateElement, type Raw, type RawDoc } from './doc';

interface ArrowDrag { pointer: number; id: string; handle: ArrowHandle; geometry: ArrowGeometry; moved: boolean; startX: number; startY: number; result?: { ref: string | Point; via: Point[] } }

const round = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });

export function useArrowDrag(o: { stage: React.RefObject<Stage | null>; doc: RawDoc | null; sceneIndex: number; pickedEl: Raw | undefined; editable: Set<string>; ids: string[]; elements: Raw[] | undefined; update: (next: RawDoc) => void }) {
  const drag = useRef<ArrowDrag | null>(null);
  const arrow = o.pickedEl?.type === 'arrow' && o.editable.has(o.pickedEl.id) ? o.pickedEl : undefined;

  /** Where an end dropped at `p` attaches: an anchor of the drawing under it (when near one), the drawing, or the point. */
  const attach = (s: Stage, p: Point, self: string) => {
    const others = new Set(o.ids.filter((id) => id !== self && o.elements?.find((e) => e.id === id)?.type !== 'arrow'));
    const hit = s.elementAt(p, others, 16 * s.unitsPerPixel);
    if (!hit) return { ref: round(p) as string | Point, point: p, spots: [] as Point[] };
    const spots = s.anchorSpots(hit);
    const nearest = spots.map((a) => ({ a, d: Math.hypot(a.x - p.x, a.y - p.y) })).sort((x, y) => x.d - y.d)[0];
    if (nearest && nearest.d <= 40 * s.unitsPerPixel) return { ref: `${hit}.${nearest.a.anchor}`, point: { x: nearest.a.x, y: nearest.a.y }, spots, hot: { x: nearest.a.x, y: nearest.a.y } };
    return { ref: hit, point: p, spots };
  };

  /** A press on one of the selected arrow's handles starts dragging it; returns whether it did. */
  const down = (e: React.PointerEvent, board: Point): boolean => {
    const s = o.stage.current;
    if (!s || !arrow) return false;
    const handle = s.arrowHandleAt(arrow.id, board);
    const geometry = handle && s.arrowGeometry(arrow.id);
    if (!handle || !geometry) return false;
    drag.current = { pointer: e.pointerId, id: arrow.id, handle, geometry, moved: false, startX: e.clientX, startY: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    document.body.classList.add('dragging');
    return true;
  };

  const move = (e: React.PointerEvent): boolean => {
    const d = drag.current;
    const s = o.stage.current;
    if (!d || !s || d.pointer !== e.pointerId) return !!d;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 3) return true;
    d.moved = true;
    const p = s.boardPoint(e.clientX, e.clientY);
    const g = { ...d.geometry, via: [...d.geometry.via] };
    if (d.handle.kind === 'start' || d.handle.kind === 'end') {
      const a = attach(s, p, d.id);
      g[d.handle.kind] = a.point;
      d.result = { ref: a.ref, via: g.via };
      s.showArrowDrag(d.id, g, { spots: a.spots, hot: a.hot });
      return true;
    }
    // A knot moved, or a new one added between two points.
    const h = d.handle;
    if (h.kind === 'knot') g.via[h.index] = round(p);
    else if (h.kind === 'add') g.via.splice(h.index, 0, round(p));
    d.result = { ref: '', via: g.via };
    s.showArrowDrag(d.id, g, { spots: [] });
    return true;
  };

  const up = (e: React.PointerEvent): boolean => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return !!d;
    drag.current = null;
    document.body.classList.remove('dragging');
    if (!d.moved || !d.result || !o.doc) { o.stage.current?.setSelection([d.id]); return true; }
    const patch = d.handle.kind === 'start' ? { from: d.result.ref } : d.handle.kind === 'end' ? { to: d.result.ref } : { via: d.result.via };
    o.update(updateElement(o.doc, o.sceneIndex, d.id, patch));
    return true;
  };

  /** Double-click on a knot of the selected arrow removes it; returns whether it did. */
  const doubleClick = (board: Point): boolean => {
    const s = o.stage.current;
    if (!s || !arrow || !o.doc) return false;
    const handle = s.arrowHandleAt(arrow.id, board);
    if (handle?.kind !== 'knot') return false;
    const via = ((arrow.via as Point[] | undefined) ?? []).filter((_, i) => i !== handle.index);
    o.update(updateElement(o.doc, o.sceneIndex, arrow.id, { via: via.length ? via : undefined }));
    return true;
  };

  return { down, move, up, doubleClick, hover: (board: Point) => (arrow ? o.stage.current?.arrowHandleAt(arrow.id, board) : undefined) };
}
