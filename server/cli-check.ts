// npm run check -- <file.json> [more files…]   check presentations (presentations/*.json) or library items (library/*.json)
// npm run check -- --library                   list every icon, logo, clipart and 3D model a presentation can use
// Uses the same schema and rules as the app, with your own library/ loaded, so "ok" here means it opens there.
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { checkDrawing, checkIso } from '../src/ai/iconPrompt';
import { compile } from '../src/engine/compile';
import { addIsoModels, isoModels, type IsoModel } from '../src/engine/iso';
import { addIcons, icons, type IconDef } from '../src/engine/library';
import { autoPerformance } from '../src/video/performance';
import { LIBRARY_DIR } from './library';

const args = process.argv.slice(2);

async function loadLibrary(): Promise<Set<string>> {
  const mine = new Set<string>();
  if (!existsSync(LIBRARY_DIR)) return mine;
  for (const f of (await readdir(LIBRARY_DIR)).filter((n) => n.endsWith('.json'))) {
    try {
      const def = JSON.parse(await readFile(join(LIBRARY_DIR, f), 'utf8'));
      const name = f.slice(0, -5);
      mine.add(name);
      if (def.kind === 'iso') addIsoModels({ [name]: def as IsoModel }); else addIcons({ [name]: def as IconDef });
    } catch {
      console.warn(`skipped library/${f}: not valid JSON`);
    }
  }
  return mine;
}

function listLibrary(mine: Set<string>) {
  const row = (name: string, d: string) => `  ${name.padEnd(18)} ${mine.has(name) ? '(mine) ' : ''}${d}`;
  const groups: [string, [string, IconDef][]][] = [
    ['Icons (single colour, take the element colour)', Object.entries(icons).filter(([, d]) => !d.parts && !d.tags.includes('logo'))],
    ['Logos', Object.entries(icons).filter(([, d]) => !d.parts && d.tags.includes('logo'))],
    ['Clipart (multi-colour; size = width)', Object.entries(icons).filter(([, d]) => !!d.parts)],
  ];
  for (const [title, list] of groups) {
    console.log(`\n${title}: use { "type": "icon", "icon": "<name>" }`);
    for (const [n, d] of list.sort()) console.log(row(n, d.description));
  }
  console.log('\n3D models: use { "type": "iso", "model": "<name>" }');
  for (const [n, m] of Object.entries(isoModels).sort()) console.log(row(n, m.description));
}

/** Pictures a presentation points at that can't be found (in images/ or public/). */
function missingPictures(doc: { scenes?: { elements?: { type?: string; src?: string }[] }[] }): string[] {
  const srcs = (doc.scenes ?? []).flatMap((s) => (s.elements ?? []).filter((e) => e.type === 'image' && typeof e.src === 'string' && !e.src.startsWith('data:')).map((e) => e.src!));
  return srcs.filter((src) => !existsSync(src.startsWith('/images/') ? resolve(src.slice(1)) : resolve('public', src.replace(/^\//, ''))));
}

async function checkFile(path: string): Promise<boolean> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    console.log(`✗ ${path}: ${(e as Error).message}`);
    return false;
  }
  const v = value as Record<string, unknown>;
  if (Array.isArray(v.scenes)) {
    const r = compile(value);
    if (!r.ok) {
      console.log(`✗ ${path}\n${r.errors.map((e) => `  - ${e}`).join('\n')}`);
      return false;
    }
    const p = r.presentation;
    const beats = p.scenes.reduce((n, s) => n + s.beats.length, 0);
    const notes = p.scenes.flatMap((s) => s.beats).filter((b) => b.notes).length;
    const missing = missingPictures(v as never);
    console.log(`✓ ${path}: "${p.title}", ${p.scenes.length} scenes, ${beats} beats (${notes} with speaker notes), about ${Math.round(autoPerformance(p).duration)} s of animation`);
    for (const m of missing) console.log(`  ! picture not found: ${m}`);
    return missing.length === 0;
  }
  // A library item: a 3D model, clipart (box + parts) or an icon (paths).
  const r = v.kind === 'iso' ? checkIso(value) : checkDrawing(v.parts ? 'clipart' : 'icon')(value);
  if (!r.ok) {
    console.log(`✗ ${path}\n${r.errors.map((e) => `  - ${e}`).join('\n')}`);
    return false;
  }
  console.log(`✓ ${path}: ${v.kind === 'iso' ? '3D model' : v.parts ? 'clipart' : 'icon'} "${String(v.description ?? '')}"`);
  return true;
}

const mine = await loadLibrary();
if (args.includes('--library')) {
  listLibrary(mine);
} else if (!args.length) {
  console.error('usage: npm run check -- <presentation-or-library-item.json> [more…]  |  npm run check -- --library');
  process.exit(1);
} else {
  let ok = true;
  for (const f of args) ok = (await checkFile(f)) && ok;
  process.exit(ok ? 0 : 1);
}
