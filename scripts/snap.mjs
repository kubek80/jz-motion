#!/usr/bin/env node
// Capture a static screenshot of a page and add it to the media library (as WebP), so a jz-motion presentation can
// reference it by the "/media/…" src it prints and show the real UI instead of a hand-drawn placeholder.
//
// Usage:
//   node scripts/snap.mjs <url> <name> [--phone] [--size 1280x800] [--zoom 1.25] [--scale 2] [--selector ".foo"] [--wait 500]
// Captures are sharp enough for camera zooms: see scripts/capturePage.mjs.
// or:
//   npm run snap -- <url> <name> ...
//
// Example (jz-motion itself):
//   npm run dev            # another terminal, keep running
//   npm run snap -- 'http://localhost:5173/#/p/9df1df96' editor-open
//
// For a specific element (clipped to its bounding box):
//   npm run snap -- http://localhost:5173 home --selector '.start-box'

import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { captureOptions, fakeMic, openCapturePage, SWITCHES } from './capturePage.mjs';

const args = process.argv.slice(2);
const posArgs = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1]?.startsWith('--') && !SWITCHES.has(args[i - 1])));
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const url = posArgs[0];
const name = posArgs[1];
if (!url || !name) {
  console.error('usage: node scripts/snap.mjs <url> <name> [--size WxH] [--zoom Z] [--scale S] [--selector CSS] [--wait ms]');
  process.exit(2);
}
const capture = captureOptions(value);
const waitMs = Number(value('wait', 400));
const selector = value('selector');
const scenario = value('scenario');
// The raw capture goes to scratch/captures/ (not in git); the media library keeps the converted copy.
const out = resolve('scratch/captures', `${name}.png`);

await mkdir(resolve('scratch/captures'), { recursive: true });
// Google Chrome when installed (as on a Mac), otherwise Playwright's own Chromium.
const browser = await chromium.launch({ channel: 'chrome', args: fakeMic() }).catch(() => chromium.launch({ args: fakeMic() }));
try {
  const page = await openCapturePage(browser, capture);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  if (scenario) {
    const mod = await import(pathToFileURL(resolve(scenario)).href);
    if (typeof mod.run !== 'function') throw new Error(`${scenario} must export a run(page) function`);
    await mod.run(page);
  }
  if (selector) await page.waitForSelector(selector, { timeout: 10000 });
  await page.waitForTimeout(waitMs);
  if (selector) await page.locator(selector).screenshot({ path: out });
  else await page.screenshot({ path: out, fullPage: false });
  console.log(`captured scratch/captures/${name}.png${selector ? '' : ` (${capture.pixels})`}`);
  importIntoMedia(out, name);
} finally {
  await browser.close();
}

/** Adds the capture to the media library (converted: WebP for pictures, WebM video for recordings) and prints its "/media/…" src. */
function importIntoMedia(file, name) {
  const r = spawnSync('npx', ['tsx', 'server/cli-media.ts', 'import', file, '--name', name], { stdio: 'inherit' });
  if (r.status !== 0) console.error('Could not add it to the media library; the capture is still in scratch/captures/.');
}
