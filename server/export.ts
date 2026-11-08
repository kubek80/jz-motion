import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { cpus } from 'node:os';
import { dirname } from 'node:path';
import { compile } from '../src/engine/compile';
import { buildFfmpegArgs } from '../src/video/ffmpeg';
import { autoPerformance, layoutSegments, type AutoTiming, type Performance } from '../src/video/performance';
import { registerLibrary } from './library';
import { FFMPEG, ffmpegMissing } from './media';
import { trackPath, type Take } from './takes';

export interface ExportOptions {
  presentation: unknown;
  take?: Take;
  /** Use the presentation saved with the take (default), so its recorded timing matches. */
  useTakePresentation?: boolean;
  fps: number;
  /** 1 = 1920×1080, 2 = 3840×2160. */
  scale: 1 | 2;
  timing?: AutoTiming;
  out: string;
  /** Where the app is served, for the render page. */
  appUrl: string;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  /** Even out the sound's loudness (default on). */
  normalizeAudio?: boolean;
  /** Browser pages rendering frames in parallel. Default: number of CPUs − 1, at most 8 (4 for 4K) (or JZM_EXPORT_WORKERS). */
  workers?: number;
}

/**
 * Renders a presentation to MP4: a headless browser draws every frame exactly (no screen recording),
 * FFmpeg encodes them and lays recorded camera tracks out according to each beat's layout.
 */
export async function exportVideo(opts: ExportOptions): Promise<{ file: string; duration: number; frames: number; repeated: number }> {
  const source = opts.take && opts.useTakePresentation !== false ? opts.take.presentation : opts.presentation;
  // Icons and models made in the app are checked like built-in ones (the render page loads them too).
  await registerLibrary();
  const compiled = compile(source);
  if (!compiled.ok) throw new Error(`The presentation has errors:\n${compiled.errors.join('\n')}`);
  const perf: Performance = opts.take?.performance ?? autoPerformance(compiled.presentation, opts.timing);
  const { fps } = opts;
  const width = 1920 * opts.scale;
  const height = 1080 * opts.scale;
  const frames = Math.ceil(perf.duration * fps);
  const tracks = (opts.take?.tracks ?? []).map((t) => ({ ...t, path: trackPath(opts.take!.id, t), trimStart: t.trimStart, trimEnd: t.trimEnd, duration: t.duration }));

  await mkdir(dirname(opts.out), { recursive: true });
  const args = buildFfmpegArgs({
    width, height, fps, duration: frames / fps, out: opts.out, tracks, normalizeAudio: opts.normalizeAudio,
    // Your avatar shows only where a scene or beat asks for the camera; a camera running throughout shows in a corner.
    segments: layoutSegments(compiled.presentation, perf, fps, opts.take?.tracks.some((t) => t.avatar) ? 'board' : 'pip'),
  });
  const ffmpeg = spawn(FFMPEG, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let ffmpegError = '';
  ffmpeg.stderr.on('data', (d: Buffer) => (ffmpegError += d.toString()));
  const finished = new Promise<void>((resolve, reject) => {
    ffmpeg.on('error', (e) => reject(new Error(ffmpegMissing(FFMPEG, e.message))));
    ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg failed: ${ffmpegError.slice(-1500)}`))));
  });
  finished.catch(() => undefined);

  const { chromium } = await import('playwright');
  const browser = await chromium.launch(process.env.JZM_CHROMIUM ? { executablePath: process.env.JZM_CHROMIUM } : {});
  // Each page paints frames on its own processor core; 4K pages use a lot of memory, so fewer of them.
  const workers = Math.max(1, Math.min(frames, opts.workers ?? (Number(process.env.JZM_EXPORT_WORKERS) || Math.min(opts.scale === 2 ? 4 : 8, Math.max(1, cpus().length - 1)))));
  // Frames finish out of order across workers; FFmpeg needs them in order. `null`: the same as the frame before
  // (nothing on the board moved), which costs no drawing or screenshot: the last picture is sent again.
  const pending = new Map<number, Buffer | null>();
  let nextToWrite = 0;
  let last: Buffer | undefined;
  let repeated = 0;
  let writing = Promise.resolve();
  const flush = () => {
    writing = writing.then(async () => {
      while (pending.has(nextToWrite)) {
        const frame = pending.get(nextToWrite);
        pending.delete(nextToWrite++);
        const jpeg = frame ?? last!;
        last = jpeg;
        if (!ffmpeg.stdin.write(jpeg)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
        opts.onProgress?.(nextToWrite, frames);
      }
    });
    return writing;
  };
  try {
    await Promise.all(Array.from({ length: workers }, async (_, w) => {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: opts.scale });
      const page = await context.newPage();
      await page.goto(`${opts.appUrl.replace(/\/$/, '')}/?render`);
      await page.waitForFunction(() => !!window.jzmRender);
      await page.evaluate(([p, perf]) => window.jzmRender!.load(p, perf), [source, perf] as const);
      const cdp = await context.newCDPSession(page);
      // Interleaved frames (w, w + workers, ...) keep the workers close together, so little waits in memory.
      for (let f = w; f < frames; f += workers) {
        if (opts.signal?.aborted || ffmpeg.exitCode !== null) throw new Error(ffmpeg.exitCode !== null ? `FFmpeg stopped: ${ffmpegError.slice(-800)}` : 'cancelled');
        const same = await page.evaluate(([t, before]) => window.jzmRender!.frame(t, before), [f / fps, f > 0 ? (f - 1) / fps : undefined] as const);
        if (same) {
          pending.set(f, null);
          repeated++;
        } else {
          const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: true });
          pending.set(f, Buffer.from(shot.data, 'base64'));
        }
        // Don't let one worker run far ahead of the writer.
        while (f - nextToWrite > workers * 8) await new Promise((r) => setTimeout(r, 10));
        void flush();
      }
      await context.close();
    }));
    await flush();
  } catch (e) {
    ffmpeg.kill('SIGKILL');
    throw e;
  } finally {
    await browser.close();
  }
  ffmpeg.stdin.end();
  await finished;
  return { file: opts.out, duration: frames / fps, frames, repeated };
}
