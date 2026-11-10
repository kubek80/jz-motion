import { createReadStream } from 'node:fs';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Performance } from '../src/video/performance';
import type { Outline } from './export';
import { FFPROBE, run } from './media';

// Exported videos (exports/*.mp4), for looking at them frame by frame in the Video tab: the list, each video with
// seeking (range requests), what an export knows about itself (exports/<file>.json: the presentation, its timing and
// frame rate, written when it is made, so a frame can be named by its scene and beat), and notes on frames
// (exports/<file>.notes.json).
//
//   GET /api/exports                    [{ file, size, modified, fps, duration, presentationId?, timed }]
//   GET /api/exports/<file>/notes       [{ frame, t, scene?, beat?, text }]
//   PUT /api/exports/<file>/notes       the same, replacing them
//   GET /api/exports/<file>/timing      { presentationId, fps, performance } (404 for exports made before)
//   GET /exports/<file>                 the video

export interface ExportInfo { presentationId?: string; title?: string; fps: number; performance: Performance; outline?: Outline; made: string }
export interface FrameNote { frame: number; t: number; scene?: string; beat?: string; text: string }

const isVideo = (f: string) => /^[\w.-]+\.mp4$/.test(f);

/** Writes what an export knows about itself next to it (its timing, for naming frames by scene and beat). */
export async function writeExportInfo(dir: string, file: string, info: ExportInfo) {
  await writeFile(join(dir, `${file}.json`), `${JSON.stringify(info)}\n`);
}

const probed = new Map<string, { at: number; fps: number; duration: number }>();
async function probeVideo(path: string, mtime: number) {
  const known = probed.get(path);
  if (known && known.at === mtime) return known;
  const out = JSON.parse((await run(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate:format=duration', '-of', 'json', path])).toString());
  const [n, d] = String(out.streams?.[0]?.r_frame_rate ?? '30/1').split('/').map(Number);
  const v = { at: mtime, fps: d ? n / d : 30, duration: Number(out.format?.duration) || 0 };
  probed.set(path, v);
  return v;
}

export async function listExports(dir: string) {
  const files = (await readdir(dir).catch(() => [] as string[])).filter(isVideo);
  const out = await Promise.all(files.map(async (file) => {
    const path = join(dir, file);
    const s = await stat(path);
    const p = await probeVideo(path, s.mtimeMs).catch(() => ({ fps: 30, duration: 0 }));
    const info: ExportInfo | null = await readFile(join(dir, `${file}.json`), 'utf8').then(JSON.parse, () => null);
    return { file, size: s.size, modified: s.mtime.toISOString(), fps: info?.fps ?? p.fps, duration: p.duration, presentationId: info?.presentationId, timed: !!info };
  }));
  return out.sort((a, b) => b.modified.localeCompare(a.modified));
}

/** The routes above; false when the request is not one of them. */
export async function exportFileRoutes(req: IncomingMessage, res: ServerResponse, url: URL, dir: string, send: (res: ServerResponse, code: number, data: unknown) => void): Promise<boolean> {
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.pathname === '/api/exports' && req.method === 'GET') { send(res, 200, await listExports(dir)); return true; }
  if (parts[0] === 'api' && parts[1] === 'exports' && parts[2] && isVideo(parts[2])) {
    const file = parts[2];
    if (parts[3] === 'notes' && req.method === 'GET') { send(res, 200, await readFile(join(dir, `${file}.notes.json`), 'utf8').then(JSON.parse, () => [])); return true; }
    if (parts[3] === 'notes' && req.method === 'PUT') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const notes = JSON.parse(Buffer.concat(chunks).toString('utf8') || '[]');
      if (!Array.isArray(notes)) throw new Error('notes must be a list');
      await writeFile(join(dir, `${file}.notes.json`), `${JSON.stringify(notes, null, 2)}\n`);
      send(res, 200, notes);
      return true;
    }
    if (parts[3] === 'timing' && req.method === 'GET') {
      const info = await readFile(join(dir, `${file}.json`), 'utf8').then(JSON.parse, () => null);
      send(res, info ? 200 : 404, info ?? { error: 'this export was made before exports kept their timing' });
      return true;
    }
  }
  if (parts[0] === 'exports' && parts[1]) { await serveExport(req, res, dir, parts[1], send); return true; }
  return false;
}

/** An exported video, with range requests so the player can seek (frame by frame). */
async function serveExport(req: IncomingMessage, res: ServerResponse, dir: string, file: string, send: (res: ServerResponse, code: number, data: unknown) => void) {
  if (!isVideo(file)) return send(res, 404, { error: 'not found' });
  const path = join(dir, file);
  const info = await stat(path).catch(() => null);
  if (!info) return send(res, 404, { error: 'not found' });
  res.setHeader('content-type', 'video/mp4');
  res.setHeader('accept-ranges', 'bytes');
  res.setHeader('content-disposition', `inline; filename="${file}"`);
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    res.statusCode = 206;
    res.setHeader('content-range', `bytes ${start}-${end}/${info.size}`);
    res.setHeader('content-length', String(end - start + 1));
    createReadStream(path, { start, end }).pipe(res);
    return;
  }
  res.setHeader('content-length', String(info.size));
  createReadStream(path).pipe(res);
}
