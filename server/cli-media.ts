// npm run media -- import <file…> [--name "Display name"]   add files to the media library (converted)
// npm run media -- migrate [--apply]                         move pictures and recordings from images/ into media/
// npm run media -- frames <file|/media/src>                   a recording's frames (its distinct pictures), for play's goto / until
//
// migrate converts every images/ file a presentation uses (PNG → WebP, APNG/GIF → WebM video), rewrites the
// presentations to point at /media/…, and moves images/ files nothing uses into scratch/images/ (ignored by git,
// so nothing is lost: delete that folder yourself when you're sure). Without --apply it only says what it would do.
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { importFile, mediaFrames } from './mediaStore';

const args = process.argv.slice(2);
const [command, ...rest] = args;
const apply = rest.includes('--apply');
const kb = (n: number) => `${Math.round(n / 1024)} KB`;

async function importCommand() {
  const nameAt = rest.indexOf('--name');
  const name = nameAt >= 0 ? rest[nameAt + 1] : undefined;
  const files = rest.filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--name');
  if (!files.length) throw new Error('usage: npm run media -- import <file…> [--name "Display name"]');
  for (const f of files) {
    const e = await importFile(f, files.length === 1 ? name : undefined);
    console.log(`✓ ${f} → ${e.src}  (${e.kind}, ${kb(e.original?.bytes ?? 0)} → ${kb(e.bytes)})`);
  }
}

async function migrate() {
  // Every presentation (and library item) that mentions /images/<file>.
  const sources: { path: string; text: string }[] = [];
  for (const dir of ['presentations', 'library']) {
    if (!existsSync(dir)) continue;
    for (const f of (await readdir(dir)).filter((n) => n.endsWith('.json'))) sources.push({ path: join(dir, f), text: await readFile(join(dir, f), 'utf8') });
  }
  const used = new Set(sources.flatMap((s) => [...s.text.matchAll(/"\/images\/([^"?]+)"/g)].map((m) => m[1])));
  const present = existsSync('images') ? (await readdir('images')).filter((f) => !f.startsWith('.')) : [];
  const toConvert = present.filter((f) => used.has(f));
  const unused = present.filter((f) => !used.has(f));
  const missing = [...used].filter((f) => !present.includes(f));

  console.log(`${toConvert.length} used files to convert into media/, ${unused.length} unused files to move to scratch/images/${missing.length ? `, ${missing.length} referenced but missing` : ''}.`);
  for (const f of missing) console.log(`  ! missing: images/${f} (left as is)`);
  if (!apply) {
    for (const f of toConvert) console.log(`  convert images/${f}`);
    for (const f of unused) console.log(`  move    images/${f} → scratch/images/`);
    console.log('\nNothing changed. Run again with --apply to do it.');
    return;
  }

  const map = new Map<string, string>();
  let before = 0;
  let after = 0;
  for (const f of toConvert) {
    const e = await importFile(join('images', f), f.replace(/\.[^.]+$/, ''));
    map.set(`/images/${f}`, e.src);
    before += e.original?.bytes ?? 0;
    after += e.bytes;
    console.log(`✓ images/${f} → ${e.src}  (${kb(e.original?.bytes ?? 0)} → ${kb(e.bytes)})`);
  }
  for (const s of sources) {
    let text = s.text;
    for (const [from, to] of map) text = text.split(`"${from}"`).join(`"${to}"`);
    if (text !== s.text) {
      await writeFile(s.path, text);
      console.log(`  updated ${s.path}`);
    }
  }
  // The converted originals and the unused files both leave images/; nothing is deleted.
  await mkdir('scratch/images', { recursive: true });
  for (const f of [...toConvert, ...unused]) await rename(join('images', f), join('scratch/images', f));
  console.log(`\nConverted ${toConvert.length} files: ${kb(before)} → ${kb(after)}. Moved ${toConvert.length + unused.length} files from images/ to scratch/images/ (not in git).`);
}

async function framesCommand() {
  const file = (rest[0] ?? '').replace(/^\/?media\//, '');
  if (!file) throw new Error('usage: npm run media -- frames <file>   (e.g. 1d393ff1793636be.webm or /media/1d393ff1793636be.webm)');
  const { times } = await mediaFrames(file);
  if (!times.length) throw new Error(`${file} has no frames (not a recording in media/?)`);
  console.log(`${file}: ${times.length} frames (distinct pictures). In a play action: "goto": N or "until": N.`);
  times.forEach((t, i) => console.log(`  frame ${String(i + 1).padStart(3)}  starts ${t.toFixed(2)} s`));
}

try {
  if (command === 'import') await importCommand();
  else if (command === 'frames') await framesCommand();
  else if (command === 'migrate') await migrate();
  else {
    console.error('usage: npm run media -- import <file…> | migrate [--apply] | frames <file>');
    process.exit(1);
  }
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
