#!/usr/bin/env node
// Restyle external SVG clipart into the jz-motion marker aesthetic.
//
// Input:  library/<source>/*.svg (raw downloads, e.g. UnDraw)
// Output: scratch/clipart/<source>-<name>-<mode>-<accent>.svg (working files: bring the ones you use into the
// media library with `npm run media -- import <file>`, which prints the /media/… src to use).
//
// Modes:
//   palette  — keep the illustration intact, remap every known UnDraw hex colour to the jz-motion
//              palette. Dark greys/navies become "white" so they stay visible on the dark board;
//              light backgrounds become board (transparent). Preserves readability of the scene.
//   outline  — strip fills and convert every filled path to a stroked path in the mapped colour,
//              so the clipart reads as a neon line drawing in our marker style.
//
// Usage:
//   node scripts/restyle-svg.mjs --mode palette --accent cyan
//   node scripts/restyle-svg.mjs --mode outline --accent pink --source undraw
//   node scripts/restyle-svg.mjs --mode both --accent cyan                    # writes both modes

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const PALETTE = {
  cyan: '#3ef0ff',
  pink: '#ff4fd8',
  yellow: '#fff05a',
  orange: '#ff9a3c',
  green: '#3dff8b',
  white: '#f2f6ff',
  board: '#0d1114',
};

const UNDRAW_MAP = {
  // Primary accent — replaced with the user's chosen accent colour.
  '#6c63ff': 'accent',
  // Dark elements: make them visible on the dark board.
  '#3f3d56': 'white',
  '#2f2e41': 'white',
  '#090814': 'board',
  // Large light fills → transparent (board colour), so they melt into the board.
  '#e6e6e6': 'board',
  '#d6d6e3': 'board',
  '#e4e4e4': 'board',
  '#f2f2f2': 'board',
  '#ffffff': 'board',
  '#ffffffff': 'board',
  '#ccc': 'board',
  '#cccccc': 'board',
  '#fff': 'board',
  // Skin tones → warm accent.
  '#ed9da0': 'orange',
  '#ffb9b9': 'orange',
  // UnDraw secondary accent.
  '#ff6584': 'pink',
};

function parseArgs() {
  const a = process.argv.slice(2);
  const val = (name, def) => { const i = a.indexOf(`--${name}`); return i >= 0 ? a[i + 1] : def; };
  return {
    mode: val('mode', 'palette'),   // palette | outline | both
    accent: val('accent', 'cyan'),  // any palette colour name
    source: val('source', 'undraw'),
  };
}
const { mode, accent, source } = parseArgs();
if (!(accent in PALETTE)) { console.error(`unknown accent: ${accent}`); process.exit(2); }
if (!['palette', 'outline', 'both'].includes(mode)) { console.error(`unknown mode: ${mode}`); process.exit(2); }

const resolveColour = (slot) => slot === 'accent' ? PALETTE[accent] : PALETTE[slot];

// Replace all colours in the svg body according to the UNDRAW_MAP. Case-insensitive.
function remapColours(svg) {
  let out = svg;
  // Also handle shorthand hex (#abc) in the input by not touching it here — rely on explicit mappings.
  for (const [from, slot] of Object.entries(UNDRAW_MAP)) {
    const to = resolveColour(slot);
    // Replace in fill="...", stroke="...", stop-color="..." and inline style occurrences.
    const re = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, to);
  }
  return out;
}

// Convert every <path fill="X" .../> (and similar) into a stroked path.
// Keeps the path d= as is, swaps fill → stroke, adds stroke-width if missing.
function toOutlines(svg) {
  // Match any element with a fill attribute (path, rect, circle, polygon, etc.).
  // For board/transparent fills, drop the element entirely (they'd be invisible outlines of background).
  const boardHex = PALETTE.board;
  return svg.replace(/<(path|rect|circle|ellipse|polygon|polyline)\b([^>]*)\/?>/g, (full, tag, attrs) => {
    // Pull fill, stroke, opacity from the attrs.
    const fillMatch = attrs.match(/\bfill\s*=\s*"([^"]+)"/i);
    const strokeMatch = attrs.match(/\bstroke\s*=\s*"([^"]+)"/i);
    const fill = fillMatch?.[1] ?? '';
    // Drop anything that would end up as the board colour (invisible).
    if (fill.toLowerCase() === boardHex.toLowerCase()) return '';
    // If the element already has a stroke in a palette colour, leave it.
    if (strokeMatch && !strokeMatch[1].toLowerCase().includes('none')) return full;
    // Promote fill → stroke; drop fill.
    let next = attrs.replace(/\bfill\s*=\s*"[^"]*"/i, 'fill="none"');
    if (!/stroke\s*=/.test(next)) next = `${next} stroke="${fill || resolveColour('accent')}"`;
    if (!/stroke-width\s*=/.test(next)) next = `${next} stroke-width="1.6"`;
    if (!/stroke-linecap\s*=/.test(next)) next = `${next} stroke-linecap="round"`;
    if (!/stroke-linejoin\s*=/.test(next)) next = `${next} stroke-linejoin="round"`;
    return `<${tag}${next}/>`;
  });
}

const inDir = resolve('library', source);
const outDir = resolve('scratch/clipart');
await mkdir(outDir, { recursive: true });
const files = (await readdir(inDir)).filter((f) => f.endsWith('.svg'));
if (!files.length) { console.error(`no SVGs in library/${source}/`); process.exit(2); }

const modes = mode === 'both' ? ['palette', 'outline'] : [mode];
let wrote = 0;
for (const file of files) {
  const src = await readFile(resolve(inDir, file), 'utf8');
  const base = basename(file, '.svg');
  const paletteSvg = remapColours(src);
  for (const m of modes) {
    const final = m === 'outline' ? toOutlines(paletteSvg) : paletteSvg;
    const name = `${source}-${base}-${m}-${accent}.svg`;
    await writeFile(resolve(outDir, name), final);
    wrote++;
  }
}
console.log(`→ ${wrote} restyled file${wrote === 1 ? '' : 's'} in scratch/clipart/ (npm run media -- import <file> to use one)`);
