// The board itself: the shared SVG defs (marker glow, grain, smudges, vignette) and the static
// background texture, flattened into a bitmap once because its filters are expensive to redraw.
import { svgEl } from './dom';
import { VIEW } from './geometry';
import { board } from './palette';

/** Fills `defs` and draws the background into `svg`; resolves once the background has been flattened. */
export function buildBoard(svg: SVGSVGElement, defs: SVGDefsElement, p: string): Promise<void> {
  defs.innerHTML = `
      <filter id="${p}-glow" x="-20%" y="-20%" width="140%" height="140%">
        <!-- Tight inner glow plus a soft, dimmed halo; the crisp stroke stays on top so text keeps its shape. -->
        <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="nearBlur"/>
        <feComponentTransfer in="nearBlur" result="near"><feFuncA type="linear" slope="0.7"/></feComponentTransfer>
        <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="farBlur"/>
        <feComponentTransfer in="farBlur" result="far"><feFuncA type="linear" slope="0.45"/></feComponentTransfer>
        <feMerge>
          <feMergeNode in="far"/><feMergeNode in="near"/><feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="${p}-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7"/>
        <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.05 0"/>
      </filter>
      <filter id="${p}-smudge" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="60"/>
      </filter>
      <radialGradient id="${p}-vignette" cx="50%" cy="50%" r="75%">
        <stop offset="55%" stop-color="#000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.65"/>
      </radialGradient>`;
  const bg = svgEl('g', { 'pointer-events': 'none' }, svg);
  svgEl('rect', { width: VIEW.width, height: VIEW.height, fill: board.background }, bg);
  const smudges = svgEl('g', { filter: `url(#${p}-smudge)`, fill: '#ffffff', opacity: 0.035 }, bg);
  for (const [cx, cy, rx, ry] of [[420, 300, 360, 120], [1350, 760, 420, 140], [1500, 220, 260, 90], [600, 880, 300, 80]]) {
    svgEl('ellipse', { cx, cy, rx, ry, transform: `rotate(-8 ${cx} ${cy})` }, smudges);
  }
  svgEl('rect', { width: VIEW.width, height: VIEW.height, filter: `url(#${p}-grain)` }, bg);
  svgEl('rect', { width: VIEW.width, height: VIEW.height, fill: `url(#${p}-vignette)` }, bg);
  return flattenBackground(defs, bg);
}

/**
 * The board texture is static but its filters (noise, a large blur) cost more to redraw than
 * everything else on the board. Paint it once into a bitmap and show that instead.
 */
async function flattenBackground(defs: SVGDefsElement, bg: SVGGElement) {
  if (typeof Image === 'undefined' || typeof document === 'undefined') return;
  try {
    const scale = 1;
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEW.width * scale}" height="${VIEW.height * scale}" viewBox="0 0 ${VIEW.width} ${VIEW.height}"><defs>${defs.innerHTML}</defs>${bg.innerHTML}</svg>`;
    const svgUrl = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
    const img = new Image();
    img.src = svgUrl;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = VIEW.width * scale;
    canvas.height = VIEW.height * scale;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    URL.revokeObjectURL(svgUrl);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) return;
    // Decode the bitmap first and wait until the board's copy has loaded, so nothing (an export's first frame,
    // a snapshot) can catch the board between the live texture and the bitmap.
    const url = URL.createObjectURL(blob);
    const pre = new Image();
    pre.src = url;
    await pre.decode();
    const flat = svgEl('image', { href: url, width: VIEW.width, height: VIEW.height, preserveAspectRatio: 'none' });
    const loaded = new Promise<void>((done) => {
      flat.addEventListener('load', () => done(), { once: true });
      setTimeout(done, 1000);
    });
    bg.replaceChildren(flat);
    await loaded;
  } catch {
    // Keep the live (slower) background.
  }
}
