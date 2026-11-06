// Builds one element's SVG on the board (icon, text, box, arrow, ring, image, area, chart, iso) and
// collects the DrawParts its "draw" animation traces. Called by the Stage for every element of a scene.
import gsap from 'gsap';
import { buildChart, type ChartNodes } from './chart';
import type { CompiledElement, ElementState } from './compile';
import { svgEl } from './dom';
import { makeStroke, makeWrite } from './drawing';
import { arrowCurve, arrowEnds, arrowHead, iconLabelSize, imageFrame, ISO_LABEL_SIZE } from './geometry';
import { projectIso, resolveIsoParts } from './iso';
import { ICON_GRID, iconHeight, icons, type PartColor } from './library';
import { board, palette } from './palette';
import {
  FLOW_PERIOD, lineOf, nextUid, renderIso, ringPath,
  type DrawPart, type ElementNodes, type ImageNodes, type IsoNodes,
} from './stageNodes';

/** What building an element needs from the Stage: where to put things, and a hook for animated pictures. */
export interface BuildContext {
  defs: SVGDefsElement;
  prefix: string;
  /** The glowing drawing; `layerTop` stays bright above a spotlight; `screenLayer` is pinned to the screen. */
  layer: SVGGElement;
  layerTop: SVGGElement;
  screenLayer: SVGGElement;
  /** Pictures, under the glowing drawing (on the board and pinned to the screen). */
  images: SVGGElement;
  screenImages: SVGGElement;
  /** Ids drawn above the spotlight in the scene being built. */
  above?: string[];
  watchAnimation(image: ImageNodes, src: string, o: { x: number; y: number; width: number; height: number; clipId: string; loop: boolean; state?: number | null }): void;
}

export function buildElement(ctx: BuildContext, el: CompiledElement, lookup: (id: string) => CompiledElement | undefined, initial?: ElementState): ElementNodes {
  const pinned = !!(el as { pinned?: boolean }).pinned;
  const outer = svgEl('g', { 'data-id': el.id, class: `jzm-el jzm-${el.type}` }, pinned ? ctx.screenLayer : ctx.above?.includes(el.id) ? ctx.layerTop : ctx.layer);
  const fx = svgEl('g', {}, outer);
  const parts: DrawPart[] = [];
  const target = { fx, defs: ctx.defs, prefix: ctx.prefix, parts };
  const stroke = makeStroke(target);
  const write = makeWrite(target);

  let pivot = { x: 0, y: 0 };
  let flowPath: SVGPathElement | undefined;
  let iso: IsoNodes | undefined;
  let chart: ChartNodes | undefined;
  let image: ImageNodes | undefined;
  let areaOutline: SVGElement | undefined;

  switch (el.type) {
    case 'icon': {
      const def = icons[el.icon];
      const [bw, bh] = def.box ?? [ICON_GRID, ICON_GRID];
      const scale = el.size / bw;
      const g = svgEl('g', { transform: `scale(${scale}) translate(${-bw / 2} ${-bh / 2})` }, fx);
      if (def.parts) {
        // Clipart: each part in its own colour; outlines draw first, then their fills fade in.
        // "ink" = currentColor so the element's own marker colour drives the part — a clipart
        // of ink-only parts recolours uniformly when you change the element's `color`.
        const colour = (c: PartColor) => (c === 'board' ? board.background : c === 'ink' ? 'currentColor' : palette[c]);
        // Imported external cliparts (tagged "undraw") get a subtle idle loop — a vertical bob
        // and slight rotation on an inner group, so a scene with a character tile doesn't feel
        // frozen. Driven by GSAP (CSS transforms on <g> have SVG-coord-space quirks); respects
        // prefers-reduced-motion by skipping the tween. Amplitude scales with the clipart's own
        // box so the motion reads similarly whether the tile is tall or wide.
        let inner: SVGElement = g;
        if (def.tags.includes('undraw')) {
          inner = svgEl('g', {}, g);
          const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (!reduced) {
            // Per-instance variation in duration + phase so several tiles don't pulse in lockstep.
            gsap.to(inner, {
              y: -bh * 0.03,
              rotation: 1.4,
              duration: 3.2 + Math.random() * 1.2,
              delay: Math.random() * 1.5,
              yoyo: true,
              repeat: -1,
              ease: 'sine.inOut',
              transformOrigin: `${bw / 2}px ${bh / 2}px`,
            });
          }
        }
        for (const part of def.parts) {
          const holder = part.transform ? svgEl('g', { transform: part.transform }, inner) : inner;
          const path = stroke(part.d, part.width ?? 2, holder, 'solid', scale);
          // Strokes are drawn in currentColor, so setting `color` colours every piece of the part.
          if (part.color) path.style.color = colour(part.color);
          if (part.opacity !== undefined) path.setAttribute('opacity', String(part.opacity));
          if (part.fill) {
            // "Dim" fills come out as a pre-mixed solid colour (same trick as iso faces in
            // renderIso), not a see-through overlay — that way a clipart layered on top of
            // other elements doesn't bleed its background through. Works for ink (currentColor)
            // and for any palette colour (pink skin highlights, orange skin tones), so multi-
            // colour cliparts stay solid against whatever's behind. "board" fills opt out: they
            // intentionally punch through to the board background.
            const opacity = part.fillOpacity ?? 1;
            const useMix = opacity < 1 && part.fill !== 'board';
            const fill = useMix
              ? `color-mix(in srgb, ${colour(part.fill)} ${Math.round(opacity * 100)}%, ${board.background})`
              : colour(part.fill);
            const f = svgEl('path', { d: part.d, fill, stroke: 'none', 'fill-rule': 'evenodd' });
            holder.insertBefore(f, path);
            parts.push({ kind: 'fill', node: f, opacity: useMix ? 1 : opacity });
          }
        }
      } else if (def.style === 'logo') {
        // Brand logos are filled shapes: trace their outline thinly, then fade in a faint fill.
        const w = Math.max(2, el.size * 0.02) / scale;
        for (const d of def.paths) stroke(d, w, g, 'solid', scale);
        const fill = svgEl('g', { fill: 'currentColor', 'fill-rule': 'evenodd', stroke: 'none' }, g);
        for (const d of def.paths) svgEl('path', { d }, fill);
        parts.push({ kind: 'fill', node: fill, opacity: 0.22 });
      } else {
        const w = def.stroke ?? Math.max(3.5, el.size * 0.045) / scale;
        for (const d of def.paths) stroke(d, w, g, 'solid', scale);
      }
      if (el.label) {
        const ls = iconLabelSize(el.size);
        write(el.label, 0, iconHeight(el.icon, el.size) / 2 + ls * 0.75, ls, 'middle', 'label');
      }
      break;
    }
    case 'text':
      write(el.text, 0, 0, el.size, el.align, 'text', el.style);
      break;
    case 'box': {
      const w = el.width / 2;
      const h = el.height / 2;
      const r = Math.min(el.radius, w, h);
      const d = `M${-w + r} ${-h}H${w - r}Q${w} ${-h} ${w} ${-h + r}V${h - r}Q${w} ${h} ${w - r} ${h}H${-w + r}Q${-w} ${h} ${-w} ${h - r}V${-h + r}Q${-w} ${-h} ${-w + r} ${-h}Z`;
      stroke(d, board.stroke * (el.weight === 'bold' ? 1.8 : 1), fx, lineOf(el));
      if (el.label) write(el.label, 0, 0, Math.min(56, el.height * 0.4), 'middle', 'label');
      break;
    }
    case 'arrow': {
      const { start, end } = arrowEnds(el, lookup);
      const { control, d } = arrowCurve(start, end, el.curve);
      const bold = el.weight === 'bold';
      const width = board.stroke * (bold ? 1.9 : 1);
      const shaft = stroke(d, width, fx, lineOf(el)) as SVGPathElement;
      if (el.head === 'end' || el.head === 'both') stroke(arrowHead(end, control, bold ? 40 : 26), width);
      if (el.head === 'start' || el.head === 'both') stroke(arrowHead(start, control, bold ? 40 : 26), width);
      const mid = { x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x, y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y };
      pivot = mid;
      if (el.label) {
        // Label sits on the upper side of the arrow (or the right side of a vertical one).
        const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
        let nx = -(end.y - start.y) / len;
        let ny = (end.x - start.x) / len;
        if (ny > 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; }
        const vertical = Math.abs(nx) > 0.9;
        write(el.label, mid.x + nx * 34, mid.y + ny * 34, 40, vertical ? (nx > 0 ? 'start' : 'end') : 'middle', 'label');
      }
      flowPath = svgEl('path', {
        d: shaft.getAttribute('d')!,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': board.stroke * 2.2,
        'stroke-linecap': 'round',
        'stroke-dasharray': `0.1 ${FLOW_PERIOD}`,
        opacity: 0,
      }, outer);
      break;
    }
    case 'ring':
      stroke(ringPath(el.rx, el.ry, el.id), board.stroke * 0.9);
      break;
    case 'image': {
      const { bar, top, imageTop } = imageFrame(el);
      const w = el.width / 2;
      const t = top - el.y;
      const it = imageTop - el.y;
      const bottom = it + el.height;
      // An invisible box so the element can be picked and framed even without a frame drawn.
      svgEl('rect', { x: -w, y: t, width: el.width, height: el.height + bar, fill: 'none', stroke: 'none' }, fx);
      const outer2 = svgEl('g', {}, pinned ? ctx.screenImages : ctx.images) as SVGGElement;
      const fx2 = svgEl('g', {}, outer2) as SVGGElement;
      const clipId = `${ctx.prefix}-c${nextUid()}`;
      const clipPath = svgEl('clipPath', { id: clipId, 'data-scene': '' }, ctx.defs);
      const clip = svgEl('rect', { x: -w, y: it, width: el.width, height: el.height, rx: bar ? 0 : 8 }, clipPath) as SVGRectElement;
      const img = svgEl('image', { href: el.src, x: -w, y: it, width: el.width, height: el.height, preserveAspectRatio: 'xMidYMid slice', 'clip-path': `url(#${clipId})` }, fx2) as SVGImageElement;
      const reveal = { v: 1 };
      image = { outer: outer2, fx: fx2, clip, img, left: -w, width: el.width, reveal };
      ctx.watchAnimation(image, el.src, { x: -w, y: it, width: el.width, height: el.height, clipId, loop: el.loop, state: initial?.play });
      if (bar) {
        // A browser window in marker: outline, the bar's bottom edge, three dots, the address field.
        const r = Math.min(18, bar * 0.45);
        stroke(`M${-w + r} ${t}H${w - r}Q${w} ${t} ${w} ${t + r}V${bottom - r}Q${w} ${bottom} ${w - r} ${bottom}H${-w + r}Q${-w} ${bottom} ${-w} ${bottom - r}V${t + r}Q${-w} ${t} ${-w + r} ${t}Z`, board.stroke);
        stroke(`M${-w} ${it}H${w}`, board.stroke * 0.8);
        const dotR = bar * 0.11;
        for (let i = 0; i < 3; i++) {
          const cx = -w + bar * 0.55 + i * bar * 0.42;
          const cy = t + bar / 2;
          stroke(`M${cx - dotR} ${cy}a${dotR} ${dotR} 0 1 0 ${dotR * 2} 0a${dotR} ${dotR} 0 1 0 ${-dotR * 2} 0`, board.stroke * 0.7);
        }
        const fieldX = -w + bar * 1.9;
        const fieldW = Math.min(el.width * 0.55, el.width - bar * 2.6);
        const fh = bar * 0.56;
        stroke(`M${fieldX + fh / 2} ${t + (bar - fh) / 2}H${fieldX + fieldW - fh / 2}a${fh / 2} ${fh / 2} 0 0 1 0 ${fh}H${fieldX + fh / 2}a${fh / 2} ${fh / 2} 0 0 1 0 ${-fh}Z`, board.stroke * 0.7);
        if (el.url) write(el.url, fieldX + fh * 0.6, t + bar / 2, fh * 0.62, 'start', 'url');
      }
      parts.push({ kind: 'cell', cell: reveal, weight: el.width * 0.9 });
      if (el.label) write(el.label, 0, bottom + 34, 40, 'middle', 'label');
      break;
    }
    case 'area': {
      const w = el.width / 2;
      const h = el.height / 2;
      const d = el.shape === 'ellipse'
        ? `M${-w} 0a${w} ${h} 0 1 0 ${el.width} 0a${w} ${h} 0 1 0 ${-el.width} 0Z`
        : `M${-w} ${-h}H${w}V${h}H${-w}Z`;
      // Not part of the drawing: a faint dashed outline while editing, invisible otherwise.
      areaOutline = svgEl('path', { d, fill: 'none', stroke: 'currentColor', 'stroke-width': 3, 'stroke-dasharray': '10 8', 'stroke-opacity': 0 }, fx);
      break;
    }
    case 'chart':
      chart = buildChart(el, initial?.chart?.max ?? el.max ?? 1, { fx, stroke, write, parts });
      break;
    case 'iso': {
      const isoParts = resolveIsoParts(el);
      iso = {
        parts: isoParts,
        scale: el.scale,
        group: svgEl('g', { 'stroke-linejoin': 'round' }, fx),
        pool: [],
        view: { rotate: el.rotate, explode: 0 },
        progress: isoParts.map(() => ({ v: 1 })),
        spin: { on: 0, speed: 30 },
        phase: 0,
      };
      for (const cell of iso.progress) parts.push({ kind: 'cell', cell });
      if (el.label) {
        const { box } = projectIso(isoParts, iso.view, el.scale);
        write(el.label, 0, box.y + box.height + ISO_LABEL_SIZE * 0.85, ISO_LABEL_SIZE, 'middle', 'label');
      }
      renderIso(iso);
      break;
    }
  }
  return { outer, fx, parts, pivot, flowPath, iso, chart, image, areaOutline, pinned };
}
