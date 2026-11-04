#!/usr/bin/env node
// Capture a static screenshot of a page into images/<name>.png, so a jz-motion presentation can
// reference it as "src": "/images/<name>.png" and show the real UI instead of a hand-drawn placeholder.
//
// Usage:
//   node scripts/snap.mjs <url> <name> [--size 1280x800] [--selector ".foo"] [--wait 500]
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
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const posArgs = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const url = posArgs[0];
const name = posArgs[1];
if (!url || !name) {
  console.error('usage: node scripts/snap.mjs <url> <name> [--size WxH] [--selector CSS] [--wait ms]');
  process.exit(2);
}
const [w, h] = (value('size', '1280x800')).split('x').map(Number);
const waitMs = Number(value('wait', 400));
const selector = value('selector');
const scenario = value('scenario');
const out = resolve('images', `${name}.png`);

await mkdir(resolve('images'), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
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
  console.log(`→ images/${name}.png`);
} finally {
  await browser.close();
}
