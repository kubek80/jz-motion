// npm run assets            pictures, recordings and voice-overs: size, type, and which presentations use them
// npm run assets -- --unused   only the files nothing uses (paths, one per line; nothing is deleted)
// Reads presentations/, src/examples/ and library/ for references to /images/…, /examples/… and uploads.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const DIRS = ['images', 'uploads', 'public/examples'];
const SOURCES = ['presentations', 'src/examples', 'library'];

const files = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile() && !d.name.startsWith('.'))
  .map((d) => join(d.parentPath ?? (d as unknown as { path: string }).path, d.name)) : []);

// Who refers to what: "/images/x.png", "/examples/about/x.jpg", and voice-over uploads ("upload": "x.webm").
const usedBy = new Map<string, string[]>();
const note = (key: string, by: string) => usedBy.set(key, [...(usedBy.get(key) ?? []), by]);
for (const dir of SOURCES) {
  for (const f of files(dir).filter((p) => p.endsWith('.json'))) {
    const text = readFileSync(f, 'utf8');
    let title = f;
    try { title = `${JSON.parse(text).title ?? f}`; } catch { /* not JSON */ }
    for (const m of text.matchAll(/"\/(images|examples)\/([^"?]+)"/g)) note(m[1] === 'images' ? `images/${m[2]}` : `public/examples/${m[2]}`, title);
    for (const m of text.matchAll(/"upload"\s*:\s*"([^"]+)"/g)) note(`uploads/${m[1]}`, title);
  }
}

const kind = (p: string) => (/\.(apng|gif)$/i.test(p) ? 'animation' : /\.(png|jpe?g|webp|svg)$/i.test(p) ? 'picture' : /\.(webm|mp4|mov|m4a|mp3|wav|ogg)$/i.test(p) ? 'recording' : 'other');
const rows = DIRS.flatMap((d) => files(d)).filter((p) => !/\.(json)$/.test(p)).map((p) => ({ path: p, bytes: statSync(p).size, kind: kind(p), users: [...new Set(usedBy.get(p) ?? [])] }));
const mb = (n: number) => `${(n / 1e6).toFixed(2)} MB`;

if (args.includes('--unused')) {
  for (const r of rows.filter((r) => !r.users.length)) console.log(r.path);
  process.exit(0);
}

for (const dir of DIRS) {
  const inDir = rows.filter((r) => r.path.startsWith(`${dir}/`)).sort((a, b) => b.bytes - a.bytes);
  if (!inDir.length) continue;
  const unused = inDir.filter((r) => !r.users.length);
  console.log(`\n${dir}/  ${inDir.length} files, ${mb(inDir.reduce((a, r) => a + r.bytes, 0))}; not used by anything: ${unused.length} files, ${mb(unused.reduce((a, r) => a + r.bytes, 0))}`);
  for (const r of inDir) console.log(`  ${mb(r.bytes).padStart(9)}  ${r.kind.padEnd(9)} ${r.path.slice(dir.length + 1).padEnd(36)} ${r.users.length ? r.users.join(', ') : '— unused'}`);
}
const missing = [...usedBy.keys()].filter((k) => !existsSync(k));
if (missing.length) {
  console.log(`\nReferenced but missing on this computer (${missing.length}):`);
  for (const k of missing) console.log(`  ${k}  ← ${[...new Set(usedBy.get(k))].join(', ')}`);
}
