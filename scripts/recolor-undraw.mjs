#!/usr/bin/env node
// Recolour UnDraw SVGs into the jz-motion palette. For each SVG in library/iso-tiles/, produce
// variants in `images/` for each listed palette colour, by swapping the UnDraw accent `#6c63ff`.
//
// Optional: pass `--all-colors` to generate a variant for every palette colour per file
//           pass `--color cyan` to only produce one chosen colour (default behaviour writes a cyan
//           variant for each file so there's something to use right away).
//
// Usage: node scripts/recolor-undraw.mjs [--color cyan|pink|yellow|orange|green|white] [--all-colors]

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

// jz-motion palette (mirror of src/engine/palette.ts).
const PALETTE = {
  cyan: '#3ef0ff',
  pink: '#ff4fd8',
  yellow: '#fff05a',
  orange: '#ff9a3c',
  green: '#3dff8b',
  white: '#f2f6ff',
};

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const chosen = arg('color');
const all = args.includes('--all-colors');
const palette = all ? Object.keys(PALETTE) : [chosen ?? 'cyan'];
for (const c of palette) if (!(c in PALETTE)) { console.error(`unknown colour: ${c}`); process.exit(2); }

const inDir = resolve('library', 'iso-tiles');
const outDir = resolve('images');
await mkdir(outDir, { recursive: true });

const files = (await readdir(inDir)).filter((f) => f.endsWith('.svg'));
if (!files.length) { console.error('no SVGs in library/iso-tiles/'); process.exit(2); }

// UnDraw's "customization colour": the one hex they swap when you pick a colour on their site.
const UNDRAW_ACCENT = /#6c63ff/gi;

let wrote = 0;
for (const file of files) {
  const base = basename(file, '.svg');
  const src = await readFile(resolve(inDir, file), 'utf8');
  for (const colour of palette) {
    const hex = PALETTE[colour];
    const out = src.replace(UNDRAW_ACCENT, hex);
    const name = palette.length === 1 ? `undraw-${base}-${colour}.svg` : `undraw-${base}-${colour}.svg`;
    await writeFile(resolve(outDir, name), out);
    wrote++;
  }
}
console.log(`→ ${wrote} recoloured file${wrote === 1 ? '' : 's'} in images/`);
