import { svgEl } from './dom';
import { board, colorNames, palette } from './palette';
import type { DrawPart } from './render';
import type { ChartElement } from './schema';

// Bar, line and pie charts in the marker style. They are redrawn every frame from two numbers per
// data item, `values` (what is shown) and `growth` (0 → 1 while it is being drawn), both animated
// by the timeline, so scrubbing and stepping back work like everything else.

export interface ChartNodes {
  el: ChartElement;
  max: number;
  values: { v: number }[];
  growth: { v: number }[];
  plot: { left: number; right: number; top: number; bottom: number };
  bars: SVGPathElement[];
  line?: SVGPathElement;
  dots: SVGPathElement[];
  slices: SVGPathElement[];
  labels: SVGTextElement[];
  pie?: { cx: number; cy: number; r: number; inner: number };
}

interface Helpers {
  fx: SVGGElement;
  stroke: (d: string, width: number) => SVGPathElement;
  write: (text: string, x: number, y: number, size: number, anchor?: 'start' | 'middle' | 'end') => void;
  parts: DrawPart[];
}

const VALUE_SIZE = 34;

function colorOf(el: ChartElement, i: number): string {
  const own = el.data[i].color;
  if (own) return palette[own];
  if (el.kind !== 'pie') return 'currentColor';
  // Pie slices need to differ: walk the palette starting from the chart's color.
  const start = colorNames.indexOf(el.color);
  return palette[colorNames[(start + i) % colorNames.length]];
}

const format = (el: ChartElement, v: number) => {
  const decimals = el.data.some((d) => !Number.isInteger(d.value)) ? 1 : 0;
  return `${v.toFixed(decimals)}${el.unit}`;
};

function valueText(parent: SVGElement, color: string, anchor = 'middle') {
  return svgEl('text', {
    'font-size': VALUE_SIZE, 'font-family': board.font, 'font-weight': 700,
    'text-anchor': anchor, 'dominant-baseline': 'central', fill: color,
  }, parent);
}

export function buildChart(el: ChartElement, max: number, h: Helpers): ChartNodes {
  const { fx, stroke, write, parts } = h;
  const halfW = el.width / 2;
  const halfH = el.height / 2;
  if (el.title) write(el.title, 0, -halfH + 26, 42);
  const top = -halfH + (el.title ? 86 : 30);
  const n: ChartNodes = {
    el, max,
    values: el.data.map((d) => ({ v: d.value })),
    growth: el.data.map(() => ({ v: 1 })),
    plot: { left: -halfW + 80, right: halfW - 20, top, bottom: halfH - 50 },
    bars: [], dots: [], slices: [], labels: [],
  };
  const fill = (color: string) => `color-mix(in srgb, ${color} 16%, transparent)`;

  if (el.kind === 'pie') {
    // Leave room around the ring for the slice labels.
    const r = Math.min(halfW * 0.5, (halfH - top) * 0.42);
    n.pie = { cx: 0, cy: (top + halfH) / 2, r, inner: r * 0.55 };
    el.data.forEach((_, i) => {
      const color = colorOf(el, i);
      n.slices.push(svgEl('path', { stroke: color, 'stroke-width': board.stroke * 0.8, 'stroke-linejoin': 'round', fill: fill(color) }, fx));
      n.labels.push(valueText(fx, color));
      parts.push({ kind: 'cell', cell: n.growth[i], weight: 50 });
    });
    return n;
  }

  const { left, right, bottom } = n.plot;
  stroke(`M${left} ${top}L${left} ${bottom}L${right} ${bottom}`, board.stroke * 0.8);
  write('0', left - 14, bottom, 26, 'end');
  write(format(el, max), left - 14, top, 26, 'end');
  const slot = (right - left) / el.data.length;
  el.data.forEach((d, i) => write(d.label, left + slot * (i + 0.5), bottom + 28, 30));

  if (el.kind === 'bar') {
    el.data.forEach((_, i) => {
      const color = colorOf(el, i);
      n.bars.push(svgEl('path', { stroke: color, 'stroke-width': board.stroke * 0.8, 'stroke-linejoin': 'round', fill: fill(color) }, fx));
      n.labels.push(valueText(fx, color));
      parts.push({ kind: 'cell', cell: n.growth[i], weight: 40 });
    });
  } else {
    // pathLength = 1 so the draw-on still works when set-values changes the line's length.
    n.line = svgEl('path', {
      fill: 'none', stroke: 'currentColor', 'stroke-width': board.stroke, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      pathLength: 1,
    }, fx);
    n.line.style.strokeDasharray = '1.01 1.01';
    parts.push({ kind: 'stroke', node: n.line, length: 1.01, scale: 1, weight: 220 });
    el.data.forEach((_, i) => {
      const color = colorOf(el, i);
      n.dots.push(svgEl('path', { fill: color, stroke: 'none' }, fx));
      n.labels.push(valueText(fx, color));
      parts.push({ kind: 'cell', cell: n.growth[i], weight: 14 });
    });
  }
  return n;
}

export function renderChart(n: ChartNodes) {
  const { el } = n;
  if (n.pie) return renderPie(n);
  const { left, right, top, bottom } = n.plot;
  const slot = (right - left) / el.data.length;
  const yOf = (v: number) => bottom - Math.min(v / n.max, 1.15) * (bottom - top);

  if (el.kind === 'bar') {
    const bw = slot * 0.56;
    n.bars.forEach((bar, i) => {
      const g = n.growth[i].v;
      const v = n.values[i].v;
      const cx = left + slot * (i + 0.5);
      const y = bottom - (bottom - yOf(v)) * g;
      bar.setAttribute('d', `M${cx - bw / 2} ${bottom}V${y}H${cx + bw / 2}V${bottom}Z`);
      bar.style.display = g > 0.001 ? '' : 'none';
      const label = n.labels[i];
      label.setAttribute('x', String(cx));
      label.setAttribute('y', String(y - 24));
      label.textContent = format(el, v * g);
      label.style.opacity = el.values && g > 0.05 ? '1' : '0';
    });
    return;
  }

  const pts = n.values.map((c, i) => ({ x: left + slot * (i + 0.5), y: yOf(c.v) }));
  n.line!.setAttribute('d', `M${pts.map((p) => `${p.x} ${p.y}`).join('L')}`);
  n.dots.forEach((dot, i) => {
    const g = n.growth[i].v;
    const r = 9 * g;
    const { x, y } = pts[i];
    dot.setAttribute('d', r > 0.1 ? `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0` : '');
    const label = n.labels[i];
    label.setAttribute('x', String(x));
    label.setAttribute('y', String(y - 30));
    label.textContent = format(el, n.values[i].v);
    label.style.opacity = el.values ? String(g) : '0';
  });
}

function renderPie(n: ChartNodes) {
  const { cx, cy, r, inner } = n.pie!;
  const total = n.values.reduce((a, c) => a + c.v, 0) || 1;
  let a0 = -Math.PI / 2;
  const pt = (a: number, rad: number) => `${(cx + Math.cos(a) * rad).toFixed(1)} ${(cy + Math.sin(a) * rad).toFixed(1)}`;
  n.slices.forEach((slice, i) => {
    const full = (n.values[i].v / total) * Math.PI * 2;
    const sweep = full * n.growth[i].v;
    // A small gap between slices keeps the outlines readable.
    const gap = Math.min(0.03, sweep / 4);
    const s = a0 + gap;
    const e = a0 + sweep - gap;
    const large = e - s > Math.PI ? 1 : 0;
    slice.setAttribute('d', sweep > 0.002
      ? `M${pt(s, r)}A${r} ${r} 0 ${large} 1 ${pt(e, r)}L${pt(e, inner)}A${inner} ${inner} 0 ${large} 0 ${pt(s, inner)}Z`
      : '');
    const mid = a0 + full / 2;
    const label = n.labels[i];
    const cos = Math.cos(mid);
    label.setAttribute('x', String(cx + cos * (r + 30)));
    label.setAttribute('y', String(cy + Math.sin(mid) * (r + 30)));
    label.setAttribute('text-anchor', cos > 0.25 ? 'start' : cos < -0.25 ? 'end' : 'middle');
    label.textContent = n.el.values ? `${n.el.data[i].label} ${format(n.el, n.values[i].v)}` : n.el.data[i].label;
    label.style.opacity = String(Math.min(1, n.growth[i].v * 1.5));
    a0 += full;
  });
}
