// The solid frames a picture or recording can sit in (buildElement's image): a Mac-style "window" (its title bar,
// hairline edge and soft shadow) and a "phone" (a dark body with a metal edge and side buttons, the screen's
// rounded corners, the camera island, and a faint glass sheen over the screen). The marker "browser" frame is drawn
// in buildElement with the other marker strokes.
import { svgEl } from './dom';
import { nextUid } from './stageNodes';

interface Defs { defs: SVGElement; prefix: string }

/**
 * A frame's soft shadow: a blurred dark copy of its shape, a little below it, in a clip of its own that grows with
 * the picture's reveal (renderImage), so it never shows ahead of it.
 */
export function frameShadow(ctx: Defs, parent: SVGElement, x: number, y: number, width: number, height: number, r: number) {
  const id = `${ctx.prefix}-sh${nextUid()}`;
  const blur = Math.max(12, width * 0.02);
  const filter = svgEl('filter', { id, x: '-20%', y: '-20%', width: '140%', height: '150%', 'data-scene': '' }, ctx.defs);
  svgEl('feGaussianBlur', { stdDeviation: blur }, filter);
  const clipPath = svgEl('clipPath', { id: `${id}-c`, 'data-scene': '' }, ctx.defs);
  const room = blur * 3;
  const clip = svgEl('rect', { x: x - room, y: y - room, width: width + room * 2, height: height + room * 3 }, clipPath) as SVGRectElement;
  const g = svgEl('g', { 'clip-path': `url(#${id}-c)` }, parent);
  svgEl('rect', { x, y: y + blur * 0.9, width, height, rx: r, fill: '#000', opacity: 0.7, filter: `url(#${id})` }, g);
  return { node: g, clip, width: width + room * 2 };
}

/** A "window" frame's title bar, as on a Mac: dark, the three coloured buttons, the address in a quiet field. */
export function windowChrome(parent: SVGElement, clipId: string, x: number, y: number, width: number, height: number, bar: number, r: number, url?: string): SVGGElement {
  const g = svgEl('g', { 'clip-path': `url(#${clipId})` }, parent) as SVGGElement;
  svgEl('rect', { x, y, width, height: bar, fill: '#1c1c1e' }, g);
  svgEl('path', { d: `M${x} ${y + bar - 0.5}H${x + width}`, stroke: '#000', 'stroke-opacity': 0.6, 'stroke-width': 1 }, g);
  const dot = bar * 0.13;
  ['#ff5f57', '#febc2e', '#28c840'].forEach((fill, i) => svgEl('circle', { cx: x + bar * 0.62 + i * dot * 3.3, cy: y + bar / 2, r: dot, fill }, g));
  if (url) {
    const fw = Math.min(width * 0.42, Math.max(bar * 6, url.length * bar * 0.21 + bar));
    const fh = bar * 0.56;
    svgEl('rect', { x: x + width / 2 - fw / 2, y: y + (bar - fh) / 2, width: fw, height: fh, rx: fh * 0.3, fill: '#2c2c2e' }, g);
    const text = svgEl('text', { x: x + width / 2, y: y + bar / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#a1a1a6', 'font-size': bar * 0.3, 'font-family': "-apple-system, 'Helvetica Neue', Inter, Arial, sans-serif" }, g);
    text.textContent = url;
  }
  // A hairline edge round the whole window, as a Mac window has.
  svgEl('rect', { x: x + 0.5, y: y + 0.5, width: width - 1, height: height - 1, rx: r, fill: 'none', stroke: '#fff', 'stroke-opacity': 0.12, 'stroke-width': 1 }, g);
  return g;
}

/** A phone's proportions, from its screen's width: the bezel round the screen, the screen's and body's corners. */
export function phoneSizes(screenWidth: number) {
  const pad = Math.max(6, screenWidth * 0.045);
  const screenR = screenWidth * 0.125;
  // The status bar over the app, as on the phone (web content starts below it): the island sits in it.
  return { pad, screenR, bodyR: screenR + pad, status: screenWidth * 0.12 };
}

/**
 * Under the screen: the side buttons, the body (near black) and its metal edge. `x`, `y`, `width`, `height`: the
 * screen; the body is `pad` larger all round.
 */
export function phoneBody(ctx: Defs, parent: SVGElement, x: number, y: number, width: number, height: number): SVGGElement {
  const { pad, bodyR } = phoneSizes(width);
  const bx = x - pad, by = y - pad, bw = width + pad * 2, bh = height + pad * 2;
  const g = svgEl('g', {}, parent) as SVGGElement;
  const id = `${ctx.prefix}-ph${nextUid()}`;
  const metal = svgEl('linearGradient', { id: `${id}-m`, x1: 0, y1: 0, x2: 1, y2: 1, 'data-scene': '' }, ctx.defs);
  [['0', '#a7aab1'], ['0.35', '#4a4d54'], ['0.65', '#6f727a'], ['1', '#2f3136']].forEach(([offset, color]) => svgEl('stop', { offset, 'stop-color': color }, metal));
  // Side buttons, sticking out a little: the action button and volume on the left, the side button on the right.
  const button = (side: -1 | 1, from: number, length: number) => svgEl('rect', {
    x: side < 0 ? bx - pad * 0.32 : bx + bw - pad * 0.3, y: by + bh * from, width: pad * 0.62, height: bh * length, rx: pad * 0.25, fill: `url(#${id}-m)`,
  }, g);
  button(-1, 0.16, 0.035); button(-1, 0.225, 0.065); button(-1, 0.305, 0.065); button(1, 0.25, 0.1);
  svgEl('rect', { x: bx, y: by, width: bw, height: bh, rx: bodyR, fill: '#08080a' }, g);
  // The metal edge, catching the light, and a hairline inside it.
  svgEl('rect', { x: bx + pad * 0.12, y: by + pad * 0.12, width: bw - pad * 0.24, height: bh - pad * 0.24, rx: bodyR - pad * 0.12, fill: 'none', stroke: `url(#${id}-m)`, 'stroke-width': pad * 0.24 }, g);
  svgEl('rect', { x: bx + pad * 0.3, y: by + pad * 0.3, width: bw - pad * 0.6, height: bh - pad * 0.6, rx: bodyR - pad * 0.3, fill: 'none', stroke: '#000', 'stroke-width': pad * 0.08 }, g);
  return g;
}

/**
 * Over the screen (and over a recording playing on it): the status bar's time, signal, Wi-Fi and battery, the camera
 * island, a faint glass sheen from the top left, and the screen's dark edge under the glass. `x`, `y`, `width`,
 * `height`: the whole screen, the status bar at its top.
 */
export function phoneGlass(ctx: Defs, parent: SVGElement, x: number, y: number, width: number, height: number): SVGGElement {
  const { screenR, status } = phoneSizes(width);
  const g = svgEl('g', { 'pointer-events': 'none' }, parent) as SVGGElement;
  const id = `${ctx.prefix}-gl${nextUid()}`;
  const clip = svgEl('clipPath', { id: `${id}-c`, 'data-scene': '' }, ctx.defs);
  svgEl('rect', { x, y, width, height, rx: screenR }, clip);
  const sheen = svgEl('linearGradient', { id: `${id}-s`, x1: 0, y1: 0, x2: 0.9, y2: 0.55, 'data-scene': '' }, ctx.defs);
  [['0', 0.16], ['0.28', 0.05], ['0.45', 0], ['1', 0]].forEach(([offset, o]) => svgEl('stop', { offset, 'stop-color': '#fff', 'stop-opacity': o }, sheen));
  const glass = svgEl('g', { 'clip-path': `url(#${id}-c)` }, g);
  svgEl('rect', { x, y, width, height, fill: `url(#${id}-s)` }, glass);
  // A soft diagonal reflection across the upper part, as glass catches a window's light.
  svgEl('path', { d: `M${x + width * 0.55} ${y}L${x + width * 0.78} ${y}L${x} ${y + height * 0.42}L${x} ${y + height * 0.3}Z`, fill: '#fff', opacity: 0.035 }, glass);
  svgEl('rect', { x, y, width, height, rx: screenR, fill: 'none', stroke: '#000', 'stroke-opacity': 0.55, 'stroke-width': Math.max(1.5, width * 0.006) }, glass);
  statusBar(g, x, y, width, status);
  // The camera island: a black pill in the status bar, with a faint lens.
  const iw = width * 0.31, ih = width * 0.085, iy = y + (status - ih) / 2;
  svgEl('rect', { x: x + (width - iw) / 2, y: iy, width: iw, height: ih, rx: ih / 2, fill: '#000' }, g);
  svgEl('circle', { cx: x + (width + iw) / 2 - ih / 2, cy: iy + ih / 2, r: ih * 0.22, fill: '#14161c', stroke: '#23262e', 'stroke-width': ih * 0.06 }, g);
  return g;
}

/** The status bar's contents, in white on the dark bar: the time on the left; signal, Wi-Fi and battery on the right. */
function statusBar(parent: SVGElement, x: number, y: number, width: number, h: number) {
  const g = svgEl('g', { fill: '#fff' }, parent);
  const cy = y + h * 0.54;
  const time = svgEl('text', { x: x + width * 0.17, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': h * 0.36, 'font-weight': 600, 'font-family': "-apple-system, 'SF Pro Text', 'Helvetica Neue', Inter, Arial, sans-serif" }, g);
  time.textContent = '9:41';
  const u = h * 0.07;
  // Signal: four bars, rising.
  let right = x + width * 0.695;
  for (let i = 0; i < 4; i++) svgEl('rect', { x: right + i * u * 1.5, y: cy + u * 1.6 - u * (1.1 + i * 0.75), width: u, height: u * (1.1 + i * 0.75), rx: u * 0.3 }, g);
  // Wi-Fi: a fan of three arcs and a dot.
  right += u * 7.4;
  const wx = right + u * 2.2, wy = cy + u * 1.6;
  for (const r of [u * 1.1, u * 2.1, u * 3.1]) svgEl('path', { d: `M${wx - r * 0.72} ${wy - r * 0.72}A${r} ${r} 0 0 1 ${wx + r * 0.72} ${wy - r * 0.72}`, fill: 'none', stroke: '#fff', 'stroke-width': u * 0.6, 'stroke-linecap': 'round' }, g);
  svgEl('circle', { cx: wx, cy: wy - u * 0.15, r: u * 0.45 }, g);
  // Battery: an outline, nearly full, and its tip.
  right += u * 6.2;
  svgEl('rect', { x: right, y: cy - u * 1.6, width: u * 6.2, height: u * 3.2, rx: u * 0.9, fill: 'none', stroke: '#fff', 'stroke-opacity': 0.45, 'stroke-width': u * 0.4 }, g);
  svgEl('rect', { x: right + u * 0.6, y: cy - u, width: u * 4.4, height: u * 2, rx: u * 0.45 }, g);
  svgEl('rect', { x: right + u * 6.5, y: cy - u * 0.6, width: u * 0.55, height: u * 1.2, rx: u * 0.25, opacity: 0.45 }, g);
}
