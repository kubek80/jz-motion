import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { cpus } from 'node:os';
import { dirname } from 'node:path';
import { compile } from '../src/engine/compile';
import { buildFfmpegArgs } from '../src/video/ffmpeg';
import { autoPerformance, layoutSegments, type AutoTiming, type Performance } from '../src/video/performance';
import { FFMPEG } from './media';
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
  /** Browser pages rendering frames in parallel. Default: number of CPUs − 1, at most 4 (or JZM_EXPORT_WORKERS). */
  workers?: number;
}

/**
 * Renders a presentation to MP4: a headless browser draws every frame exactly (no screen recording),
 * FFmpeg encodes them and lays recorded camera tracks out according to each beat's layout.
 */
export async function exportVideo(opts: ExportOptions): Promise<{ file: string; duration: number }> {
  const source = opts.take && opts.useTakePresentation !== false ? opts.take.presentation : opts.presentation;
  const compiled = compile(source);
  if (!compiled.ok) throw new Error(`The presentation has errors:\n${compiled.errors.join('\n')}`);
  const perf: Performance = opts.take?.performance ?? autoPerformance(compiled.presentation, opts.timing);
  const { fps } = opts;
  const width = 1920 * opts.scale;
  const height = 1080 * opts.scale;
  const frames = Math.ceil(perf.duration * fps);
  const tracks = (opts.take?.tracks ?? []).map((t) => ({ ...t, path: trackPath(opts.take!.id, t) }));

  await mkdir(dirname(opts.out), { recursive: true });
  const args = buildFfmpegArgs({
    width, height, fps, duration: frames / fps, out: opts.out, tracks,
    segments: layoutSegments(compiled.presentation, perf, fps),
  });
  const ffmpeg = spawn(FFMPEG, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let ffmpegError = '';
  ffmpeg.stderr.on('data', (d: Buffer) => (ffmpegError += d.toString()));
  const finished = new Promise<void>((resolve, reject) => {
    ffmpeg.on('error', (e) => reject(new Error(`FFmpeg could not start (${e.message}). Install FFmpeg or set FFMPEG_PATH.`)));
    ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg failed: ${ffmpegError.slice(-1500)}`))));
  });
  finished.catch(() => undefined);

  const { chromium } = await import('playwright');
  const browser = await chromium.launch(process.env.JZM_CHROMIUM ? { executablePath: process.env.JZM_CHROMIUM } : {});
  const workers = Math.max(1, Math.min(frames, opts.workers ?? (Number(process.env.JZM_EXPORT_WORKERS) || Math.min(4, Math.max(1, cpus().length - 1)))));
  // Frames finish out of order across workers; FFmpeg needs them in order.
  const pending = new Map<number, Buffer>();
  let nextToWrite = 0;
  let writing = Promise.resolve();
  const flush = () => {
    writing = writing.then(async () => {
      while (pending.has(nextToWrite)) {
        const jpeg = pending.get(nextToWrite)!;
        pending.delete(nextToWrite++);
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
        await page.evaluate((t) => window.jzmRender!.frame(t), f / fps);
        const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: true });
        pending.set(f, Buffer.from(shot.data, 'base64'));
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
  return { file: opts.out, duration: frames / fps };
}
