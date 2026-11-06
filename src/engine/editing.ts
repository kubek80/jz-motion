// What the editor needs from the board besides playback: hit-testing and boxes of drawn elements,
// the selection overlay with its resize handles, in-place text editing, drag/resize previews and
// conversions between window, board and screen coordinates. The Stage delegates its editing API here.
import gsap from 'gsap';
import { svgEl } from './dom';
import { VIEW } from './geometry';
import { board } from './palette';
import type { Camera } from './schema';
import type { ElementNodes } from './stageNodes';

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

export class BoardEditing {
  private handles: { corner: Corner; x: number; y: number }[] = [];

  constructor(
    private svg: SVGSVGElement,
    private camGroup: SVGGElement,
    /** Editor selection boxes: above the drawing, without the glow. */
    private overlay: SVGGElement,
    private nodes: Map<string, ElementNodes>,
  ) {}

  /** Camera that shows everything currently drawn, with some room around it. */
  fitCamera(padding = 90): Camera {
    const boxes = [...this.nodes.values()].filter((n) => !n.pinned && Number(gsap.getProperty(n.outer, 'opacity')) > 0).map((n) => this.boxOf(n));
    if (!boxes.length) return { x: VIEW.width / 2, y: VIEW.height / 2, zoom: 1 };
    const x1 = Math.min(...boxes.map((b) => b.x));
    const y1 = Math.min(...boxes.map((b) => b.y));
    const x2 = Math.max(...boxes.map((b) => b.x + b.width));
    const y2 = Math.max(...boxes.map((b) => b.y + b.height));
    const zoom = Math.min((VIEW.width - 2 * padding) / Math.max(x2 - x1, 1), (VIEW.height - 2 * padding) / Math.max(y2 - y1, 1), 1);
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2, zoom };
  }

  /** Board coordinates under a point on the screen. */
  boardPoint(clientX: number, clientY: number): { x: number; y: number } {
    const m = this.camGroup.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  /** A point on the screen frame (1920×1080, where pinned elements live) under a point in the window. */
  screenPoint(clientX: number, clientY: number): { x: number; y: number } {
    const m = this.svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  /** Screen-frame units per pixel (for dragging pinned elements). */
  get screenUnitsPerPixel(): number {
    const m = this.svg.getScreenCTM();
    return m ? 1 / m.a : 1;
  }

  /** Board units per screen pixel, for drag thresholds and handles. */
  get unitsPerPixel(): number {
    const m = this.camGroup.getScreenCTM();
    return m ? 1 / m.a : 1;
  }

  /** The smallest element whose box contains the point; `among` limits the candidates. */
  elementAt(point: { x: number; y: number }, among: Set<string>, margin = 12): string | undefined {
    let best: { id: string; area: number } | undefined;
    for (const [id, n] of this.nodes) {
      if (!among.has(id)) continue;
      const b = this.boxOf(n);
      if (point.x < b.x - margin || point.x > b.x + b.width + margin || point.y < b.y - margin || point.y > b.y + b.height + margin) continue;
      const area = Math.max(b.width, 1) * Math.max(b.height, 1);
      if (!best || area < best.area) best = { id, area };
    }
    return best?.id;
  }

  /** Box of an element in board coordinates, as currently drawn. */
  elementBox(id: string) {
    const n = this.nodes.get(id);
    return n ? this.boxOf(n) : undefined;
  }

  /** Moves an element while dragging, before the presentation is updated. */
  previewMove(id: string, x: number, y: number) {
    const n = this.nodes.get(id);
    if (n) gsap.set(n.outer, { x, y });
  }

  /** Dashed boxes around the selected elements; `secondary` ones (e.g. an action's targets) are drawn fainter. */
  setSelection(ids: string[], secondary: string[] = [], opts: { handles?: boolean } = {}) {
    this.overlay.replaceChildren();
    this.handles = [];
    const k = this.unitsPerPixel;
    const draw = (id: string, strong: boolean) => {
      const b = this.elementBox(id);
      if (!b) return;
      const pad = 10 * k;
      svgEl('rect', {
        x: b.x - pad, y: b.y - pad, width: b.width + 2 * pad, height: b.height + 2 * pad, rx: 6 * k,
        fill: 'none', stroke: strong ? '#3ef0ff' : '#fff05a', 'stroke-width': (strong ? 2 : 1.5) * k,
        'stroke-dasharray': `${6 * k} ${5 * k}`, opacity: strong ? 0.95 : 0.7,
      }, this.overlay);
      if (strong && opts.handles && ids.length === 1) {
        const size = 12 * k;
        const corners: [Corner, number, number][] = [
          ['nw', b.x - pad, b.y - pad], ['ne', b.x + b.width + pad, b.y - pad],
          ['sw', b.x - pad, b.y + b.height + pad], ['se', b.x + b.width + pad, b.y + b.height + pad],
        ];
        for (const [corner, x, y] of corners) {
          svgEl('rect', { x: x - size / 2, y: y - size / 2, width: size, height: size, rx: 2 * k, fill: '#0d1114', stroke: '#3ef0ff', 'stroke-width': 2 * k }, this.overlay);
          this.handles.push({ corner, x, y });
        }
      }
    };
    secondary.filter((id) => !ids.includes(id)).forEach((id) => draw(id, false));
    ids.forEach((id) => draw(id, true));
  }

  /**
   * Where an element's editable text (`text`, `label` or `title`) is on screen, for editing it in place.
   * Without that text yet (an icon with no label), the spot just below the element.
   */
  textField(id: string, field: string): { left: number; top: number; width: number; height: number; fontPx: number; color: string; align: 'start' | 'middle' | 'end'; family: string; weight: string } | undefined {
    const n = this.nodes.get(id);
    if (!n) return undefined;
    const color = getComputedStyle(n.outer).color;
    const node = n.outer.querySelector<SVGTextElement>(`text[data-field="${field}"]`);
    if (node) {
      const r = node.getBoundingClientRect();
      const scale = node.getScreenCTM()?.a ?? 1;
      return {
        left: r.left, top: r.top, width: r.width, height: r.height, fontPx: Number(node.getAttribute('font-size')) * scale, color,
        align: (node.getAttribute('text-anchor') ?? 'middle') as 'start' | 'middle' | 'end',
        family: node.getAttribute('font-family') ?? board.font, weight: node.getAttribute('font-weight') ?? '700',
      };
    }
    const b = this.boxOf(n);
    const m = this.camGroup.getScreenCTM();
    if (!m) return undefined;
    const p = new DOMPoint(b.x, b.y + b.height + 8).matrixTransform(m);
    const q = new DOMPoint(b.x + b.width, b.y + b.height + 60).matrixTransform(m);
    return { left: p.x, top: p.y, width: q.x - p.x, height: q.y - p.y, fontPx: 40 * m.a, color, align: 'middle', family: board.font, weight: '700' };
  }

  /** Hides a piece of text while it is being edited in place. */
  setTextHidden(id: string, field: string, hidden: boolean) {
    const node = this.nodes.get(id)?.outer.querySelector<SVGTextElement>(`text[data-field="${field}"]`);
    if (node) node.style.visibility = hidden ? 'hidden' : '';
  }

  /** The resize handle under a board point, if any (see setSelection's `handles`). */
  handleAt(point: { x: number; y: number }): Corner | undefined {
    const r = 12 * this.unitsPerPixel;
    return this.handles.find((h) => Math.abs(h.x - point.x) <= r && Math.abs(h.y - point.y) <= r)?.corner;
  }

  /** Stretches an element around its own position while a resize handle is dragged. */
  previewScale(id: string, sx: number, sy: number) {
    const n = this.nodes.get(id);
    if (n) gsap.set(n.fx, { scaleX: sx, scaleY: sy, svgOrigin: '0 0' });
  }

  private boxOf(n: ElementNodes) {
    const b = n.outer.getBBox();
    const m = this.camGroup.getCTM()!.inverse().multiply(n.outer.getCTM()!);
    const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
      .map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }
}
