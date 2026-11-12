import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { FFMPEG, run } from './media';
import { uploadPath } from './transcribe';
import { readAvatars } from './avatar';
import { drawPicture, pictureUri } from './imageModel';

// A podcast's studio wide shot: the cast together in a studio (a picture drawn from their avatars by the image model,
// about 14¢), animated by fal.ai's multi-person avatar model with each person saying their own lines in turn (at most
// 241 frames, 25 a second: about 9.6 s a shot; 20¢ a second at 480p, twice at 720p, a quarter more past 81 frames).
//
//   POST /api/studio/picture   { avatars: [id, id], apiKey? } → { picture }   uploads/avatar-studio-*.jpg, 2:1
//   POST /api/studio/shot      { picture, resolution, length, pieces, name?, apiKey? } → { id } (a job)
//   GET  /api/studio/shot/<id> how the job is going, and its video when done

const MODEL = 'fal-ai/ai-avatar/multi';
export const STUDIO_FPS = 25;
export const STUDIO_MAX_FRAMES = 241;

/** The cast (their avatars' pictures) together in a studio, 2:1 (the shape the model makes its video in). */
export async function makeStudioPicture(avatarIds: string[], apiKey?: string): Promise<string> {
  const all = (await readAvatars())?.avatars ?? [];
  const people = avatarIds.map((id) => all.find((a) => a.id === id));
  const missing = avatarIds.filter((_, i) => !people[i]?.photo);
  if (missing.length) throw new Error(`No picture for ${missing.join(', ')}: give them one in 🧑 Avatar`);
  if (people.length < 2 || people.length > 3) throw new Error('A studio picture is of two or three people');
  const where = ['on the LEFT', 'on the RIGHT', 'in the MIDDLE'];
  const text = `${people.length} people host a video podcast together. Draw them in exactly the style of the FIRST picture (keep its look: lines, shading, palette).
${people.map((_, i) => `Person ${where[i]}: the person from picture ${i + 1}, clearly recognisable (same face, hair, beard, clothes), drawn in that same style.`).join('\n')}
A wide shot of a cosy home YouTube studio: they sit at a desk side by side with some space between them, each with a podcast microphone on a boom arm in front of them (not covering the mouth), every face fully visible, turned three-quarters towards the camera, mouths gently closed, relaxed and friendly. Behind them: shelves with books and plants, a soft LED panel, warm lamp light with teal accents, softly out of focus. Wide 16:9 frame; keep the heads well below the top edge and away from the sides (the picture is cropped a little at top, bottom and sides). People large in the frame, from the waist up. No text, no logos.`;
  const png = await drawPicture(text, await Promise.all(people.map((a) => pictureUri(a!.photo))), apiKey);
  const work = join(tmpdir(), `jzm-studio-${randomUUID()}.png`);
  await writeFile(work, png);
  try {
    const picture = `avatar-studio-${createHash('sha1').update(png).digest('hex').slice(0, 10)}.jpg`;
    await run(FFMPEG, ['-y', '-v', 'error', '-i', work, '-vf', "crop=iw:iw/2,scale='min(1600,iw)':-2", '-q:v', '3', uploadPath(picture)]);
    return picture;
  } finally { await rm(work, { force: true }); }
}

/** A stretch of someone's voice in a shot: `upload` from `trimStart` to `trimEnd`, `at` seconds into the shot. */
export interface ShotPiece { upload: string; trimStart: number; trimEnd: number; at: number; person: 0 | 1 }
export interface ShotRequest { picture: string; resolution?: '480p' | '720p'; length: number; pieces: ShotPiece[]; name?: string; apiKey?: string }

/** How many frames a shot of `length` seconds gets (whole frames, at most the model's limit). */
export const shotFrames = (length: number) => Math.max(41, Math.min(STUDIO_MAX_FRAMES, Math.floor(length * STUDIO_FPS)));
/** What a shot costs, in dollars. */
export const shotPrice = (length: number, resolution: '480p' | '720p' = '480p') => shotFrames(length) / STUDIO_FPS * 0.2 * (resolution === '720p' ? 2 : 1) * (shotFrames(length) > 81 ? 1.25 : 1);

async function falUpload(file: string, type: string, h: Record<string, string>): Promise<string> {
  const init = await (await fetch('https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3', { method: 'POST', headers: h, body: JSON.stringify({ content_type: type, file_name: file.split('/').pop() }) })).json();
  if (!init?.upload_url) throw new Error(`fal.ai refused the upload: ${JSON.stringify(init).slice(0, 200)}`);
  const put = await fetch(init.upload_url, { method: 'PUT', headers: { 'content-type': type }, body: await readFile(file) });
  if (!put.ok) throw new Error(`fal.ai upload failed (${put.status})`);
  return init.file_url;
}

/** The shot: everyone in the picture saying their pieces, as uploads/avatar-studio-<name>-<id>.mp4 (no sound). */
export async function makeStudioShot(req: ShotRequest, onStatus: (s: string) => void = () => undefined) {
  const key = req.apiKey || process.env.FAL_KEY;
  if (!key) throw new Error('No fal.ai key: add it in 🧑 Avatar (or set FAL_KEY).');
  const frames = shotFrames(req.length);
  const seconds = frames / STUDIO_FPS;
  const work = join(tmpdir(), `jzm-studio-${randomUUID()}`);
  await mkdir(work, { recursive: true });
  try {
    // One track per person: their pieces where they say them, silence between; a little longer than the video.
    const tracks: (string | null)[] = [];
    for (const person of [0, 1] as const) {
      const mine = req.pieces.filter((p) => p.person === person && p.trimEnd > p.trimStart);
      if (!mine.length) { tracks.push(null); continue; }
      const out = join(work, `person-${person}.mp3`);
      const inputs = mine.flatMap((p) => ['-i', uploadPath(p.upload)]);
      const parts = mine.map((p, i) => `[${i}:a]atrim=${p.trimStart.toFixed(3)}:${p.trimEnd.toFixed(3)},asetpts=PTS-STARTPTS,aresample=44100,adelay=${Math.round(p.at * 1000)}:all=1[a${i}]`);
      const mix = `${mine.map((_, i) => `[a${i}]`).join('')}amix=inputs=${mine.length}:normalize=0,apad=whole_dur=${(seconds + 0.3).toFixed(3)},atrim=0:${(seconds + 0.3).toFixed(3)}[out]`;
      await run(FFMPEG, ['-y', '-v', 'error', ...inputs, '-filter_complex', [...parts, mix].join(';'), '-map', '[out]', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '128k', out]);
      tracks.push(out);
    }
    if (!tracks[0] && !tracks[1]) throw new Error('nobody speaks in this stretch');
    const h = { 'content-type': 'application/json', authorization: `Key ${key}` };
    onStatus('sending to fal.ai');
    // The model wants the first person's track; with only the second speaking, the first is silence.
    if (!tracks[0]) {
      tracks[0] = join(work, 'silence.mp3');
      await run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono`, '-t', (seconds + 0.3).toFixed(3), '-c:a', 'libmp3lame', '-b:a', '64k', tracks[0]]);
    }
    const body = {
      image_url: await falUpload(uploadPath(req.picture), 'image/jpeg', h),
      first_audio_url: await falUpload(tracks[0], 'audio/mpeg', h),
      ...(tracks[1] ? { second_audio_url: await falUpload(tracks[1], 'audio/mpeg', h) } : {}),
      prompt: 'Podcast hosts at a desk in a cartoon home studio, talking in turn. Whoever is not speaking listens with the mouth closed, nodding slightly. Calm and natural, subtle head movement.',
      num_frames: frames,
      resolution: req.resolution ?? '480p',
    };
    const sub = await fetch(`https://queue.fal.run/${MODEL}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
    const job = await sub.json().catch(() => ({}));
    if (!sub.ok || !job.status_url) throw new Error(`fal.ai refused the shot (${sub.status}): ${JSON.stringify(job).slice(0, 300)}`);
    const t0 = Date.now();
    for (;;) {
      await new Promise((ok) => setTimeout(ok, 4000));
      const st = await (await fetch(job.status_url, { headers: h })).json().catch(() => ({}));
      if (st.status === 'COMPLETED') break;
      if (st.status !== 'IN_QUEUE' && st.status !== 'IN_PROGRESS') throw new Error(`fal.ai: ${JSON.stringify(st).slice(0, 300)}`);
      if (Date.now() - t0 > 40 * 60_000) throw new Error('fal.ai took over 40 minutes; try again later');
      onStatus(st.status === 'IN_QUEUE' ? 'waiting in fal.ai’s queue' : `making the shot (${Math.round((Date.now() - t0) / 1000)} s)`);
    }
    const result = await (await fetch(job.response_url, { headers: h })).json();
    const url: string | undefined = result?.video?.url;
    // A request the model can't take comes back here, as `detail`.
    if (!url) throw new Error(`fal.ai sent no video: ${JSON.stringify(result?.detail ?? result).slice(0, 300)}`);
    onStatus('downloading');
    const raw = join(work, 'raw.mp4');
    await writeFile(raw, Buffer.from(await (await fetch(url)).arrayBuffer()));
    const slug = (req.name ?? 'shot').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'shot';
    const video = `avatar-studio-${slug}-${randomBytes(3).toString('hex')}.mp4`;
    await run(FFMPEG, ['-y', '-v', 'error', '-i', raw, '-an', '-c:v', 'libx264', '-crf', '22', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', uploadPath(video)]);
    return { video, length: seconds };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

type ShotJob = { status: 'running' | 'done' | 'failed'; note?: string; result?: { video: string; length: number }; error?: string };
const jobs = new Map<string, ShotJob>();

const json = async (req: IncomingMessage) => { const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer); return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); };
const isPicture = (s: unknown): s is string => typeof s === 'string' && /^avatar-studio-[\w]+\.jpg$/.test(s);

/** Handles the routes above; false when the request is not one of them. */
export async function studioRoutes(req: IncomingMessage, res: ServerResponse, url: URL, send: (res: ServerResponse, code: number, data: unknown) => void): Promise<boolean> {
  const p = url.pathname;
  if (p === '/api/studio/picture' && req.method === 'POST') {
    const { avatars, apiKey } = await json(req);
    send(res, 200, { picture: await makeStudioPicture((avatars ?? []).map(String), apiKey) });
  } else if (p === '/api/studio/shot' && req.method === 'POST') {
    const body = (await json(req)) as ShotRequest;
    if (!isPicture(body.picture)) throw new Error('not a studio picture');
    const id = randomUUID().slice(0, 8);
    const job: ShotJob = { status: 'running', note: 'getting the voices ready' };
    jobs.set(id, job);
    makeStudioShot(body, (s) => { job.note = s; })
      .then((result) => Object.assign(job, { status: 'done', result }))
      .catch((e) => Object.assign(job, { status: 'failed', error: (e as Error).message }));
    send(res, 200, { id });
  } else if (p.startsWith('/api/studio/shot/') && req.method === 'GET') {
    send(res, 200, jobs.get(p.slice('/api/studio/shot/'.length)) ?? { status: 'failed', error: 'no such job (the server restarted?)' });
  } else return false;
  return true;
}
