#!/usr/bin/env node
// svg-to-clipart.mjs — convert UnDraw-style SVG illustrations into our clipart JSON format
// (library/<name>.json) so they appear in the editor's Library sidebar and full-screen browser
// alongside hand-drawn clipart.
//
// Every path becomes a part with colour "ink", meaning "the element's own marker colour", so
// one tile covers every accent: change the element's colour and the whole picture recolours.
// Original UnDraw colours drive the fillOpacity only (hero → 0.3, structural → 0.15, highlight →
// 0.25) so the internal colour hierarchy is preserved without baking any specific hue in.
//
// Usage: node scripts/svg-to-clipart.mjs <in.svg> <out-name>
//        node scripts/svg-to-clipart.mjs --all   (converts every library/undraw/*.svg)
//
// Drops: light backgrounds (#e6e6e6, #ccc, #fff etc.) → removed as parts (they'd just be flat
// rectangles behind everything; the dark board plays that role).

import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

// UnDraw uses a small set of brand colours; map each to a role in our marker vocabulary.
// Hero + darks + lights all become "ink" (the element's own marker colour) at different fill
// opacities so swapping the element's colour recolours the dominant mass while keeping the
// internal light/dark hierarchy. Secondary accents and skin get fixed palette colours so the
// clipart keeps a bit of multi-colour contrast when the dominant changes.
const ROLE_OF_FILL = new Map([
  // Hero accent — brightest ink
  ['#6c63ff', 'hero'],
  // Structural darks — the heavy outlines and shadows
  ['#3f3d56', 'dark'], ['#2f2e41', 'dark'], ['#090814', 'dark'], ['#575a89', 'dark'], ['#444053', 'dark'],
  // Light structural (content panels, UI mocks, inner strips). Previously skipped entirely,
  // which gutted tiles like landing-page / static-website / web-search. Now they come through
  // as very faint ink so the layout reads correctly.
  ['#e6e6e6', 'light'], ['#e4e4e4', 'light'], ['#d6d6e3', 'light'], ['#f2f2f2', 'light'],
  ['#d0cde1', 'light'], ['#f1f1f1', 'light'], ['#ccc', 'light'], ['#cccccc', 'light'],
  ['#ffffff', 'light'], ['#fff', 'light'],
  // Secondary pink highlights (lamps, bags, splashes)
  ['#ff6584', 'secondary'], ['#ff8e9e', 'secondary'],
  // Skin tones
  ['#ed9da0', 'skin'], ['#ffb9b9', 'skin'], ['#ffb6b6', 'skin'], ['#a0616a', 'skin'], ['#9f616a', 'skin'],
]);

const roleOf = (hex) => ROLE_OF_FILL.get((hex || '').toLowerCase()) ?? 'dark';

const ROLE_PAINT = {
  hero:      { fill: 'ink',    opacity: 0.55 },
  dark:      { fill: 'ink',    opacity: 0.22 },
  light:     { fill: 'ink',    opacity: 0.1 }, // faint structural (UI mock panels, strips, page chrome)
  secondary: { fill: 'pink',   opacity: 0.6 },
  skin:      { fill: 'orange', opacity: 0.6 },
};

// Shapes that cover almost the whole canvas are UnDraw's page backdrop; drop those, they'd just
// be a flat tint behind everything else and would hide the board.
const COVERS_CANVAS = 0.9;

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'));
  return m ? m[1] : undefined;
};

const num = (s) => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};

// Convert a <rect>/<circle>/<ellipse>/<polygon> to an equivalent path d.
function shapeToPath(name, tag) {
  if (name === 'rect') {
    const x = num(attr(tag, 'x') ?? 0), y = num(attr(tag, 'y') ?? 0);
    const w = num(attr(tag, 'width')), h = num(attr(tag, 'height'));
    return `M${x} ${y} h${w} v${h} h${-w} z`;
  }
  if (name === 'circle') {
    const cx = num(attr(tag, 'cx')), cy = num(attr(tag, 'cy')), r = num(attr(tag, 'r'));
    return `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0 z`;
  }
  if (name === 'ellipse') {
    const cx = num(attr(tag, 'cx')), cy = num(attr(tag, 'cy')), rx = num(attr(tag, 'rx')), ry = num(attr(tag, 'ry'));
    return `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${rx * 2} 0 a${rx} ${ry} 0 1 0 ${-rx * 2} 0 z`;
  }
  if (name === 'polygon' || name === 'polyline') {
    const pts = (attr(tag, 'points') ?? '').trim().split(/[\s,]+/);
    if (pts.length < 2) return null;
    const d = [`M${pts[0]} ${pts[1]}`];
    for (let i = 2; i + 1 < pts.length; i += 2) d.push(`L${pts[i]} ${pts[i + 1]}`);
    if (name === 'polygon') d.push('z');
    return d.join(' ');
  }
  return null;
}

function parseSvg(text) {
  // viewBox / width / height drive the clipart's `box`.
  const svgOpen = text.match(/<svg\b[^>]*>/i)?.[0] ?? '';
  const viewBox = attr(svgOpen, 'viewBox');
  let w, h;
  if (viewBox) {
    const [, , vw, vh] = viewBox.split(/\s+/).map(Number);
    w = vw; h = vh;
  } else {
    w = num(attr(svgOpen, 'width'));
    h = num(attr(svgOpen, 'height'));
  }
  const canvasArea = Math.max(1, w * h);
  // Outermost single <g transform="…"> is UnDraw's convention; if present, combine it into every
  // shape's transform below.
  const rootG = text.match(/<svg\b[^>]*>\s*<g\b([^>]*)>/i);
  const rootTransform = rootG ? attr(rootG[1], 'transform') : undefined;

  // Pull every shape tag (path, rect, circle, ellipse, polygon, polyline). UnDraw's output is
  // flat enough that this one-pass regex gets everything we care about.
  const shapes = [...text.matchAll(/<(path|rect|circle|ellipse|polygon|polyline)\b([^/>]*)\/?>/gi)];

  const parts = [];
  for (const [, name, body] of shapes) {
    const tag = `<${name} ${body}/>`;
    const fill = (attr(tag, 'fill') ?? '').toLowerCase();
    if (!fill || fill === 'none') continue;           // no fill → guide/mask-only shape, skip
    const role = roleOf(fill);
    // Drop near-full-canvas rects/ellipses with a "light" fill — those are UnDraw's page
    // backdrops. Keep smaller light shapes because they're content (UI panels, strips, mocks).
    if (role === 'light' && (name === 'rect' || name === 'ellipse')) {
      const sw = num(attr(tag, 'width')), sh = num(attr(tag, 'height'));
      const rx = num(attr(tag, 'rx')), ry = num(attr(tag, 'ry'));
      const area = name === 'rect' ? sw * sh : Math.PI * rx * ry;
      if (area / canvasArea >= COVERS_CANVAS) continue;
    }
    const opacity = attr(tag, 'opacity');
    const d = name === 'path' ? attr(tag, 'd') : shapeToPath(name, tag);
    if (!d) continue;
    const t = attr(tag, 'transform');
    const transform = [rootTransform, t].filter(Boolean).join(' ');
    const paint = ROLE_PAINT[role];
    const part = {
      d,
      color: paint.fill,     // stroke matches the fill role (pink skin outline etc.)
      width: 1.5,
      fill: paint.fill,
      fillOpacity: paint.opacity,
    };
    if (opacity) part.opacity = Number(opacity);
    if (transform) part.transform = transform;
    parts.push(part);
  }
  return { box: [w, h], parts };
}

async function convert(inPath, name, { force = false } = {}) {
  const out = `library/${name}.json`;
  // Safeguard: never silently overwrite a tile that was hand-edited or AI-refined. A tile with
  // `made-with-ai` in its tags is the user's own version; a fresh UnDraw conversion has only
  // `clipart` + `undraw` + `external` + the name. Pass --force to overwrite anyway.
  if (!force) {
    try {
      await access(out);
      const existing = JSON.parse(await readFile(out, 'utf8'));
      const tags = Array.isArray(existing.tags) ? existing.tags : [];
      const isPristine = tags.includes('undraw') && !tags.includes('made-with-ai');
      if (!isPristine) return { out, skipped: `has "${tags.filter((t) => t === 'made-with-ai' || !tags.includes('undraw')).join(', ') || 'custom'}" tags — pass --force to overwrite` };
    } catch {
      // File doesn't exist (or couldn't be parsed) — proceed with the fresh write.
    }
  }
  const text = await readFile(inPath, 'utf8');
  const { box, parts } = parseSvg(text);
  if (!box[0] || !box[1]) throw new Error(`${inPath}: couldn't read viewBox or width/height`);
  if (!parts.length) throw new Error(`${inPath}: no usable shapes after filtering backgrounds`);
  const def = {
    description: `${name.replace(/-/g, ' ')} (imported from UnDraw, recolours with the element's marker)`,
    tags: ['clipart', 'undraw', 'external', name],
    box,
    parts,
  };
  await writeFile(out, JSON.stringify(def, null, 1));
  return { out, parts: parts.length, box };
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const positional = args.filter((a) => a !== '--force');
if (positional[0] === '--all') {
  const dir = 'library/undraw';
  const files = (await readdir(dir)).filter((f) => f.endsWith('.svg'));
  for (const f of files) {
    const name = basename(f, extname(f));
    try {
      const r = await convert(join(dir, f), name, { force });
      if (r.skipped) console.log(`· ${r.out}: skipped — ${r.skipped}`);
      else console.log(`✓ ${r.out}: ${r.parts} parts, box ${r.box.join('×')}`);
    } catch (e) {
      console.log(`✗ ${f}: ${(e).message}`);
    }
  }
} else if (positional.length === 2) {
  const r = await convert(positional[0], positional[1], { force });
  if (r.skipped) console.log(`· ${r.out}: skipped — ${r.skipped}`);
  else console.log(`✓ ${r.out}: ${r.parts} parts, box ${r.box.join('×')}`);
} else {
  console.error('usage: node scripts/svg-to-clipart.mjs <in.svg> <out-name> [--force]  |  --all [--force]');
  process.exit(1);
}
