// npm run snapshot -- <presentation.json> [--beats] [--scene N] [--out dir]
// Saves what each scene looks like when it is fully drawn (or, with --beats, after every beat) as PNGs,
// so you can look at a presentation without opening the app. Default output: snapshots/<name>/.
import { mkdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { createServer } from 'vite';
import { compile } from '../src/engine/compile';
import type { Performance } from '../src/video/performance';

const args = process.argv.slice(2);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const input = args.find((a, i) => !a.startsWith('--') && !['--out', '--scene'].includes(args[i - 1]));
if (!input) {
  console.error('usage: npm run snapshot -- <presentation.json> [--beats] [--scene N] [--out dir]');
  process.exit(1);
}
const presentation = JSON.parse(await readFile(input, 'utf8'));
const r = compile(presentation);
if (!r.ok) {
  // Library items made in the app are only known to the page; let it report what is really wrong.
  if (!r.errors.every((e) => /unknown (icon|iso model)/.test(e))) {
    console.error(`${input} does not load:\n${r.errors.map((e) => `  - ${e}`).join('\n')}`);
    process.exit(1);
  }
}
const out = resolve(value('out') ?? join('snapshots', basename(input).replace(/\.json$/, '')));
await mkdir(out, { recursive: true });

// One moment per picture: a scene at the end of a beat (or of the whole scene), each a second apart.
const shots: { file: string; scene: number; time: number }[] = [];
const onlyScene = value('scene') ? Number(value('scene')) - 1 : undefined;
const scenes = r.ok ? r.presentation.scenes : (presentation.scenes as unknown[]).map(() => null);
scenes.forEach((sc, si) => {
  if (onlyScene !== undefined && si !== onlyScene) return;
  const beats = sc?.beats ?? [];
  if (args.includes('--beats') && beats.length) beats.forEach((b, bi) => shots.push({ file: `scene-${si + 1}-beat-${bi + 1}.png`, scene: si, time: b.end }));
  else shots.push({ file: `scene-${si + 1}.png`, scene: si, time: sc ? sc.duration : 1e6 });
});
const perf: Performance = { events: shots.map((s, i) => ({ t: i, scene: s.scene, from: s.time, until: s.time })), duration: shots.length };

const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
await server.listen();
const { chromium } = await import('playwright');
const browser = await chromium.launch(process.env.JZM_CHROMIUM ? { executablePath: process.env.JZM_CHROMIUM } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${server.resolvedUrls!.local[0].replace(/\/$/, '')}/?render`);
  await page.waitForFunction(() => !!window.jzmRender);
  await page.evaluate(([p, pf]) => window.jzmRender!.load(p, pf), [presentation, perf] as const);
  for (let i = 0; i < shots.length; i++) {
    await page.evaluate((t) => window.jzmRender!.frame(t), i + 0.5);
    await page.waitForTimeout(50);
    await page.screenshot({ path: join(out, shots[i].file) });
  }
  console.log(`wrote ${shots.length} picture${shots.length === 1 ? '' : 's'} to ${out}`);
} finally {
  await browser.close();
  await server.close();
}
