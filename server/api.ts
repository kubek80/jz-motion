import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { rename, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import { exportVideo } from './export';
import { deleteIcon, readLibrary, saveIcon } from './library';
import { findOffset } from './media';
import { saveUpload, transcribe, uploadPath } from './transcribe';
import { createPresentation, deletePresentation, listPresentations, readPresentation, writePresentation } from './presentations';
import { addTrack, createTake, deleteTake, getTake, listTakes, TAKES_DIR, trackPath, updateTake } from './takes';

// The local server side of the app, mounted into the Vite dev and preview servers:
//   /api/presentations  list, create, read, save, delete presentations (presentations/<id>.json)
//   /api/library  icons and clipart made in the app (library/<name>.json)
//   /api/transcribe  upload a recording and transcribe it (to make a presentation from it)
//   /api/llm      proxy to OpenAI-compatible model APIs (browsers can't call most of them directly)
//   /api/takes    recordings: create, upload tracks, set offsets, auto-sync, delete
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
    return res.end(await readPresentation(id));
  }
  if (id && m === 'PUT') {
    await writePresentation(id, await readText(req));
    return send(res, 200, { ok: true });
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
  res.end(await upstream.text());
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
    if (from) await rename(uploadPath(from), upload);
    else await pipeline(req, createWriteStream(upload));
    const ext = (from ? from.split('.').pop()! : query.get('ext') ?? 'webm').replace(/[^\w]/g, '') || 'webm';
    return send(res, 200, await addTrack(id, name, upload, ext, Number(query.get('offset') ?? 0)));
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
        fps: body.fps === 60 ? 60 : 30, scale: body.scale === 2 ? 2 : 1, timing: body.timing, out, appUrl,
        onProgress: (done, total) => Object.assign(job, { done, total }),
      });
      Object.assign(job, { status: 'done', file: basename(out) });
    } catch (e) {
      Object.assign(job, { status: 'failed', error: (e as Error).message });
    }
  })();
  return job;
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
        if (url.pathname === '/api/transcribe' && req.method === 'POST') {
          const q = url.searchParams;
          const upload = await saveUpload(req, q.get('ext') ?? 'webm');
          return send(res, 200, await transcribe(upload, { baseURL: q.get('baseURL') ?? '', model: q.get('model') ?? 'whisper-1', apiKey: String(req.headers['x-api-key'] ?? '') || undefined }));
        }
        if (parts[0] === 'api' && parts[1] === 'library') {
          if (!parts[2] && req.method === 'GET') return send(res, 200, await readLibrary());
          if (parts[2] && req.method === 'PUT') return send(res, 200, (await saveIcon(parts[2], await readJson(req)), { ok: true }));
          if (parts[2] && req.method === 'DELETE') return send(res, 200, (await deleteIcon(parts[2]), { ok: true }));
        }
        if (parts[0] === 'api' && parts[1] === 'presentations') return await presentations(req, res, parts[2]);
        if (parts[0] === 'api' && parts[1] === 'takes') return await takes(req, res, parts.slice(2), url.searchParams);
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
