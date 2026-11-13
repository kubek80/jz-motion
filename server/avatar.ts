import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { FFMPEG, probe, run } from './media';
import { uploadPath } from './transcribe';
import { readMyVoice, writeMyVoice, type MyVoice } from './myVoice';

// Your avatar: a photo of you that says a voice clip, as a talking-head video (Kling AI Avatar on fal.ai). The photo
// and how to make it are kept with the project in voice/my-avatar.json (the photo in uploads/avatar-photo-*); each
// video goes to uploads/avatar-<name>-<id>.mp4 and is named on the clip it was made from (`avatar` on the clip).

export const AVATAR_FILE = resolve(process.env.JZM_AVATAR_FILE ?? 'voice/my-avatar.json');

export interface MyAvatar {
  /** The photo, in uploads/. */
  photo: string;
  /** The fal.ai model that animates it. */
  model: string;
  /** How to move (the model's prompt). */
  prompt?: string;
  /** Drive the face with a calmer copy of the voice (quieter, peaks evened out): smaller mouth movements. */
  calm?: boolean;
  /** The picture the photo was made from (uploads/avatar-source-*), and the style it was made in, if styled. */
  source?: string;
  style?: string;
}

/** The fal.ai models that animate a photo, with their price per second of video (for estimates). */
export const AVATAR_MODELS = [
  { model: 'fal-ai/kling-video/ai-avatar/v2/standard', label: 'Kling AI Avatar v2 · Standard', price: 0.0562 },
  { model: 'fal-ai/kling-video/ai-avatar/v2/pro', label: 'Kling AI Avatar v2 · Pro (sharper, slower)', price: 0.115 },
];
export const AVATAR_MODEL = AVATAR_MODELS[0].model;
export const AVATAR_PRICE = AVATAR_MODELS[0].price;
export const avatarPrice = (model?: string) => AVATAR_MODELS.find((m) => m.model === model)?.price ?? AVATAR_PRICE;
const SUBTLE = 'A calm man speaking to the camera with subtle, small mouth movements and a relaxed face; minimal head movement.';

/** One of your avatars: a look, how it moves, and the voice it speaks in. */
export interface Avatar extends MyAvatar { id: string; name: string; voice?: MyVoice; /** Someone else (a podcast guest), not you. */ guest?: boolean }
export interface Avatars { current: string; avatars: Avatar[] }

/** Your avatars (voice/my-avatar.json); a file from before several avatars is one avatar with the voice in use. */
export async function readAvatars(): Promise<Avatars | null> {
  let raw: (Avatars & Partial<MyAvatar>) | null = null;
  try { raw = JSON.parse(await readFile(AVATAR_FILE, 'utf8')); } catch { return null; }
  if (raw && Array.isArray(raw.avatars) && raw.avatars.length) return { current: raw.current, avatars: raw.avatars };
  if (raw?.photo) {
    const { current: _c, avatars: _a, ...one } = raw;
    return { current: 'avatar-1', avatars: [{ id: 'avatar-1', name: 'My avatar', ...(one as MyAvatar), voice: (await readMyVoice()) ?? undefined }] };
  }
  return null;
}
async function writeAvatars(f: Avatars) {
  await mkdir(join(AVATAR_FILE, '..'), { recursive: true });
  await writeFile(AVATAR_FILE, `${JSON.stringify(f, null, 2)}\n`);
}

/** The avatar in use. */
export async function readMyAvatar(): Promise<Avatar | null> {
  const f = await readAvatars();
  return f ? f.avatars.find((a) => a.id === f.current) ?? f.avatars[0] : null;
}

/** A new avatar, starting as a copy of the one in use (look, movement, voice), and in use from now on. */
export async function newAvatar(name: string, opts: { guest?: boolean } = {}): Promise<Avatars> {
  const f = await readAvatars();
  if (!f) throw new Error('No avatar yet: choose a picture for the first one');
  const from = f.avatars.find((a) => a.id === f.current) ?? f.avatars[0];
  const id = `avatar-${Date.now().toString(36)}`;
  // A guest starts empty: their own picture and voice to come (how it moves and its model as yours, the style the
  // default one, without anything about you).
  if (opts.guest) f.avatars.push({ id, name: name || 'Guest', guest: true, photo: '', model: from.model, prompt: 'A calm person speaking to the camera with subtle, small mouth movements and a relaxed face; minimal head movement.', calm: from.calm });
  else f.avatars.push({ ...from, id, name: name || 'New avatar' });
  f.current = id;
  await writeAvatars(f);
  return f;
}

/** Use avatar `id` from now on: its voice becomes the voice in use (voice/my-voice.json). */
export async function useAvatar(id: string): Promise<Avatar> {
  const f = await readAvatars();
  const a = f?.avatars.find((x) => x.id === id);
  if (!f || !a) throw new Error('no such avatar');
  f.current = id;
  await writeAvatars(f);
  if (a.voice) await writeMyVoice(a.voice);
  return a;
}

export async function renameAvatar(id: string, name: string): Promise<Avatars> {
  const f = await readAvatars();
  const a = f?.avatars.find((x) => x.id === id);
  if (!f || !a) throw new Error('no such avatar');
  a.name = name.trim() || a.name;
  await writeAvatars(f);
  return f;
}

/** Remove avatar `id` (not the last one); when it was in use, the first one left is used. */
export async function deleteAvatar(id: string): Promise<Avatars> {
  const f = await readAvatars();
  if (!f || !f.avatars.some((x) => x.id === id)) throw new Error('no such avatar');
  if (f.avatars.length === 1) throw new Error('This is your only avatar');
  f.avatars = f.avatars.filter((x) => x.id !== id);
  if (f.current === id) { f.current = f.avatars[0].id; if (f.avatars[0].voice) await writeMyVoice(f.avatars[0].voice); }
  await writeAvatars(f);
  return f;
}

/** The voice in use changed (My voice saved it): the avatar in use speaks in it from now on. */
export async function rememberVoice(v: MyVoice) {
  const f = await readAvatars();
  const a = f?.avatars.find((x) => x.id === f.current);
  if (!f || !a) return;
  a.voice = v;
  await writeAvatars(f);
}

/** `file` (a picture) as an avatar photo in uploads/: landscape 16:9 (a band `top` of the way down), 1920 wide at most. */
export async function makeAvatarPicture(file: string, opts: { top?: number } = {}): Promise<string> {
  const id = createHash('sha1').update(await readFile(file)).digest('hex').slice(0, 10);
  const photo = `avatar-photo-${id}.jpg`;
  const top = Math.max(0, Math.min(1, opts.top ?? 0.4));
  await run(FFMPEG, ['-y', '-v', 'error', '-i', file, '-vf', `crop=iw:min(ih\\,iw*9/16):0:(ih-min(ih\\,iw*9/16))*${top},scale='min(1920,iw)':-2`, '-q:v', '3', uploadPath(photo)]);
  return photo;
}

/** Change your avatar's settings (kept with the project, for every presentation). */
export async function updateMyAvatar(patch: Partial<MyAvatar>): Promise<MyAvatar> {
  const f = (await readAvatars()) ?? { current: 'avatar-1', avatars: [] };
  let a = f.avatars.find((x) => x.id === f.current);
  if (!a) { a = { id: f.current, name: 'My avatar', model: AVATAR_MODEL, prompt: SUBTLE, calm: true, photo: '', voice: (await readMyVoice()) ?? undefined }; f.avatars.push(a); }
  Object.assign(a, patch);
  for (const k of Object.keys(patch) as (keyof MyAvatar)[]) if (patch[k] === undefined) delete a[k];
  if (!a.photo) throw new Error('no avatar photo yet');
  await writeAvatars(f);
  return a;
}

/** Keep `file` (a picture) as the avatar photo, as it is. */
export async function saveAvatarPhoto(file: string, opts: { top?: number } = {}): Promise<MyAvatar> {
  return updateMyAvatar({ photo: await makeAvatarPicture(file, opts), style: undefined });
}

const dataUri = async (file: string, type: string) => `data:${type};base64,${(await readFile(file)).toString('base64')}`;

/**
 * A talking-head video of the avatar saying `upload` from `trimStart` to `trimEnd` (seconds): made on fal.ai (a few
 * minutes), kept as uploads/avatar-<name>-<id>.mp4 without sound (the clip itself is the sound).
 */
export async function makeAvatar(req: { upload: string; trimStart: number; trimEnd: number; name?: string; apiKey?: string; avatar?: string }, onStatus: (s: string) => void = () => undefined) {
  // `avatar`: whose avatar says it (a podcast's speaker, by their avatar's id); else the avatar in use.
  const me = req.avatar ? (await readAvatars())?.avatars.find((a) => a.id === req.avatar) ?? null : await readMyAvatar();
  if (!me) throw new Error(req.avatar ? `No avatar "${req.avatar}" in the Avatar window` : 'No avatar yet: choose one in 🧑 Avatar (or npm run avatar -- photo <picture>)');
  if (!me.photo) throw new Error(`${me.name} has no picture yet: give them one in 🧑 Avatar → Look`);
  const key = req.apiKey || process.env.FAL_KEY;
  if (!key) throw new Error('No fal.ai key: add it in My avatar (or set FAL_KEY).');
  const work = join(tmpdir(), `jzm-avatar-${randomUUID()}`);
  await mkdir(work, { recursive: true });
  try {
    const audio = join(work, 'voice.mp3');
    const calm = me.calm === false ? [] : ['-af', 'acompressor=threshold=-24dB:ratio=6:attack=5:release=80,volume=-6dB'];
    await run(FFMPEG, ['-y', '-v', 'error', '-ss', String(req.trimStart), '-to', String(req.trimEnd), '-i', uploadPath(req.upload), ...calm, '-c:a', 'libmp3lame', '-b:a', '128k', audio]);
    const h = { 'content-type': 'application/json', authorization: `Key ${key}` };
    const body = { image_url: await dataUri(uploadPath(me.photo), 'image/jpeg'), audio_url: await dataUri(audio, 'audio/mpeg'), ...(me.prompt ? { prompt: me.prompt } : {}) };
    const sub = await fetch(`https://queue.fal.run/${me.model}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
    const job = await sub.json().catch(() => ({}));
    if (!sub.ok || !job.status_url) throw new Error(`fal.ai refused the avatar (${sub.status}): ${JSON.stringify(job).slice(0, 300)}`);
    const t0 = Date.now();
    for (;;) {
      await new Promise((ok) => setTimeout(ok, 5000));
      const st = await (await fetch(job.status_url, { headers: h })).json().catch(() => ({}));
      if (st.status === 'COMPLETED') break;
      if (st.status !== 'IN_QUEUE' && st.status !== 'IN_PROGRESS') throw new Error(`fal.ai: ${JSON.stringify(st).slice(0, 300)}`);
      if (Date.now() - t0 > 30 * 60_000) throw new Error('fal.ai took over 30 minutes; try again later');
      onStatus(st.status === 'IN_QUEUE' ? 'waiting in fal.ai’s queue' : `making the video (${Math.round((Date.now() - t0) / 1000)} s)`);
    }
    const result = await (await fetch(job.response_url, { headers: h })).json();
    const url: string | undefined = result?.video?.url;
    if (!url) throw new Error(`fal.ai sent no video: ${JSON.stringify(result).slice(0, 300)}`);
    onStatus('downloading');
    const raw = join(work, 'raw.mp4');
    await writeFile(raw, Buffer.from(await (await fetch(url)).arrayBuffer()));
    const slug = (req.name ?? 'clip').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'clip';
    const video = `avatar-${slug}-${randomBytes(3).toString('hex')}.mp4`;
    await run(FFMPEG, ['-y', '-v', 'error', '-i', raw, '-an', '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libx264', '-crf', '24', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', uploadPath(video)]);
    const { duration } = await probe(uploadPath(video));
    return { video, duration, trimStart: req.trimStart, trimEnd: req.trimEnd };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** Avatar videos being made for the app: started, then asked about until done. */
type AvatarJob = { status: 'running' | 'done' | 'failed'; note?: string; result?: Awaited<ReturnType<typeof makeAvatar>>; error?: string };
const jobs = new Map<string, AvatarJob>();
export function startAvatarJob(req: Parameters<typeof makeAvatar>[0]) {
  const id = randomUUID().slice(0, 8);
  const job: AvatarJob = { status: 'running', note: 'sending to fal.ai' };
  jobs.set(id, job);
  makeAvatar(req, (s) => { job.note = s; })
    .then((result) => Object.assign(job, { status: 'done', result }))
    .catch((e) => Object.assign(job, { status: 'failed', error: (e as Error).message }));
  return { id };
}
export const avatarJob = (id: string) => jobs.get(id) ?? { status: 'failed', error: 'no such job (the server restarted?)' };

/**
 * One video track for a take: every avatar clip at its place on the timeline, black between them (the layouts only
 * show the camera where a scene asks for it). `items` are seconds on the timeline and in each video.
 */
export async function buildAvatarTrack(out: string, items: { video: string; at: number; from: number; to: number }[]) {
  const list = items.filter((x) => x.to > x.from).sort((a, b) => a.at - b.at);
  if (!list.length) throw new Error('no avatar videos');
  const end = Math.max(...list.map((x) => x.at + x.to - x.from));
  const inputs = list.flatMap((x) => ['-i', uploadPath(x.video)]);
  const parts = list.map((x, i) => `[${i + 1}:v]trim=${x.from}:${x.to},setpts=PTS-STARTPTS+${x.at.toFixed(3)}/TB,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2[v${i}]`);
  let chain = '[0:v]';
  const overlays = list.map((_, i) => { const o = `[o${i}]`; const s = `${chain}[v${i}]overlay=eof_action=pass${o}`; chain = o; return s; });
  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=black:s=1280x720:r=30:d=${end.toFixed(3)}`, ...inputs, '-filter_complex', [...parts, ...overlays].join(';'), '-map', chain, '-c:v', 'libx264', '-crf', '26', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', out]);
  return out;
}
