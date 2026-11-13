#!/usr/bin/env node
// Record a short user-interaction clip of a web app and add it to the media library (as WebM video),
// so a jz-motion presentation can reference it by the "/media/…" src it prints and play the actual UI
// motion in sync with the narration ("play" action).
//
// The page is filmed while the scenario runs (scripts/screencast.mjs) and the video added to the media library.
// Captures are sharp enough for camera zooms (2560×1600 by default): see scripts/capturePage.mjs.
//
// Usage:
//   node scripts/record.mjs <url> <name> <scenario.mjs> [--phone] [--size WxH] [--zoom Z] [--scale S] [--fps N]
// or:
//   npm run record -- <url> <name> <scenario>
//
// Example:
//   npm run dev            # another terminal, keep running
//   npm run record -- 'http://localhost:5173/#/p/9df1df96' edit-text scripts/scenarios/edit-text.mjs
//
// A scenario file exports `run(page)` and does the clicks/types. The browser is open at <url> before
// run() is called (after an optional `setup(page)`, which isn't recorded). Frames are kept while run() executes
// (at most <fps> a second); it stops when run() returns.

import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { captureOptions, launchForRecording, SWITCHES } from './capturePage.mjs';
import { importIntoMedia, screencast } from './screencast.mjs';

const args = process.argv.slice(2);
const posArgs = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1]?.startsWith('--') && !SWITCHES.has(args[i - 1])));
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const url = posArgs[0];
const name = posArgs[1];
const scenario = posArgs[2];
if (!url || !name || !scenario) {
  console.error('usage: node scripts/record.mjs <url> <name> <scenario.mjs> [--phone] [--size WxH] [--zoom Z] [--scale S] [--fps N]');
  process.exit(2);
}
const capture = captureOptions(value);
const fps = Number(value('fps', 15));

const { browser, page } = await launchForRecording(chromium, capture);
let shot;
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(300);

  const mod = await import(pathToFileURL(resolve(scenario)).href);
  if (typeof mod.run !== 'function') throw new Error(`${scenario} must export a run(page) function`);
  // An optional setup(page) gets the page ready (settings, a reload) before anything is recorded.
  if (typeof mod.setup === 'function') await mod.setup(page);
  shot = await screencast(page, () => mod.run(page), { name, fps });
} finally {
  await browser.close();
}
console.log(`captured ${shot.frames} frames at ${capture.pixels}: scratch/captures/${name}.mkv (${shot.seconds.toFixed(1)}s)`);
importIntoMedia(shot.file, name);
