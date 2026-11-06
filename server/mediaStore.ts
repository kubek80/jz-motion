import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { FFMPEG, FFPROBE, run } from './media';

// The media library: every picture, screen recording and sound used on boards, in media/<hash>.<ext>, with an
// index (media/index.json) of readable names, sizes and dimensions. Files are converted on the way in, so they
// stay small: pictures become WebP, recordings (APNG, GIF, MOV, MP4, WebM) become WebM video with a poster
// picture, sounds become Opus. Presentations refer to them as "/media/<file>".

export const MEDIA_DIR = resolve(process.env.JZM_MEDIA_DIR ?? 'media');
const INDEX = () => join(MEDIA_DIR, 'index.json');

export type MediaKind = 'picture' | 'recording' | 'sound' | 'drawing';

export interface MediaEntry {
  file: string;
  /** What presentations use: "/media/<file>". */
  src: string;
  name: string;
  kind: MediaKind;
  bytes: number;
  width?: number;
  height?: number;
  /** Seconds, for recordings and sounds. */
  duration?: number;
  /** A still of the first frame, for recordings. */
  poster?: string;
  /** The file it was made from, and how big that was. */
  original?: { name: string; bytes: number };
  added: string;
}

export interface MediaUse { id: string; title: string }

const MAX_WIDTH = 2560;
const TYPES: Record<string, string> = {
  webp: 'image/webp', webm: 'video/webm', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', apng: 'image/apng', mp4: 'video/mp4',
};

async function readIndex(): Promise<Record<string, MediaEntry>> {
  try {
    return JSON.parse(await readFile(INDEX(), 'utf8'));
  } catch {
    return {};
  }
}

async function writeIndex(index: Record<string, MediaEntry>) {
  await mkdir(MEDIA_DIR, { recursive: true });
  const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(INDEX(), `${JSON.stringify(sorted, null, 1)}\n`);
}

interface Probe { width?: number; height?: number; duration?: number; frames?: number; hasVideo: boolean; hasAudio: boolean }

async function probeFile(path: string): Promise<Probe> {
  const out = JSON.parse((await run(FFPROBE, ['-v', 'error', '-count_packets', '-show_entries', 'stream=codec_type,width,height,nb_read_packets:format=duration', '-of', 'json', path])).toString());
  const video = (out.streams ?? []).find((s: { codec_type: string }) => s.codec_type === 'video');
  const hasAudio = (out.streams ?? []).some((s: { codec_type: string }) => s.codec_type === 'audio');
  return {
    width: video?.width, height: video?.height, hasVideo: !!video, hasAudio,
    duration: Number(out.format?.duration) || undefined, frames: Number(video?.nb_read_packets) || undefined,
  };
}

const scaleFilter = (width?: number) => (width && width > MAX_WIDTH ? `scale=${MAX_WIDTH}:-2` : 'scale=trunc(iw/2)*2:trunc(ih/2)*2');

/** Converts an incoming file into what the library keeps. Returns the new file's path and extension. */
async function convert(input: string, ext: string, work: string): Promise<{ path: string; ext: string; kind: MediaKind; probe: Probe }> {
  const e = ext.toLowerCase();
  if (e === 'svg') return { path: input, ext: 'svg', kind: 'drawing', probe: { hasVideo: false, hasAudio: false } };
  const probe = await probeFile(input);
  const animated = (probe.frames ?? 1) > 1 || ['mp4', 'mov', 'webm', 'mkv', 'm4v'].includes(e);
  if (probe.hasVideo && animated) {
    const out = join(work, 'out.webm');
    // Screen recordings: VP9 at a quality that keeps text crisp; sound (if any) as Opus.
    await run(FFMPEG, ['-y', '-v', 'error', '-i', input, '-vf', scaleFilter(probe.width), '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4',
      ...(probe.hasAudio ? ['-c:a', 'libopus', '-b:a', '96k'] : ['-an']), out]);
    return { path: out, ext: 'webm', kind: 'recording', probe: { ...probe, ...(await probeFile(out)) } };
  }
  if (probe.hasVideo) {
    const out = join(work, 'out.webp');
    await run(FFMPEG, ['-y', '-v', 'error', '-i', input, '-frames:v', '1', ...(probe.width && probe.width > MAX_WIDTH ? ['-vf', `scale=${MAX_WIDTH}:-2`] : []), '-c:v', 'libwebp', '-quality', '90', out]);
    // A picture that is already small (a tiny icon, a well-compressed JPEG) stays as it is.
    if ((await stat(out)).size >= (await stat(input)).size && ['png', 'jpg', 'jpeg', 'webp'].includes(e)) return { path: input, ext: e === 'jpeg' ? 'jpg' : e, kind: 'picture', probe };
    return { path: out, ext: 'webp', kind: 'picture', probe: { ...probe, ...(await probeFile(out)) } };
  }
  if (probe.hasAudio) {
    const out = join(work, 'out.webm');
    await run(FFMPEG, ['-y', '-v', 'error', '-i', input, '-vn', '-c:a', 'libopus', '-b:a', '64k', out]);
    return { path: out, ext: 'webm', kind: 'sound', probe: { ...probe, ...(await probeFile(out)) } };
  }
  throw new Error('not a picture, recording or sound');
}

/** Adds a file to the library (converting it), and returns its entry. The same content added twice is stored once. */
export async function addMedia(data: Buffer, originalName: string, name?: string): Promise<MediaEntry> {
  const ext = extname(originalName).slice(1).toLowerCase() || 'bin';
  const work = await mkdtemp(join(tmpdir(), 'jzm-media-'));
  try {
    const input = join(work, `in.${ext}`);
    await writeFile(input, data);
    const done = await convert(input, ext, work);
    const bytes = await readFile(done.path);
    const file = `${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.${done.ext}`;
    await mkdir(MEDIA_DIR, { recursive: true });
    const index = await readIndex();
    if (index[file]) return index[file];
    await writeFile(join(MEDIA_DIR, file), bytes);
    let poster: string | undefined;
    if (done.kind === 'recording') {
      const posterFile = `${file}.poster.webp`;
      await run(FFMPEG, ['-y', '-v', 'error', '-i', join(MEDIA_DIR, file), '-frames:v', '1', '-c:v', 'libwebp', '-quality', '80', join(MEDIA_DIR, posterFile)]);
      poster = `/media/${posterFile}`;
    }
    const entry: MediaEntry = {
      file, src: `/media/${file}`, name: (name || originalName.replace(/\.[^.]+$/, '')).trim() || file, kind: done.kind, bytes: bytes.length,
      ...(done.probe.width ? { width: done.probe.width, height: done.probe.height } : {}),
      ...(done.kind === 'recording' || done.kind === 'sound' ? { duration: Math.round((done.probe.duration ?? 0) * 100) / 100 } : {}),
      ...(poster ? { poster } : {}),
      original: { name: originalName, bytes: data.length },
      added: new Date().toISOString(),
    };
    index[file] = entry;
    await writeIndex(index);
    return entry;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** Which presentations (and examples) refer to each media file. */
export async function mediaUses(): Promise<Record<string, MediaUse[]>> {
  const uses: Record<string, MediaUse[]> = {};
  for (const dir of ['presentations', 'src/examples']) {
    if (!existsSync(dir)) continue;
    for (const f of (await readdir(dir)).filter((n) => n.endsWith('.json'))) {
      const text = await readFile(join(dir, f), 'utf8');
      let title = f;
      try { title = String(JSON.parse(text).title ?? f); } catch { /* being edited */ }
      const id = dir === 'presentations' ? f.slice(0, -5) : `example:${f.slice(0, -5)}`;
      for (const m of new Set([...text.matchAll(/"\/media\/([^"?]+)"/g)].map((x) => x[1]))) (uses[m] ??= []).push({ id, title });
    }
  }
  return uses;
}

export async function listMedia(): Promise<{ items: (MediaEntry & { usedBy: MediaUse[] })[]; totalBytes: number }> {
  const [index, uses] = await Promise.all([readIndex(), mediaUses()]);
  const items = Object.values(index).sort((a, b) => b.added.localeCompare(a.added)).map((e) => ({ ...e, usedBy: uses[e.file] ?? [] }));
  return { items, totalBytes: items.reduce((a, e) => a + e.bytes, 0) };
}

/** Reads a request body (an upload), up to `limit` bytes. */
export async function readUpload(req: IncomingMessage, limit = 500 * 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error(`files up to ${Math.round(limit / 1048576)} MB`);
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

const safe = (file: string) => {
  if (!/^[\w-]+\.\w+$/.test(file)) throw new Error('bad media file name');
  return file;
};

export async function renameMedia(file: string, name: string): Promise<MediaEntry> {
  const index = await readIndex();
  const entry = index[safe(file)];
  if (!entry) throw new Error('no such media file');
  entry.name = name.trim() || entry.name;
  await writeIndex(index);
  return entry;
}

/** Removes a file from the library. Refuses when a presentation uses it, unless `force`. */
export async function deleteMedia(file: string, force = false): Promise<{ ok: true } | { ok: false; usedBy: MediaUse[] }> {
  const used = (await mediaUses())[safe(file)] ?? [];
  if (used.length && !force) return { ok: false, usedBy: used };
  const index = await readIndex();
  const entry = index[file];
  await rm(join(MEDIA_DIR, file), { force: true });
  if (entry?.poster) await rm(join(MEDIA_DIR, entry.poster.replace('/media/', '')), { force: true });
  delete index[file];
  await writeIndex(index);
  return { ok: true };
}

/** Moves an existing file (e.g. from images/) into the library: converted, indexed; returns the entry. */
export async function importFile(path: string, name?: string): Promise<MediaEntry> {
  return addMedia(await readFile(path), path.split('/').pop()!, name);
}

/** Serves a media file, with range requests so recordings and sounds can seek. */
export async function serveMedia(req: IncomingMessage, res: ServerResponse, file: string): Promise<boolean> {
  if (!/^[\w.-]+$/.test(file)) return false;
  const path = join(MEDIA_DIR, file);
  const info = await stat(path).catch(() => null);
  if (!info) return false;
  res.setHeader('content-type', TYPES[file.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream');
  res.setHeader('accept-ranges', 'bytes');
  res.setHeader('cache-control', 'public, max-age=31536000, immutable');
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    res.statusCode = 206;
    res.setHeader('content-range', `bytes ${start}-${end}/${info.size}`);
    res.setHeader('content-length', String(end - start + 1));
    createReadStream(path, { start, end }).pipe(res);
  } else {
    res.setHeader('content-length', String(info.size));
    createReadStream(path).pipe(res);
  }
  return true;
}

