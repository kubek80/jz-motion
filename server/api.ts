import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, rename, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import { exportVideo } from './export';
import { deleteIcon, readLibrary, saveIcon } from './library';
import { measureLoudness } from './loudness';
import { readMyVoice, saveMyVoice } from './myVoice';
import { findOffset } from './media';
import { logAi, readAiLog, shorten } from './aiLog';
import { cleanVoice } from './cleanVoice';
import { saveUpload, transcribe, transcribeKept, uploadPath } from './transcribe';
import { saveImage, serveImage } from './images';
import { addMedia, deleteMedia, listMedia, mediaFrames, readUpload, renameMedia, serveMedia } from './mediaStore';
import { claudeCodeChat, claudeCodeStatus } from './claudeCode';
import { runAgent } from './claudeAgent';
import { createPresentation, deletePresentation, listPresentations, readPresentation, writePresentation } from './presentations';
import { addTrack, createTake, deleteTake, getTake, listTakes, TAKES_DIR, trackPath, updateTake } from './takes';
import { generateTts, readSidecar as readTtsSidecar, serveTts, speechVoices } from './tts';
import { joinVoiceRequest } from './voiceJoin';
import { AVATAR_PRICE, avatarJob, buildAvatarTrack, readMyAvatar, startAvatarJob } from './avatar';

// The local server side of the app, mounted into the Vite dev and preview servers:
//   /api/presentations  list, create, read, save, delete presentations (presentations/<id>.json)
//   /api/library  icons and clipart made in the app (library/<name>.json)
//   /api/uploads/<file>/clean  a cleaned copy of a narration clip (background noise removed with RNNoise)
//   /api/ai-log   every AI request and what came of it (logs/ai.jsonl): the app adds its outcome; GET the last ones
//   /api/transcribe  upload a recording and transcribe it (to make a presentation from it), or transcribe a narration clip already in uploads/ (?upload=)
//   /api/llm      proxy to OpenAI-compatible model APIs (browsers can't call most of them directly)
//   /api/takes    recordings: create, upload tracks, set offsets, auto-sync, delete
//   /api/avatar   your avatar: GET /api/my-avatar, POST /api/avatar (start a talking-head video of a clip), GET /api/avatar/<job>
//   /api/voice/join  generate several beats' lines as one clip in uploads/ (a clip's Generate again)
//   /api/tts      generate a voice clip for a sentence; the cache (tts/<id>.json) is served from /api/tts/<id>
//   /api/media    the media library: add (converted), list with where each is used, rename, delete, a recording's frame times (/frames); served at /media/<file>
//   /api/images   screenshots and pictures for the board (images/<hash>.<ext>), served at /images/<file>
//   /api/export   render a presentation (and a take) to MP4; /exports/<file> to download it

export const EXPORTS_DIR = resolve(process.env.JZM_EXPORTS_DIR ?? 'exports');

interface Job { id: string; status: 'running' | 'done' | 'failed'; done: number; total: number; file?: string; error?: string; started: number }
const jobs = new Map<string, Job>();

async function readText(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function presentations(req: IncomingMessage, res: ServerResponse, id: string | undefined) {
  const m = req.method;
  if (!id && m === 'GET') return send(res, 200, await listPresentations());
  if (!id && m === 'POST') return send(res, 200, { id: await createPresentation(await readText(req)) });
  if (id && m === 'GET') {
    res.setHeader('content-type', 'application/json');
    const { text, modifiedAt } = await readPresentation(id);
    // Expose the file's mtime so the editor knows which version it loaded and can detect
    // conflicts on save (when the file was changed outside the app since the load).
    res.setHeader('last-modified', new Date(modifiedAt).toUTCString());
    res.setHeader('x-modified-at', modifiedAt);
    return res.end(text);
  }
  if (id && m === 'PUT') {
    const body = await readText(req);
    const expected = String(req.headers['if-unmodified-since'] ?? '') || undefined;
    const expectedISO = expected ? new Date(expected).toISOString() : (String(req.headers['x-modified-at'] ?? '') || undefined);
    try {
      const { modifiedAt } = await writePresentation(id, body, expectedISO);
      // Hand back the new mtime so the editor can track it for the next save — otherwise every
      // save after the first looks stale against the file it just wrote.
      res.setHeader('x-modified-at', modifiedAt);
      return send(res, 200, { ok: true, modifiedAt });
    } catch (e) {
      if ((e as Error & { code?: string }).code === 'STALE') return send(res, 409, { error: (e as Error).message });
      throw e;
    }
  }
  if (id && m === 'DELETE') {
    await deletePresentation(id);
    return send(res, 200, { ok: true });
  }
  return send(res, 404, { error: 'not found' });
}

async function readJson(req: IncomingMessage): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

async function llm(req: IncomingMessage, res: ServerResponse) {
  const { baseURL, apiKey, body } = await readJson(req);
  const started = Date.now();
  const asked = { model: body?.model, service: String(baseURL).startsWith('claude-code') ? 'claude-code' : new URL(String(baseURL)).host, lastMessage: shorten(body?.messages?.at(-1)?.content) };
  if (String(baseURL).startsWith('claude-code')) {
    try {
      const answer = await claudeCodeChat(String(body?.model ?? ''), body?.messages ?? []);
      void logAi({ kind: 'llm', ...asked, status: 200, reply: shorten(JSON.stringify(answer)), ms: Date.now() - started });
      return send(res, 200, answer);
    } catch (e) {
      void logAi({ kind: 'llm', ...asked, status: 502, error: (e as Error).message, ms: Date.now() - started });
      return send(res, 502, { error: (e as Error).message });
    }
  }
  const url = new URL(`${String(baseURL).replace(/\/+$/, '')}/chat/completions`);
  if (!/^https?:$/.test(url.protocol)) throw new Error('baseURL must be http(s)');
  const upstream = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      // OpenRouter uses these to show the app in its dashboard.
      'HTTP-Referer': 'https://github.com/kubek80/jz-motion',
      'X-Title': 'jz-motion',
    },
    body: JSON.stringify(body),
  });
  res.statusCode = upstream.status;
  res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json');
  const answer = await upstream.text();
  void logAi({ kind: 'llm', ...asked, status: upstream.status, reply: shorten(answer), ms: Date.now() - started });
  res.end(answer);
}

async function takes(req: IncomingMessage, res: ServerResponse, parts: string[], query: URLSearchParams) {
  const [id, sub, name] = parts;
  const m = req.method;
  if (!id && m === 'GET') return send(res, 200, await listTakes());
  if (!id && m === 'POST') return send(res, 200, await createTake(await readJson(req)));
  if (id && !sub && m === 'GET') return send(res, 200, await getTake(id));
  if (id && !sub && m === 'PATCH') return send(res, 200, await updateTake(id, await readJson(req)));
  if (id && !sub && m === 'DELETE') return send(res, 200, await deleteTake(id));
  if (sub === 'tracks' && name && m === 'PUT') {
    await getTake(id);
    const upload = join(TAKES_DIR, id, `upload-${randomUUID()}`);
    const from = query.get('from');
    // `from`: a recording uploaded earlier for transcription becomes the track, instead of a new upload.
    // `copy`: keep the upload (a voice-over the presentation still uses).
    if (from && query.get('copy')) await copyFile(uploadPath(from), upload);
    else if (from) await rename(uploadPath(from), upload);
    else await pipeline(req, createWriteStream(upload));
    const ext = (from ? from.split('.').pop()! : query.get('ext') ?? 'webm').replace(/[^\w]/g, '') || 'webm';
    const trimStartQ = query.get('trimStart');
    const trimEndQ = query.get('trimEnd');
    const trim = (trimStartQ !== null || trimEndQ !== null) ? {
      start: trimStartQ !== null ? Number(trimStartQ) : undefined,
      end: trimEndQ !== null ? Number(trimEndQ) : undefined,
    } : undefined;
    return send(res, 200, await addTrack(id, name, upload, ext, Number(query.get('offset') ?? 0), trim, query.has('gain') ? Number(query.get('gain')) : undefined));
  }
  if (sub === 'avatar' && m === 'POST') {
    // Your avatar's videos as one camera track ("me"), each at its place on the timeline.
    await getTake(id);
    const file = join(TAKES_DIR, id, `upload-${randomUUID()}`);
    await buildAvatarTrack(`${file}.mp4`, await readJson(req));
    return send(res, 200, await addTrack(id, 'me', `${file}.mp4`, 'mp4', 0, undefined, undefined, { avatar: true }));
  }
  if (sub === 'sync' && name && m === 'POST') {
    const take = await getTake(id);
    const track = take.tracks.find((t) => t.name === name && t.hasAudio);
    const ref = take.tracks.find((t) => t.name !== name && t.hasAudio && t.name === 'me') ?? take.tracks.find((t) => t.name !== name && t.hasAudio);
    if (!track || !ref) return send(res, 400, { error: 'Auto-sync needs this track and another track, both with sound.' });
    const { offset, confidence } = await findOffset(trackPath(id, ref), trackPath(id, track));
    const updated = await updateTake(id, { offsets: { [name]: ref.offset + offset } });
    return send(res, 200, { take: updated, offset: ref.offset + offset, confidence });
  }
  return send(res, 404, { error: 'not found' });
}

function startExport(body: any, appUrl: string): Job { // eslint-disable-line @typescript-eslint/no-explicit-any
  const job: Job = { id: randomUUID().slice(0, 8), status: 'running', done: 0, total: 0, started: Date.now() };
  jobs.set(job.id, job);
  void (async () => {
    try {
      const take = body.takeId ? await getTake(body.takeId) : undefined;
      const title = String((take?.presentation as { title?: string } | undefined)?.title ?? body.presentation?.title ?? 'video');
      const slug = title.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'video';
      const out = join(EXPORTS_DIR, `${slug}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.mp4`);
      await exportVideo({
        presentation: body.presentation, take, useTakePresentation: body.useTakePresentation !== false,
        fps: body.fps === 60 ? 60 : 30, scale: body.scale === 2 ? 2 : 1, timing: body.timing, out, appUrl, normalizeAudio: body.normalizeAudio !== false,
        onProgress: (done, total) => Object.assign(job, { done, total }),
      });
      Object.assign(job, { status: 'done', file: basename(out) });
    } catch (e) {
      Object.assign(job, { status: 'failed', error: (e as Error).message });
    }
  })();
  return job;
}

// `webm` is served as `audio/webm` here: the app records voice as audio-only webm/opus via
// MediaRecorder; labeling that `video/webm` made Chrome's <audio> refuse to decode the recording.
// Video uploads use `.mp4`/`.mov`, which keep their video MIME labels.
const MEDIA_TYPES: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm', mp4: 'video/mp4', mov: 'video/quicktime', aac: 'audio/aac', flac: 'audio/flac' };

/** An uploaded recording or voice-over, with range requests so players can seek. */
async function serveUpload(req: IncomingMessage, res: ServerResponse, file: string) {
  const path = uploadPath(file);
  const info = await stat(path).catch(() => null);
  if (!info) return send(res, 404, { error: 'not found' });
  res.setHeader('content-type', MEDIA_TYPES[file.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream');
  res.setHeader('accept-ranges', 'bytes');
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

async function serveExport(res: ServerResponse, file: string) {
  if (!/^[\w.-]+\.mp4$/.test(file)) return send(res, 404, { error: 'not found' });
  const path = join(EXPORTS_DIR, file);
  const info = await stat(path);
  res.setHeader('content-type', 'video/mp4');
  res.setHeader('content-length', String(info.size));
  res.setHeader('content-disposition', `inline; filename="${file}"`);
  createReadStream(path).pipe(res);
}

export function jzmServer(): Plugin {
  const mount = (server: ViteDevServer | PreviewServer) => {
    const appUrl = () => server.resolvedUrls?.local[0] ?? `http://localhost:${server.config.server.port ?? 5173}`;
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url ?? '/', 'http://local');
      const parts = url.pathname.split('/').filter(Boolean);
      try {
        if (url.pathname === '/api/llm' && req.method === 'POST') return await llm(req, res);
        if (url.pathname === '/api/ai-log' && req.method === 'POST') { await logAi({ kind: 'app', ...(await readJson(req)) }); return send(res, 200, { ok: true }); }
        if (url.pathname === '/api/ai-log' && req.method === 'GET') return send(res, 200, await readAiLog(Number(url.searchParams.get('limit')) || 20));
        if (url.pathname === '/api/agent' && req.method === 'POST') return await runAgent(req, res, await readJson(req));
        if (url.pathname === '/api/claude-code' && req.method === 'GET') return send(res, 200, await claudeCodeStatus());
        if (url.pathname === '/api/transcribe' && req.method === 'POST') {
          const q = url.searchParams;
          const service = { baseURL: q.get('baseURL') ?? '', model: q.get('model') ?? 'whisper-1', apiKey: String(req.headers['x-api-key'] ?? '') || undefined };
          // `upload`: a recording already here (a narration clip); otherwise the body is a new one.
          const existing = q.get('upload');
          if (existing) return send(res, 200, await transcribeKept(existing, service, q.get('again') === '1'));
          const upload = await saveUpload(req, q.get('ext') ?? 'webm');
          return send(res, 200, await transcribe(upload, service));
        }
        if (url.pathname === '/api/uploads' && req.method === 'POST') return send(res, 200, { upload: await saveUpload(req, url.searchParams.get('ext') ?? 'mp3') });
        if (parts[0] === 'api' && parts[1] === 'uploads' && parts[2] && parts[3] === 'loudness' && req.method === 'GET') return send(res, 200, await measureLoudness(parts[2], Number(url.searchParams.get('start') ?? 0), url.searchParams.has('end') ? Number(url.searchParams.get('end')) : undefined));
        if (parts[0] === 'api' && parts[1] === 'uploads' && parts[2] && parts[3] === 'clean' && req.method === 'POST') return send(res, 200, await cleanVoice(parts[2]));
        if (parts[0] === 'uploads' && parts[1] && req.method === 'GET') return await serveUpload(req, res, parts[1]);
        if (parts[0] === 'api' && parts[1] === 'media') {
          const q = url.searchParams;
          if (!parts[2] && req.method === 'GET') return send(res, 200, await listMedia());
          if (!parts[2] && req.method === 'POST') return send(res, 200, await addMedia(await readUpload(req), q.get('filename') ?? 'upload.bin', q.get('name') ?? undefined, {
            start: Number(q.get('start')) || undefined, end: Number(q.get('end')) || undefined,
          }));
          if (parts[2] && parts[3] === 'frames' && req.method === 'GET') return send(res, 200, await mediaFrames(parts[2]));
          if (parts[2] && req.method === 'PATCH') return send(res, 200, await renameMedia(parts[2], String((await readJson(req)).name ?? '')));
          if (parts[2] && req.method === 'DELETE') {
            const r = await deleteMedia(parts[2], q.get('force') === '1');
            return send(res, r.ok ? 200 : 409, r);
          }
        }
        if (parts[0] === 'media' && parts[1] && req.method === 'GET' && (await serveMedia(req, res, parts[1]))) return;
        if (url.pathname === '/api/images' && req.method === 'POST') return send(res, 200, await saveImage(req, url.searchParams.get('ext') ?? 'png'));
        if (parts[0] === 'images' && parts[1] && req.method === 'GET' && (await serveImage(res, parts[1]))) return;
        if (parts[0] === 'api' && parts[1] === 'library') {
          if (!parts[2] && req.method === 'GET') return send(res, 200, await readLibrary());
          if (parts[2] && req.method === 'PUT') return send(res, 200, (await saveIcon(parts[2], await readJson(req)), { ok: true }));
          if (parts[2] && req.method === 'DELETE') return send(res, 200, (await deleteIcon(parts[2]), { ok: true }));
        }
        if (parts[0] === 'api' && parts[1] === 'presentations') return await presentations(req, res, parts[2]);
        if (parts[0] === 'api' && parts[1] === 'takes') return await takes(req, res, parts.slice(2), url.searchParams);
        if (url.pathname === '/api/my-voice' && req.method === 'GET') return send(res, 200, (await readMyVoice()) ?? {});
        if (url.pathname === '/api/my-voice' && req.method === 'POST') return send(res, 200, await saveMyVoice(await readJson(req)));
        if (url.pathname === '/api/tts-voices' && req.method === 'GET') return send(res, 200, await speechVoices(url.searchParams.get('model') ?? ''));
        if (parts[0] === 'api' && parts[1] === 'tts' && parts[2] && req.method === 'GET') return send(res, 200, await readTtsSidecar(parts[2]));
        if (url.pathname === '/api/tts' && req.method === 'POST') return send(res, 200, await generateTts(await readJson(req)));
        if (url.pathname === '/api/my-avatar' && req.method === 'GET') return send(res, 200, { avatar: await readMyAvatar(), pricePerSecond: AVATAR_PRICE, hasServerKey: !!process.env.FAL_KEY });
        if (url.pathname === '/api/avatar' && req.method === 'POST') return send(res, 200, startAvatarJob(await readJson(req)));
        if (parts[0] === 'api' && parts[1] === 'avatar' && parts[2] && req.method === 'GET') return send(res, 200, avatarJob(parts[2]));
        if (url.pathname === '/api/voice/join' && req.method === 'POST') return send(res, 200, await joinVoiceRequest(await readJson(req)));
        if (parts[0] === 'tts' && parts[1] && parts[2] && req.method === 'GET' && (await serveTts(res, parts[1], parts[2]))) return;
        if (url.pathname === '/api/export' && req.method === 'POST') return send(res, 200, startExport(await readJson(req), appUrl()));
        if (parts[0] === 'api' && parts[1] === 'export' && parts[2]) return send(res, jobs.has(parts[2]) ? 200 : 404, jobs.get(parts[2]) ?? { error: 'no such export' });
        if (parts[0] === 'exports' && parts[1]) return await serveExport(res, parts[1]);
      } catch (e) {
        return send(res, 500, { error: (e as Error).message });
      }
      next();
    });
  };
  return { name: 'jzm-server', configureServer: mount, configurePreviewServer: mount };
}
