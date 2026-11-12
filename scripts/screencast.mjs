// Filming a browser page while something happens on it, shared by record.mjs (a web app) and terminal.mjs (a
// terminal session): Chrome's screencast sends a frame whenever the page repaints; FFmpeg joins the frames, each held
// as long as it was on screen, into a lossless video in scratch/captures/, which the media library converts to WebM.

import { spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

/**
 * Films `page` while `run()` runs (at most `fps` frames a second), then joins the frames into
 * scratch/captures/<name>.mkv. Returns its path and length in seconds.
 */
export async function screencast(page, run, { name, fps = 15 }) {
  const out = resolve('scratch/captures', `${name}.mkv`);
  const framesDir = resolve('scratch/captures', `${name}-frames`);
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });
  const frames = []; // { t: ms since start, file }
  // Frames go straight to disk (too big to keep in memory), at most <fps> a second; a frame skipped for that is
  // still written if nothing newer follows it.
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
  await run();
  await page.waitForTimeout(100);
  await cdp.send('Page.stopScreencast');
  if (pending) writes.push(write(pending));
  await Promise.all(writes);
  const ended = Math.max(Date.now() - t0, (frames.at(-1)?.t ?? 0) + 1000 / fps);
  if (!frames.length) throw new Error('no frames captured');

  // Each frame is held until the next one was taken; the last for one frame's time. FFV1 keeps every pixel.
  const list = frames.map((f, i) => {
    const until = i < frames.length - 1 ? frames[i + 1].t : ended;
    return `file '${f.file.replace(/'/g, "'\\''")}'\nduration ${((until - f.t) / 1000).toFixed(3)}`;
  });
  list.push(`file '${frames.at(-1).file.replace(/'/g, "'\\''")}'`); // the concat demuxer needs the last file twice for its duration to count
  const listFile = join(framesDir, 'frames.txt');
  await writeFile(listFile, `ffconcat version 1.0\n${list.join('\n')}\n`);
  const r = spawnSync(FFMPEG, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-fps_mode', 'vfr', '-c:v', 'ffv1', '-pix_fmt', 'yuv444p', out], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`FFmpeg could not join the frames (${r.error?.message ?? `exit ${r.status}`}); they are in ${framesDir}. Install FFmpeg or set FFMPEG_PATH.`);
  await rm(framesDir, { recursive: true, force: true });
  return { file: out, seconds: ended / 1000, frames: frames.length };
}

/** Adds a capture to the media library (converted: WebP for pictures, WebM video for recordings) and prints its "/media/…" src. */
export function importIntoMedia(file, name) {
  const r = spawnSync('npx', ['tsx', 'server/cli-media.ts', 'import', file, '--name', name], { stdio: 'inherit' });
  if (r.status !== 0) console.error('Could not add it to the media library; the capture is still in scratch/captures/.');
}
