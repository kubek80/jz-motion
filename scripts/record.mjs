#!/usr/bin/env node
// Record a short user-interaction clip of a web app and save it as an APNG into images/<name>.apng,
// so a jz-motion presentation can reference it as "src": "/images/<name>.apng" and play the actual UI
// motion in sync with the narration ("play" action).
//
// Capture is pure-JS (Playwright + upng-js); no FFmpeg needed. jz-motion plays APNGs through the
// browser's ImageDecoder in the same way as GIF and animated WebP.
//
// Usage:
//   node scripts/record.mjs <url> <name> <scenario.mjs> [--size WxH] [--fps N]
// or:
//   npm run record -- <url> <name> <scenario>
//
// Example:
//   npm run dev            # another terminal, keep running
//   npm run record -- 'http://localhost:5173/#/p/9df1df96' edit-text scripts/scenarios/edit-text.mjs
//
// A scenario file exports `run(page)` and does the clicks/types. The browser is open at <url> before
// run() is called. The capture loop screenshots at <fps> while run() executes; stops when it returns.

import { chromium } from 'playwright';
import UPNG from 'upng-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const posArgs = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const url = posArgs[0];
const name = posArgs[1];
const scenario = posArgs[2];
if (!url || !name || !scenario) {
  console.error('usage: node scripts/record.mjs <url> <name> <scenario.mjs> [--size WxH] [--fps N]');
  process.exit(2);
}
const [vw, vh] = (value('size', '1280x800')).split('x').map(Number);
const fps = Number(value('fps', 15));
const out = resolve('images', `${name}.apng`);

await mkdir(resolve('images'), { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const frames = []; // { t: ms since start, buf: PNG Buffer }
try {
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(300);

  const mod = await import(pathToFileURL(resolve(scenario)).href);
  if (typeof mod.run !== 'function') throw new Error(`${scenario} must export a run(page) function`);

  // Capture loop runs in parallel with the scenario; stops when `capturing` flips.
  let capturing = true;
  const started = Date.now();
  const captureLoop = (async () => {
    while (capturing) {
      const t = Date.now() - started;
      try { frames.push({ t, buf: await page.screenshot({ type: 'png' }) }); }
      catch { break; }
      const elapsed = (Date.now() - started) - t;
      const sleep = Math.max(0, (1000 / fps) - elapsed);
      await new Promise((r) => setTimeout(r, sleep));
    }
  })();

  await mod.run(page);
  capturing = false;
  await captureLoop;
} finally {
  await browser.close();
}

if (!frames.length) throw new Error('no frames captured');
console.log(`captured ${frames.length} frames at ${vw}×${vh}`);

// Encode: decode each PNG to RGBA, then upng-js stitches them with per-frame delays (ms).
const rgbaFrames = [];
let W = 0, H = 0;
for (const { buf } of frames) {
  const img = UPNG.decode(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const rgba = UPNG.toRGBA8(img)[0];
  if (!W) { W = img.width; H = img.height; }
  rgbaFrames.push(rgba);
}
const delays = [];
for (let i = 0; i < frames.length; i++) {
  const next = i < frames.length - 1 ? frames[i + 1].t : frames[i].t + Math.round(1000 / fps);
  delays.push(Math.max(10, next - frames[i].t));
}
const apng = UPNG.encode(rgbaFrames, W, H, 0, delays);
await writeFile(out, Buffer.from(apng));
console.log(`→ images/${name}.apng (${(apng.byteLength / 1024).toFixed(0)} KB, ${(frames.at(-1).t / 1000).toFixed(1)}s)`);
