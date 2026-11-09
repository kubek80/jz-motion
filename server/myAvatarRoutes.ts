import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AVATAR_MODELS, avatarJob, avatarPrice, deleteAvatar, makeAvatarPicture, newAvatar, readAvatars, readMyAvatar, renameAvatar, startAvatarJob, updateMyAvatar, useAvatar } from './avatar';
import { uploadPath } from './transcribe';

// My avatar's server side: the picture you start from (uploads/avatar-source-*), a styled version of it made by an
// image model through OpenRouter, the photo in use and how it moves (voice/my-avatar.json, for every presentation),
// and the talking-head videos made of clips (jobs the app follows).
//
//   GET  /api/me                      your avatars (each with its voice) and the one in use
//   POST /api/me/use|new|rename|delete   { id?, name? }: choose (its voice comes with it), add a copy, rename, remove
//   GET  /api/my-avatar               the avatar in use, the models, the default style
//   POST /api/my-avatar               change it: { photo?, model?, prompt?, calm?, source?, style? }
//   POST /api/my-avatar/source        a picture to start from (body: the file; ?name=photo.jpg) → { source }
//   POST /api/my-avatar/photo         { source } as it is → { photo }   (not in use until POST /api/my-avatar)
//   POST /api/my-avatar/style         { source, style, apiKey? } → { photo }, a styled version
//   POST /api/avatar                  a talking-head video of part of a clip → { id } (a job)
//   GET  /api/avatar/<id>             how the job is going, and its video when done

/** The look the avatar starts with: the cartoon talking head in a home studio. */
export const DEFAULT_STYLE = 'Turn this photo of me into a flat 2D cartoon illustration in a retro mid-century adult-animation style: bold clean black outlines, flat cel shading with one shadow tone, limited muted palette, slightly angular stylised features. Keep it clearly recognisable as me. A talking head, head and shoulders, centred, facing the camera and looking into the lens, relaxed and friendly, mouth gently closed, a calm casual look. Setting: a cosy home YouTube studio behind me, softly out of focus: a podcast microphone on a boom arm at the edge of frame, a soft LED panel, shelves with a few books and a plant, warm lamp light with teal accents. Wide 16:9 frame, me in the middle third. No text, no logos.';
const IMAGE_MODEL = 'google/gemini-3-pro-image';

async function body(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}
const json = async (req: IncomingMessage) => JSON.parse((await body(req)).toString('utf8') || '{}');
const isSource = (s: unknown): s is string => typeof s === 'string' && /^avatar-source-[\w]+\.(jpe?g|png|webp)$/.test(s);
const isPhoto = (s: unknown): s is string => typeof s === 'string' && /^avatar-photo-[\w]+\.jpg$/.test(s);

/** A styled version of `source`: the image model redraws it as `style` says (about 14¢ a picture). */
export async function styleAvatar(source: string, style: string, apiKey?: string): Promise<string> {
  const key = apiKey || process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('No OpenRouter key: add it in Settings → Voice generation (OpenRouter), or as a model under Models.');
  const ext = extname(source).slice(1).replace('jpg', 'jpeg');
  const picture = `data:image/${ext};base64,${(await readFile(uploadPath(source))).toString('base64')}`;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: IMAGE_MODEL, modalities: ['image', 'text'], image_config: { aspect_ratio: '16:9' }, messages: [{ role: 'user', content: [{ type: 'text', text: style }, { type: 'image_url', image_url: { url: picture } }] }] }),
  });
  const j = await res.json().catch(() => ({}));
  const img: string | undefined = j?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  const m = img && /^data:image\/\w+;base64,(.*)$/.exec(img);
  if (!res.ok || !m) throw new Error(`The image model made no picture (${res.status}): ${JSON.stringify(j?.error ?? j).slice(0, 300)}`);
  const tmp = join(tmpdir(), `jzm-avatar-styled-${Date.now()}.png`);
  await writeFile(tmp, Buffer.from(m[1], 'base64'));
  try { return await makeAvatarPicture(tmp, { top: 0.5 }); } finally { await rm(tmp, { force: true }); }
}

/** Handles the routes above; false when the request is not one of them. */
export async function myAvatarRoutes(req: IncomingMessage, res: ServerResponse, url: URL, send: (res: ServerResponse, code: number, data: unknown) => void): Promise<boolean> {
  const p = url.pathname;
  const m = req.method;
  if (p === '/api/me' && m === 'GET') {
    send(res, 200, (await readAvatars()) ?? { current: null, avatars: [] });
  } else if (p.startsWith('/api/me/') && m === 'POST') {
    const { id, name } = await json(req);
    const what = p.slice('/api/me/'.length);
    if (what === 'use') send(res, 200, await useAvatar(String(id)));
    else if (what === 'new') send(res, 200, await newAvatar(String(name ?? '')));
    else if (what === 'rename') send(res, 200, await renameAvatar(String(id), String(name ?? '')));
    else if (what === 'delete') send(res, 200, await deleteAvatar(String(id)));
    else return false;
  } else if (p === '/api/my-avatar' && m === 'GET') {
    const avatar = await readMyAvatar();
    send(res, 200, { avatar, models: AVATAR_MODELS, pricePerSecond: avatarPrice(avatar?.model), defaultStyle: DEFAULT_STYLE, hasServerKey: !!process.env.FAL_KEY });
  } else if (p === '/api/my-avatar' && m === 'POST') {
    const patch = await json(req);
    if (patch.photo !== undefined && !isPhoto(patch.photo)) throw new Error('not an avatar photo');
    if (patch.source !== undefined && patch.source !== null && !isSource(patch.source)) throw new Error('not an avatar picture');
    if (patch.model !== undefined && !AVATAR_MODELS.some((x) => x.model === patch.model)) throw new Error('unknown model');
    const keep = ['photo', 'model', 'prompt', 'calm', 'source', 'style'] as const;
    send(res, 200, await updateMyAvatar(Object.fromEntries(keep.filter((k) => k in patch).map((k) => [k, patch[k] ?? undefined]))));
  } else if (p === '/api/my-avatar/source' && m === 'POST') {
    const data = await body(req);
    const ext = (/\.(jpe?g|png|webp)$/i.exec(url.searchParams.get('name') ?? '')?.[1] ?? 'jpg').toLowerCase();
    const source = `avatar-source-${createHash('sha1').update(data).digest('hex').slice(0, 10)}.${ext}`;
    await writeFile(uploadPath(source), data);
    send(res, 200, { source });
  } else if (p === '/api/my-avatar/photo' && m === 'POST') {
    const { source } = await json(req);
    if (!isSource(source)) throw new Error('not an avatar picture');
    send(res, 200, { photo: await makeAvatarPicture(uploadPath(source)) });
  } else if (p === '/api/my-avatar/style' && m === 'POST') {
    const { source, style, apiKey } = await json(req);
    if (!isSource(source)) throw new Error('not an avatar picture');
    send(res, 200, { photo: await styleAvatar(source, String(style || DEFAULT_STYLE), apiKey) });
  } else if (p === '/api/avatar' && m === 'POST') {
    send(res, 200, startAvatarJob(await json(req)));
  } else if (p.startsWith('/api/avatar/') && m === 'GET') {
    send(res, 200, avatarJob(p.slice('/api/avatar/'.length)));
  } else return false;
  return true;
}
