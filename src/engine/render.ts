// The Stage: the board the app and the exporter use. Playback lives in StagePlayer (player.ts); this
// adds the editing view (everything drawn in place, nothing animated) and the editor's helpers, whose
// work is done in editing.ts.
import gsap from 'gsap';
import { drawArrowHandles, handleAt as arrowHandleAt, type ArrowGeometry, type ArrowHandle } from './arrowHandles';
import { BoardEditing } from './editing';
import { anchorSpots, arrowEnds } from './geometry';
import { changesBetween } from './stillness';
import { StagePlayer } from './player';
import type { Camera, Point } from './schema';
import { partState, renderImage } from './stageNodes';

export type { PerformState, StagePosition } from './player';
export type { DrawPart } from './stageNodes';
export type { Corner } from './editing';
export type { ArrowGeometry, ArrowHandle } from './arrowHandles';

/** Plays a compiled presentation into a container, and lays scenes out for editing. */
export class Stage extends StagePlayer {
  private editing = new BoardEditing(this.svg, this.camGroup, this.overlay, this.nodes);

  /**
   * Editing view of a scene: every element fully drawn where the scene places it, nothing animated.
   * Elements not in `editable` (inherited from an earlier scene, or made by actions) are dimmed.
   */
  showLayout(index: number, editable: Set<string>, camera?: Camera) {
    if (!this.presentation) return;
    this.sceneIndex = index;
    this.stopAt = null;
    this.playThrough = false;
    const scene = this.presentation.scenes[index];
    this.buildScene(scene);
    this.tl.pause(0);
    for (const [id, n] of this.nodes) {
      const isRing = scene.elements.find((e) => e.id === id)?.type === 'ring';
      gsap.set(n.outer, { opacity: isRing ? 0 : editable.has(id) ? 1 : 0.3 });
      for (const part of n.parts) gsap.set(...partState(part, true));
      if (n.iso) n.iso.spin.on = 0;
      if (n.areaOutline) n.areaOutline.setAttribute('stroke-opacity', '0.6');
      if (n.image) renderImage(n);
    }
    this.spotlight.state.on = 0;
    this.spotlight.render();
    for (const f of this.flows.values()) f.on = 0;
    this.cam = camera ? { ...camera } : this.fitCamera();
    this.applyCamera();
    this.emit();
  }

  get camera(): Camera {
    return { ...this.cam };
  }

  set camera(c: Camera) {
    this.cam = { ...c };
    this.applyCamera();
  }

  /** Whether an element is fixed on the screen. */
  isPinned(id: string): boolean {
    return !!this.nodes.get(id)?.pinned;
  }

  /** Export: whether anything on the board can change between timeline times `from` and `to` of the current scene. */
  changesBetween(from: number, to: number): boolean {
    return changesBetween(this.tl, this.nodes, this.flows, (a, b) => this.animations.moving(a, b), from, to);
  }

  /** Where an element is in the window (client pixels), to put a tool next to it. */
  clientBox(id: string) {
    const n = this.nodes.get(id);
    const r = (n?.image?.outer ?? n?.outer)?.getBoundingClientRect();
    return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : undefined;
  }

  /** A recording's frame list (seconds each distinct picture starts), or undefined if the element isn't one. */
  pictureFrames(id: string): Promise<number[] | undefined> {
    const image = this.nodes.get(id)?.image;
    return image ? this.animations.framesOf(image) : Promise.resolve(undefined);
  }

  /** Editing: shows frame `index` (0 = the first) of a recording, without playing it. */
  showPictureFrame(id: string, index: number) {
    const image = this.nodes.get(id)?.image;
    if (image) this.animations.showFrame(image, index);
  }

  /** An arrow of the open scene as drawn: where its ends are, its knots, how it bends. */
  arrowGeometry(id: string): ArrowGeometry | undefined {
    const scene = this.presentation?.scenes[this.sceneIndex];
    const el = scene?.elements.find((e) => e.id === id);
    // (A pinned arrow is in screen coordinates: edited in the panel, not with handles on the board.)
    if (!scene || el?.type !== 'arrow' || el.pinned) return undefined;
    try {
      const { start, end } = arrowEnds(el, (x) => scene.elements.find((e) => e.id === x));
      return { start, end, via: el.via ?? [], curve: el.curve, bends: el.bends };
    } catch { return undefined; }
  }

  /** Where an arrow's end can attach to element `id` (its anchors), in board coordinates. */
  anchorSpots(id: string) {
    const scene = this.presentation?.scenes[this.sceneIndex];
    const el = scene?.elements.find((e) => e.id === id);
    return scene && el && el.type !== 'arrow' ? anchorSpots(el, (x) => scene.elements.find((e) => e.id === x)) : [];
  }

  /** The handle of arrow `id` under a board point (its ends, knots, or a "+" to add a knot). */
  arrowHandleAt(id: string, point: Point): ArrowHandle | undefined {
    const g = this.arrowGeometry(id);
    return g ? arrowHandleAt(g, this.unitsPerPixel, point) : undefined;
  }

  /** While an arrow's handle is dragged: the arrow selected, its line as it will be, and where an end can attach. */
  showArrowDrag(id: string, g: ArrowGeometry, drag: { spots: Point[]; hot?: Point }) {
    this.editing.setSelection([id]);
    drawArrowHandles(this.overlay, this.unitsPerPixel, g, drag);
  }

  // The rest of the editing API is in editing.ts (BoardEditing), documented there.
  fitCamera(padding?: number) { return this.editing.fitCamera(padding); }
  boardPoint(clientX: number, clientY: number) { return this.editing.boardPoint(clientX, clientY); }
  screenPoint(clientX: number, clientY: number) { return this.editing.screenPoint(clientX, clientY); }
  get screenUnitsPerPixel() { return this.editing.screenUnitsPerPixel; }
  get unitsPerPixel() { return this.editing.unitsPerPixel; }
  elementAt(point: { x: number; y: number }, among: Set<string>, margin?: number) { return this.editing.elementAt(point, among, margin); }
  elementBox(id: string) { return this.editing.elementBox(id); }
  previewMove(id: string, x: number, y: number) { this.editing.previewMove(id, x, y); }
  setSelection(ids: string[], secondary?: string[], opts?: { handles?: boolean }) {
    this.editing.setSelection(ids, secondary, opts);
    // One arrow selected: its ends and knots, to drag.
    const g = ids.length === 1 ? this.arrowGeometry(ids[0]) : undefined;
    if (g) drawArrowHandles(this.overlay, this.unitsPerPixel, g);
  }
  textField(id: string, field: string) { return this.editing.textField(id, field); }
  setTextHidden(id: string, field: string, hidden: boolean) { this.editing.setTextHidden(id, field, hidden); }
  handleAt(point: { x: number; y: number }) { return this.editing.handleAt(point); }
  previewScale(id: string, sx: number, sy: number) { this.editing.previewScale(id, sx, sy); }
}
