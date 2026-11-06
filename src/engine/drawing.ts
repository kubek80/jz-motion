// The two marker primitives every element is drawn from: `stroke` (a path traced along its length,
// dashed and dotted lines through a mask) and `write` (text revealed left to right through a clip).
// Each records the DrawParts the timeline later animates.
import { svgEl } from './dom';
import { board, type TextStyle } from './palette';
import { splitSubpaths } from './pathSplit';
import { nextUid, setDash, type DrawPart, type LineStyle } from './stageNodes';

export type StrokeFn = (d: string, width: number, parent?: SVGElement, line?: LineStyle, scale?: number) => SVGGraphicsElement;
export type WriteFn = (text: string, x: number, y: number, size: number, anchor?: 'start' | 'middle' | 'end', field?: string, style?: TextStyle) => void;

/** Where drawing helpers put things: the element's group, the shared defs, an id prefix, and the parts list. */
export interface DrawTarget {
  fx: SVGGElement;
  defs: SVGDefsElement;
  prefix: string;
  parts: DrawPart[];
}

export function makeStroke({ fx, defs, prefix, parts }: DrawTarget): StrokeFn {
  const stroke: StrokeFn = (d, width, parent = fx, line = 'solid', scale = 1) => {
    const patterned = line !== 'solid';
    // A path with several pieces draws them one after another (a dash pattern restarts on every piece).
    const pieces = patterned ? [d] : splitSubpaths(d);
    if (pieces.length > 1) {
      const group = svgEl('g', {}, parent);
      for (const piece of pieces) stroke(piece, width, group, 'solid', scale);
      return group;
    }
    const path = svgEl('path', {
      d,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': width,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }, parent);
    if (patterned) {
      // Dashed and dotted strokes are drawn through a mask so the dash pattern and the draw-on don't fight.
      const id = `${prefix}-m${nextUid()}`;
      // The default mask region is a percentage of the viewport, which cuts off shapes drawn around their center.
      const mask = svgEl('mask', { id, maskUnits: 'userSpaceOnUse', x: -1e5, y: -1e5, width: 2e5, height: 2e5, 'data-scene': '' }, defs);
      // userSpaceOnUse: the mask follows the element's own transforms.
      const reveal = svgEl('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': width + 6, 'stroke-linecap': 'round' }, mask);
      // Dots are zero-length dashes with round ends.
      path.setAttribute('stroke-dasharray', line === 'dotted' ? `0 ${width * 2.4}` : `${width * 3} ${width * 3}`);
      const holder = svgEl('g', { mask: `url(#${id})` }, parent);
      holder.appendChild(path);
      // One unit longer than the path, so "not drawn" hides even the rounded line end.
      const length = reveal.getTotalLength() + 1;
      setDash(reveal, length);
      parts.push({ kind: 'stroke', node: reveal, length, scale });
      return path;
    }
    const length = path.getTotalLength() + 1;
    setDash(path, length);
    parts.push({ kind: 'stroke', node: path, length, scale });
    return path;
  };
  return stroke;
}

export function makeWrite({ fx, defs, prefix, parts }: DrawTarget): WriteFn {
  /** `field` marks text that can be edited in place (the element's text, label or title). */
  return (text, x, y, size, anchor = 'middle', field, style = 'marker') => {
    const font = board.fonts[style];
    const lines = text.split('\n');
    const lh = size * board.lineHeight;
    const make = (parent: SVGElement) => {
      const t = svgEl('text', {
        x, y, 'font-size': size, 'font-family': font.family, 'font-weight': font.weight,
        'text-anchor': anchor, 'dominant-baseline': 'central', fill: 'currentColor',
        // Code keeps its indentation.
        ...(style === 'code' ? { 'xml:space': 'preserve', style: 'white-space: pre' } : {}),
      }, parent) as SVGTextElement;
      if (lines.length === 1) t.textContent = text;
      else lines.forEach((line, i) => {
        const span = svgEl('tspan', { x, dy: i === 0 ? -((lines.length - 1) * lh) / 2 : lh }, t);
        span.textContent = line || ' ';
      });
      return t;
    };
    // Bold: dark letters with a marker outline and an offset echo, like the JZ in the logo.
    const holder = style === 'bold' ? svgEl('g', {}, fx) : fx;
    if (style === 'bold') {
      const echo = make(holder);
      echo.setAttribute('transform', `translate(${size * 0.07} ${size * 0.07})`);
      Object.entries({ fill: 'none', stroke: 'currentColor', 'stroke-width': size * 0.025, opacity: 0.45 }).forEach(([k, v]) => echo.setAttribute(k, String(v)));
    }
    const t = make(holder);
    if (style === 'bold') {
      Object.entries({ fill: board.background, 'fill-opacity': 0.85, stroke: 'currentColor', 'stroke-width': size * 0.045, 'stroke-linejoin': 'round' }).forEach(([k, v]) => t.setAttribute(k, String(v)));
    }
    if (field) t.setAttribute('data-field', field);
    const measured = lines.length === 1 ? t.getComputedTextLength() : Math.max(...Array.from(t.querySelectorAll('tspan')).map((s) => s.getComputedTextLength()));
    const width = measured || Math.max(...lines.map((l) => l.length)) * size * font.charWidth;
    const height = size + (lines.length - 1) * lh;
    const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
    if (style === 'code' && lines.length > 1) {
      // Code is a block: placed by `align`, but its lines all start at the block's left edge.
      for (const node of holder === fx ? [t] : Array.from(holder.querySelectorAll('text'))) {
        node.setAttribute('text-anchor', 'start');
        node.querySelectorAll('tspan').forEach((span) => span.setAttribute('x', String(left)));
      }
    }
    const id = `${prefix}-c${nextUid()}`;
    const clip = svgEl('clipPath', { id, 'data-scene': '' }, defs);
    // Generous room for descenders, the outline and the glow; the clip is in the text's user space.
    const rect = svgEl('rect', { x: left - size * 0.2, y: y - height / 2 - size * 0.5, width: width + size * 0.4, height: height + size }, clip);
    clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
    (style === 'bold' ? holder : t).setAttribute('clip-path', `url(#${id})`);
    parts.push({ kind: 'write', rect, x: left - size * 0.2, width: width + size * 0.4 });
  };
}
