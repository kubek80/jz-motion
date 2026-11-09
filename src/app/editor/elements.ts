// Pure helpers for board elements in the editor: which ones resize and how, their new size after
// scaling, pinning to the screen and back, and the element a palette click adds.
import { icons } from '../../engine';
import type { Camera } from '../../engine/schema';
import { lastFrame } from '../images';
import { uniqueId, type Raw, type RawDoc } from './doc';
import type { AddRequest } from './Library';

/** Elements that resize around their position; the rest (arrows) follow what they connect. */
export const RESIZABLE = new Set(['icon', 'text', 'box', 'chart', 'iso', 'image', 'area']);
/** These keep their proportions; boxes and charts stretch freely (Shift keeps proportions). */
export const UNIFORM = new Set(['icon', 'text', 'iso', 'image']);

/** New size fields after scaling an element by sx × sy. */
export function resized(el: Raw, sx: number, sy: number): Raw {
  const r = (v: number) => Math.max(4, Math.round(v));
  switch (el.type) {
    case 'icon': return { size: r((el.size ?? 120) * sx) };
    case 'text': return { size: r((el.size ?? 56) * sx) };
    case 'iso': return { scale: Math.round((el.scale ?? 70) * sx * 10) / 10 };
    case 'box': return { width: r(el.width * sx), height: r(el.height * sy) };
    case 'chart': return { width: r((el.width ?? 640) * sx), height: r((el.height ?? 380) * sy) };
    case 'image':
    case 'area': return { width: r(el.width * sx), height: r(el.height * sy) };
    default: return {};
  }
}

/**
 * Fixing an element on the screen (or back on the board) keeps it exactly where and how big it looks now:
 * its position switches between board and screen coordinates through the current view.
 */
export function pinPatch(el: Raw | undefined, pin: boolean, cam: Camera): Raw {
  if (!el || typeof el.x !== 'number') return { pinned: pin || undefined };
  const k = pin ? cam.zoom : 1 / cam.zoom;
  const at = pin
    ? { x: Math.round((el.x - cam.x) * cam.zoom + 960), y: Math.round((el.y - cam.y) * cam.zoom + 540) }
    : { x: Math.round((el.x - 960) / cam.zoom + cam.x), y: Math.round((el.y - 540) / cam.zoom + cam.y) };
  return { pinned: pin || undefined, ...at, ...(Math.abs(k - 1) > 0.01 ? resized(el, k, k) : {}) };
}

/**
 * The element a palette click adds, in the middle of the view (`cam`). `pickedEl` is the one selected element, if any;
 * an arrow joins the two `picked` elements (the caller starts the arrow tool when there aren't two).
 */
export function newElement(r: AddRequest, doc: RawDoc, sceneIndex: number, cam: Camera, pickedEl: Raw | undefined, picked: string[]): Raw {
  const at = { x: Math.round(cam.x), y: Math.round(cam.y) };
  let el: Raw;
  switch (r.kind) {
    case 'icon':
      el = icons[r.name]?.parts
        ? { id: uniqueId(doc, sceneIndex, r.name), type: 'icon', icon: r.name, ...at, size: 520 }
        : { id: uniqueId(doc, sceneIndex, r.name), type: 'icon', icon: r.name, ...at, size: 140, color: 'cyan', label: r.name };
      break;
    case 'iso':
      el = { id: uniqueId(doc, sceneIndex, r.name), type: 'iso', model: r.name, ...at, scale: 80, color: 'cyan' };
      break;
    case 'text':
      el = { id: uniqueId(doc, sceneIndex, 'text'), type: 'text', text: 'new text', ...at, size: 56 };
      break;
    case 'box':
      el = { id: uniqueId(doc, sceneIndex, 'box'), type: 'box', ...at, width: 280, height: 150, color: 'green', label: 'box' };
      break;
    case 'ellipse':
      el = { id: uniqueId(doc, sceneIndex, 'ellipse'), type: 'box', shape: 'ellipse', ...at, width: 300, height: 170, color: 'green', label: 'ellipse' };
      break;
    case 'diamond':
      el = { id: uniqueId(doc, sceneIndex, 'decision'), type: 'box', shape: 'diamond', ...at, width: 320, height: 200, color: 'yellow', label: 'yes?' };
      break;
    case 'chart':
      el = {
        id: uniqueId(doc, sceneIndex, 'chart'), type: 'chart', kind: 'bar', ...at, width: 640, height: 380, color: 'cyan',
        data: [{ label: 'A', value: 3 }, { label: 'B', value: 5 }, { label: 'C', value: 2 }],
      };
      break;
    case 'image': {
      // Fit the picture comfortably inside the current view.
      const zoom = cam.zoom || 1;
      const k = Math.min(1, (1100 / zoom) / r.image.width, (680 / zoom) / r.image.height);
      el = {
        id: uniqueId(doc, sceneIndex, 'screenshot'), type: 'image', src: r.image.src, ...at,
        width: Math.round(r.image.width * k), height: Math.round(r.image.height * k), color: 'cyan',
        ...(lastFrame() === 'browser' ? { frame: 'browser' } : {}),
      };
      break;
    }
    case 'area': {
      // Over the selected picture's middle, else in the middle of the view.
      const base = pickedEl && (pickedEl.type === 'image' || pickedEl.type === 'box' || pickedEl.type === 'chart') ? pickedEl : null;
      el = base
        ? { id: uniqueId(doc, sceneIndex, 'area'), type: 'area', x: base.x, y: base.y, width: Math.round(base.width * 0.3), height: Math.round(base.height * 0.3), color: 'yellow' }
        : { id: uniqueId(doc, sceneIndex, 'area'), type: 'area', ...at, width: 320, height: 200, color: 'yellow' };
      break;
    }
    case 'arrow':
      el = { id: uniqueId(doc, sceneIndex, `${picked[0]}-${picked[1]}`), type: 'arrow', from: picked[0], to: picked[1] };
      break;
  }
  return el;
}
