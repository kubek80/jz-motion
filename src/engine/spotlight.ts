// The spotlight: dims the board outside a lit region. Its numbers are tweened by the timeline
// (see spotValues) and drawn every frame into one path above the drawing.
import { svgEl } from './dom';
import { board } from './palette';

export class SpotlightLayer {
  /** What the timeline animates; `on` fades it in and out. */
  readonly state = { on: 0, x: 0, y: 0, width: 0, height: 0, amount: 0.7, ellipse: 0, fade: 0 };
  /** The spotlight's dimming, above the drawing. */
  private path: SVGPathElement;

  constructor(parent: SVGElement) {
    this.path = svgEl('path', { 'fill-rule': 'evenodd', 'pointer-events': 'none', display: 'none' }, parent) as SVGPathElement;
  }

  /** The dimming outside the spotlight: a huge rectangle with the lit region cut out of it. */
  render() {
    const s = this.state;
    const alpha = s.on * s.amount;
    if (alpha < 0.002 || s.width <= 0) {
      this.path.setAttribute('display', 'none');
      return;
    }
    const { x, y, width: w, height: h } = s;
    const hole = s.ellipse > 0.5
      ? `M${x} ${y + h / 2}a${w / 2} ${h / 2} 0 1 0 ${w} 0a${w / 2} ${h / 2} 0 1 0 ${-w} 0Z`
      : (() => {
          const r = Math.min(18, w / 4, h / 4);
          return `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;
        })();
    this.path.setAttribute('d', `M-100000 -100000H100000V100000H-100000Z${hole}`);
    this.path.setAttribute('fill', s.fade > 0.5 ? board.background : '#000');
    this.path.setAttribute('opacity', String(alpha));
    this.path.removeAttribute('display');
  }
}
