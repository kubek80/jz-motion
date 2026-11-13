// Mouse and pen on the board in edit mode: picking elements (Shift adds), dragging them, resizing by a
// corner handle, panning the empty board, wheel zoom, the arrow tool's two clicks, an arrow's ends and knots
// (useArrowDrag), and double-click to edit text in place. Handlers are made fresh each render, so they always see the current state.
import { useRef } from 'react';
import type { Stage } from '../../engine';
import type { Camera } from '../../engine/schema';
import { addElement, uniqueId, updateElement, type Raw, type RawDoc } from './doc';
import { resized, UNIFORM } from './elements';
import type { Selection } from './types';
import { useArrowDrag } from './useArrowDrag';

interface Drag {
  pointer: number;
  startX: number;
  startY: number;
  moved: boolean;
  /** Elements being moved, with their starting positions. */
  /** `k`: units per pixel for this item (screen units for pinned elements, board units otherwise). */
  items: { id: string; x: number; y: number; k: number }[];
  /** Pressed on the empty board: dragging pans. */
  pan: boolean;
  board: { x: number; y: number };
  camera: Camera;
  unitsPerPixel: number;
  /** Dragging a resize handle of one element, scaling it around its own position. */
  resize?: { id: string; el: Raw; origin: { x: number; y: number }; start: { x: number; y: number }; sx: number; sy: number; pinned: boolean };
}

interface BoardPointerOptions {
  stage: React.RefObject<Stage | null>;
  mode: 'edit' | 'play';
  doc: RawDoc | null;
  sceneIndex: number;
  /** Elements of the open scene. */
  elements: Raw[] | undefined;
  /** Ids that can be picked (this scene's and inherited ones) and the ones this scene owns. */
  ids: string[];
  editable: Set<string>;
  picked: string[];
  setPicked: (ids: string[]) => void;
  setSelection: (s: Selection) => void;
  pickedEl: Raw | undefined;
  canResize: boolean;
  /** Arrow tool: undefined when off, null while waiting for the start element. */
  arrowFrom: string | null | undefined;
  setArrowFrom: (from: string | null | undefined) => void;
  /** Whether text is being edited in place (the board then ignores presses). */
  editingText: boolean;
  startInline: (id: string) => void;
  editCams: React.RefObject<Map<number, Camera>>;
  update: (next: RawDoc) => void;
}

export function useBoardPointer({
  stage, mode, doc, sceneIndex, elements, ids, editable, picked, setPicked, setSelection, pickedEl, canResize,
  arrowFrom, setArrowFrom, editingText, startInline, editCams, update,
}: BoardPointerOptions) {
  const arrowTool = arrowFrom !== undefined;
  const drag = useRef<Drag | null>(null);
  const arrowDrag = useArrowDrag({ stage, doc, sceneIndex, pickedEl, editable, ids, elements, update });

  const connect = (from: string, to: string) => {
    if (!doc) return;
    const el = { id: uniqueId(doc, sceneIndex, `${from}-${to}`), type: 'arrow', from, to };
    update(addElement(doc, sceneIndex, el));
    setPicked([el.id]);
    setArrowFrom(undefined);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const s = stage.current;
    if (mode !== 'edit' || !s || arrowTool) return;
    if (arrowDrag.doubleClick(s.boardPoint(e.clientX, e.clientY))) return;
    const hit = s.elementAt(s.boardPoint(e.clientX, e.clientY), editable);
    if (hit) startInline(hit);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const s = stage.current;
    if (mode !== 'edit' || !s || !doc) return;
    if (editingText) return;
    const board = s.boardPoint(e.clientX, e.clientY);
    const hit = s.elementAt(board, new Set(ids));
    if (arrowTool) {
      if (!hit) setArrowFrom(null);
      else if (!arrowFrom) { setArrowFrom(hit); setPicked([hit]); }
      else if (hit !== arrowFrom) connect(arrowFrom, hit);
      return;
    }
    // The selected arrow's ends and knots.
    if (!e.shiftKey && arrowDrag.down(e, board)) return;
    const corner = canResize ? s.handleAt(board) : undefined;
    if (corner && pickedEl) {
      drag.current = {
        pointer: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, items: [], pan: false,
        board, camera: s.camera, unitsPerPixel: s.unitsPerPixel,
        resize: { id: pickedEl.id, el: pickedEl, origin: { x: pickedEl.x, y: pickedEl.y }, start: pickedEl.pinned ? s.screenPoint(e.clientX, e.clientY) : board, sx: 1, sy: 1, pinned: !!pickedEl.pinned },
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    let nextPicked = picked;
    if (hit) {
      if (e.shiftKey) nextPicked = picked.includes(hit) ? picked.filter((i) => i !== hit) : [...picked, hit];
      else if (!picked.includes(hit)) nextPicked = [hit];
      setPicked(nextPicked);
      setSelection(null);
    }
    const movable = hit && !e.shiftKey
      ? nextPicked.flatMap((id) => {
          const el = elements?.find((x) => x.id === id);
          return el && typeof el.x === 'number' ? [{ id, x: el.x as number, y: el.y as number, k: el.pinned ? s.screenUnitsPerPixel : s.unitsPerPixel }] : [];
        })
      : [];
    document.body.classList.add('dragging');
    window.getSelection()?.removeAllRanges();
    drag.current = {
      pointer: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, items: movable, pan: !hit,
      board, camera: s.camera, unitsPerPixel: s.unitsPerPixel,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (arrowDrag.move(e)) return;
    const d = drag.current;
    const s = stage.current;
    if (s && !d && mode === 'edit') {
      // Hover feedback: resize cursors over handles, a crosshair while connecting, a grab hand over an arrow's handles.
      const at = s.boardPoint(e.clientX, e.clientY);
      const corner = canResize ? s.handleAt(at) : undefined;
      (e.currentTarget as HTMLElement).style.cursor = arrowTool ? 'cell' : corner ? (corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize') : arrowDrag.hover(at) ? 'grab' : '';
    }
    if (!d || !s || d.pointer !== e.pointerId) return;
    if (d.resize) {
      const r = d.resize;
      const p = r.pinned ? s.screenPoint(e.clientX, e.clientY) : s.boardPoint(e.clientX, e.clientY);
      const o = r.origin;
      const ratio = (a: number, b: number) => Math.max(0.1, Math.abs(a) / Math.max(Math.abs(b), 1));
      if (UNIFORM.has(r.el.type) || e.shiftKey) {
        r.sx = r.sy = ratio(Math.hypot(p.x - o.x, p.y - o.y), Math.hypot(r.start.x - o.x, r.start.y - o.y));
      } else {
        r.sx = ratio(p.x - o.x, r.start.x - o.x);
        r.sy = ratio(p.y - o.y, r.start.y - o.y);
      }
      d.moved = true;
      s.previewScale(r.id, r.sx, r.sy);
      s.setSelection(picked, [], { handles: true });
      return;
    }
    const dx = (e.clientX - d.startX) * d.unitsPerPixel;
    const dy = (e.clientY - d.startY) * d.unitsPerPixel;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return;
    d.moved = true;
    if (d.items.length) {
      for (const it of d.items) s.previewMove(it.id, it.x + (e.clientX - d.startX) * it.k, it.y + (e.clientY - d.startY) * it.k);
      s.setSelection(picked, [], { handles: canResize });
    } else if (d.pan) {
      s.camera = { ...d.camera, x: d.camera.x - dx, y: d.camera.y - dy };
      editCams.current.set(sceneIndex, s.camera);
      s.setSelection(picked, [], { handles: canResize });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (arrowDrag.up(e)) return;
    const d = drag.current;
    drag.current = null;
    document.body.classList.remove('dragging');
    if (!d || !doc) return;
    if (d.resize) {
      if (d.moved) update(updateElement(doc, sceneIndex, d.resize.id, resized(d.resize.el, d.resize.sx, d.resize.sy)));
      return;
    }
    if (!d.moved) {
      if (d.pan) { setPicked([]); setSelection(null); }
      return;
    }
    if (d.items.length) {
      update(d.items.reduce((acc, it) => updateElement(acc, sceneIndex, it.id, {
        x: Math.round(it.x + (e.clientX - d.startX) * it.k), y: Math.round(it.y + (e.clientY - d.startY) * it.k),
      }), doc));
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const s = stage.current;
    if (mode !== 'edit' || !s) return;
    const p = s.boardPoint(e.clientX, e.clientY);
    const cam = s.camera;
    const zoom = Math.min(6, Math.max(0.1, cam.zoom * Math.exp(-e.deltaY * 0.0015)));
    // Keep the point under the cursor in place.
    s.camera = { zoom, x: p.x - (p.x - cam.x) * (cam.zoom / zoom), y: p.y - (p.y - cam.y) * (cam.zoom / zoom) };
    editCams.current.set(sceneIndex, s.camera);
    s.setSelection(picked, [], { handles: canResize });
  };

  return { onPointerDown, onPointerMove, onPointerUp, onWheel, onDoubleClick };
}
