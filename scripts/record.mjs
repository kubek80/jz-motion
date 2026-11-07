#!/usr/bin/env node
// Record a short user-interaction clip of a web app and add it to the media library (as WebM video),
// so a jz-motion presentation can reference it by the "/media/…" src it prints and play the actual UI
// motion in sync with the narration ("play" action).
//
// Chrome's screencast captures the page as it repaints while the scenario runs; FFmpeg joins the frames, each held
// as long as it was on screen, into a lossless video in scratch/captures/, which the media library converts to WebM video.
// Captures are sharp enough for camera zooms (2560×1600 by default): see scripts/capturePage.mjs.
//
// Usage:
//   node scripts/record.mjs <url> <name> <scenario.mjs> [--size WxH] [--zoom Z] [--scale S] [--fps N]
// or:
//   npm run record -- <url> <name> <scenario>
//
// Example:
//   npm run dev            # another terminal, keep running
//   npm run record -- 'http://localhost:5173/#/p/9df1df96' edit-text scripts/scenarios/edit-text.mjs
//
// A scenario file exports `run(page)` and does the clicks/types. The browser is open at <url> before
// run() is called. Frames are kept while run() executes (at most <fps> a second); it stops when run() returns.

import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { captureOptions, launchForRecording } from './capturePage.mjs';

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
  console.error('usage: node scripts/record.mjs <url> <name> <scenario.mjs> [--size WxH] [--zoom Z] [--scale S] [--fps N]');
  process.exit(2);
}
const capture = captureOptions(value);
const fps = Number(value('fps', 15));
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
// The raw capture goes to scratch/captures/ (not in git); the media library keeps the converted copy.
const out = resolve('scratch/captures', `${name}.mkv`);
const framesDir = resolve('scratch/captures', `${name}-frames`);

await rm(framesDir, { recursive: true, force: true });
await mkdir(framesDir, { recursive: true });

const { browser, page } = await launchForRecording(chromium, capture);
const frames = []; // { t: ms since start, file }
let ended = 0;
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(300);

  const mod = await import(pathToFileURL(resolve(scenario)).href);
  if (typeof mod.run !== 'function') throw new Error(`${scenario} must export a run(page) function`);

  // Chrome's screencast sends a frame whenever the page repaints. Frames go straight to disk (too big to keep in
  // memory), at most <fps> a second; a frame skipped for that is still written if nothing newer follows it.
  const cdp = await page.context().newCDPSession(page);
  let started = 0;
  let pending = null;
  const write = (f) => {
    const file = join(framesDir, `${String(frames.length).padStart(5, '0')}.png`);
    frames.push({ t: f.t, file });
    return writeFile(file, Buffer.from(f.data, 'base64'));
  };
  const writes = [];
  cdp.on('Page.screencastFrame', (f) => {
    void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined);
    const t = f.metadata.timestamp * 1000;
    if (!started) started = t;
    const frame = { t: t - started, data: f.data };
    if (frames.length && frame.t - frames.at(-1).t < 1000 / fps) { pending = frame; return; }
    pending = null;
    writes.push(write(frame));
  });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  const t0 = Date.now();
  await mod.run(page);
  await page.waitForTimeout(100);
  await cdp.send('Page.stopScreencast');
  if (pending) writes.push(write(pending));
  await Promise.all(writes);
  ended = Math.max(Date.now() - t0, (frames.at(-1)?.t ?? 0) + 1000 / fps);
} finally {
  await browser.close();
}

if (!frames.length) throw new Error('no frames captured');
console.log(`captured ${frames.length} frames at ${capture.pixels}`);

// Each frame is held until the next one was taken; the last for one frame's time. FFV1 keeps every pixel.
const list = frames.map((f, i) => {
  const until = i < frames.length - 1 ? frames[i + 1].t : ended;
  return `file '${f.file.replace(/'/g, "'\\''")}'\nduration ${((until - f.t) / 1000).toFixed(3)}`;
});
list.push(`file '${frames.at(-1).file.replace(/'/g, "'\\''")}'`); // the concat demuxer needs the last file twice for its duration to count
const listFile = join(framesDir, 'frames.txt');
await writeFile(listFile, `ffconcat version 1.0\n${list.join('\n')}\n`);
const r = spawnSync(FFMPEG, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-fps_mode', 'vfr', '-c:v', 'ffv1', '-pix_fmt', 'yuv444p', out], { stdio: 'inherit' });
if (r.status !== 0) {
  console.error(`FFmpeg could not join the frames (${r.error?.message ?? `exit ${r.status}`}); they are in ${framesDir}. Install FFmpeg or set FFMPEG_PATH.`);
  process.exit(1);
}
await rm(framesDir, { recursive: true, force: true });
console.log(`captured scratch/captures/${name}.mkv (${(ended / 1000).toFixed(1)}s)`);
importIntoMedia(out, name);

/** Adds the capture to the media library (converted: WebP for pictures, WebM video for recordings) and prints its "/media/…" src. */
function importIntoMedia(file, name) {
  const r = spawnSync('npx', ['tsx', 'server/cli-media.ts', 'import', file, '--name', name], { stdio: 'inherit' });
  if (r.status !== 0) console.error('Could not add it to the media library; the capture is still in scratch/captures/.');
}
