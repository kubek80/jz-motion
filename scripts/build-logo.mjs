// Builds the jz-motion logo files: `npm run logo`.
//   public/logo.svg          full logo (JZ + "motion" + arrow), transparent
//   public/logo-mark.svg     JZ only
//   public/favicon.svg       simplified JZ on a dark tile, for browser tabs
//   public/favicon-16.png, favicon-32.png, apple-touch-icon.png (180), icon-192.png, icon-512.png
//   docs/img/logo.png        full logo on the board, for the README
// "motion" is converted from the Caveat font to outlines, so the SVGs need no fonts.
import { mkdir, writeFile } from 'node:fs/promises';
import opentype from 'opentype.js';
import { chromium } from 'playwright';

const font = opentype.loadSync('node_modules/@fontsource/caveat/files/caveat-latin-700-normal.woff');

const C = { cyan: '#3ef0ff', pink: '#ff4fd8', yellow: '#fff05a', green: '#3dff8b', white: '#f2f6ff', board: '#0d1114' };

// Chunky letters on a 160×106 grid; the J overlaps the start of the Z.
const J = 'M4 0 H78 V28 H70 V66 Q70 106 34 106 Q0 106 0 70 V56 H30 V66 Q30 76 36 76 Q42 76 42 66 V28 H4 Z';
const Z = 'M70 0 H156 V26 L114 78 H158 V106 H68 V80 L110 28 H70 Z';

const glow = (id, near = 1.6, far = 9, farAlpha = 0.5) => `
  <filter id="${id}" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="${near}" result="nb"/><feComponentTransfer in="nb" result="n"><feFuncA type="linear" slope="0.7"/></feComponentTransfer>
    <feGaussianBlur in="SourceGraphic" stdDeviation="${far}" result="fb"/><feComponentTransfer in="fb" result="f"><feFuncA type="linear" slope="${farAlpha}"/></feComponentTransfer>
    <feMerge><feMergeNode in="f"/><feMergeNode in="n"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`;

/** The JZ letters (in letter units). `detail` adds the neon core line and the offset shadow. */
function letters({ detail = true, stroke = 3.2 } = {}) {
  const shadow = detail
    ? `<g transform="translate(5 5)" fill="none" stroke="${C.yellow}" stroke-width="1.4" opacity="0.7"><path d="${Z}"/><path d="${J}"/></g>`
    : '';
  const core = (d, color) => (detail ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="0.9"/>` : '');
  return `${shadow}
    <path d="${Z}" fill="#1a1420" stroke="${C.pink}" stroke-width="${stroke}"/>${core(Z, '#ffd6f5')}
    <path d="${J}" fill="#121c20" stroke="${C.cyan}" stroke-width="${stroke}"/>${core(J, '#d4fbff')}`;
}

function motionWord() {
  const size = 150;
  const width = font.getAdvanceWidth('motion', size);
  const d = font.getPath('motion', -width / 2, 0, size).toPathData(1);
  return `<path d="${d}" transform="translate(470 395) rotate(-8)" fill="${C.white}" stroke="${C.board}" stroke-width="16" paint-order="stroke" stroke-linejoin="round"/>`;
}

const arrow = `<path d="M250 470 Q450 455 640 405" fill="none" stroke="${C.green}" stroke-width="6"/>
  <path d="M618 398 L642 404 L630 426" fill="none" stroke="${C.green}" stroke-width="6"/>`;

const svg = (viewBox, body, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${extra}><defs>${glow('g')}</defs>${body}</svg>`;

const fullBody = `<g filter="url(#g)" stroke-linecap="round" stroke-linejoin="round">
  <g transform="translate(150 50) scale(3) skewX(-8)">${letters()}</g>
  ${motionWord()}
  ${arrow}
</g>`;
const markBody = `<g filter="url(#g)" stroke-linecap="round" stroke-linejoin="round"><g transform="skewX(-8)">${letters()}</g></g>`;

const browser = await chromium.launch();
const page = await browser.newPage();

/** Tight viewBox around what a body draws, with room for the glow. */
async function fit(body, pad) {
  await page.setContent(`<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000"><g id="all">${body.replace(/ filter="url\(#g\)"/, '')}</g></svg>`);
  const b = await page.evaluate(() => {
    const r = document.getElementById('all').getBBox();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  return `${(b.x - pad).toFixed(1)} ${(b.y - pad).toFixed(1)} ${(b.width + 2 * pad).toFixed(1)} ${(b.height + 2 * pad).toFixed(1)}`;
}

const fullBox = await fit(fullBody, 34);
const markBox = await fit(`<g transform="skewX(-8)">${letters()}</g>`, 12);

/** A square app tile: dark board with the mark centered. Small sizes drop the detail and the glow. */
function tile(size) {
  const small = size <= 48;
  const [mx, my, mw, mh] = markBox.split(' ').map(Number);
  const inner = 100 * (small ? 0.96 : 0.82);
  const k = inner / Math.max(mw, mh);
  const tx = 50 - (mx + mw / 2) * k;
  const ty = 50 - (my + mh / 2) * k;
  const body = `
    <rect width="100" height="100" rx="${small ? 18 : 22}" fill="${C.board}"/>
    ${small ? '' : '<rect width="100" height="100" rx="22" fill="url(#bg)"/>'}
    <g ${small ? '' : 'filter="url(#g)"'} stroke-linecap="round" stroke-linejoin="round" transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(4)})">
      <g transform="skewX(-8)">${letters({ detail: !small, stroke: small ? 9 : 4.5 })}</g>
    </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>${glow('g', 0.6, 3, 0.45)}
    <radialGradient id="bg" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#1a2229"/><stop offset="1" stop-color="${C.board}"/></radialGradient></defs>${body}</svg>`;
}

await mkdir('public', { recursive: true });
await mkdir('docs/img', { recursive: true });
await writeFile('public/logo.svg', svg(fullBox, fullBody));
await writeFile('public/logo-mark.svg', svg(markBox, markBody));
await writeFile('public/favicon.svg', tile(32));

async function png(markup, file, width, height = width, background = 'transparent') {
  await page.setViewportSize({ width, height });
  await page.setContent(`<html><body style="margin:0;background:${background}">${markup.replace('<svg ', `<svg width="${width}" height="${height}" `)}</body></html>`);
  await page.screenshot({ path: file, omitBackground: background === 'transparent' });
}

for (const [size, file] of [[16, 'public/favicon-16.png'], [32, 'public/favicon-32.png'], [180, 'public/apple-touch-icon.png'], [192, 'public/icon-192.png'], [512, 'public/icon-512.png']]) {
  await png(tile(size), file, size);
}
const [, , fw, fh] = fullBox.split(' ').map(Number);
await png(svg(fullBox, fullBody), 'docs/img/logo.png', 900, Math.round((900 * fh) / fw), C.board);

await browser.close();
console.log('logo files written');
