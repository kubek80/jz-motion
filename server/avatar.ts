import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { FFMPEG, probe, run } from './media';
import { uploadPath } from './transcribe';

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
}

export const AVATAR_MODEL = 'fal-ai/kling-video/ai-avatar/v2/standard';
/** fal.ai's price for that model, per second of video (for estimates shown before making one). */
export const AVATAR_PRICE = 0.0562;
const SUBTLE = 'A calm man speaking to the camera with subtle, small mouth movements and a relaxed face; minimal head movement.';

export async function readMyAvatar(): Promise<MyAvatar | null> {
  try { return JSON.parse(await readFile(AVATAR_FILE, 'utf8')); } catch { return null; }
}

/** Keep `file` (a picture) as the avatar photo: a copy in uploads/, landscape 16:9 around the middle. */
export async function saveAvatarPhoto(file: string, opts: { top?: number } = {}): Promise<MyAvatar> {
  const id = createHash('sha1').update(await readFile(file)).digest('hex').slice(0, 10);
  const photo = `avatar-photo-${id}.jpg`;
  // A 16:9 band of the picture, `top` (0–1) of the way down what's left over; 1920 wide at most.
  const top = Math.max(0, Math.min(1, opts.top ?? 0.4));
  await run(FFMPEG, ['-y', '-v', 'error', '-i', file, '-vf', `crop=iw:min(ih\\,iw*9/16):0:(ih-min(ih\\,iw*9/16))*${top},scale='min(1920,iw)':-2`, '-q:v', '3', uploadPath(photo)]);
  const was = await readMyAvatar();
  const saved: MyAvatar = { model: AVATAR_MODEL, prompt: SUBTLE, calm: true, ...was, photo };
  await mkdir(join(AVATAR_FILE, '..'), { recursive: true });
  await writeFile(AVATAR_FILE, `${JSON.stringify(saved, null, 2)}\n`);
  return saved;
}

const dataUri = async (file: string, type: string) => `data:${type};base64,${(await readFile(file)).toString('base64')}`;

/**
 * A talking-head video of the avatar saying `upload` from `trimStart` to `trimEnd` (seconds): made on fal.ai (a few
 * minutes), kept as uploads/avatar-<name>-<id>.mp4 without sound (the clip itself is the sound).
 */
export async function makeAvatar(req: { upload: string; trimStart: number; trimEnd: number; name?: string; apiKey?: string }, onStatus: (s: string) => void = () => undefined) {
  const me = await readMyAvatar();
  if (!me) throw new Error('No avatar photo yet: npm run avatar -- photo <picture>');
  const key = req.apiKey || process.env.FAL_KEY;
  if (!key) throw new Error('No fal.ai key: add it in Settings → My avatar (or set FAL_KEY).');
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
