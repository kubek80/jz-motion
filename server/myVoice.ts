import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import type { IncomingMessage } from 'node:http';
import { join, resolve } from 'node:path';
import { FFMPEG, probe, run } from './media';
import { uploadPath } from './transcribe';

// Your voice, kept with the project so it works on every computer (and for an assistant working in the repo):
// the sample a cloning model copies (uploads/voice-sample-<id>.<ext>, in git with LFS) and which part of it to use,
// what is said in it, and the model (voice/my-voice.json; never a key).

export const MY_VOICE_FILE = resolve(process.env.JZM_VOICE_FILE ?? 'voice/my-voice.json');

export interface MyVoice {
  baseURL: string;
  model: string;
  instructions?: string;
  sample: { upload: string; start: number; end: number; name?: string; text?: string };
}

export async function readMyVoice(): Promise<MyVoice | null> {
  try { return JSON.parse(await readFile(MY_VOICE_FILE, 'utf8')); } catch { return null; }
}

/** Keeps the sample's recording under a name git keeps (a copy; the original stays) and writes the settings. */
export async function saveMyVoice(v: MyVoice): Promise<MyVoice> {
  const from = v.sample.upload;
  let upload = from;
  if (!from.startsWith('voice-sample-')) {
    const ext = from.split('.').pop() ?? 'webm';
    const id = createHash('sha1').update(await readFile(uploadPath(from))).digest('hex').slice(0, 10);
    upload = `voice-sample-${id}.${ext}`;
    if (!(await stat(uploadPath(upload)).catch(() => null))) await copyFile(uploadPath(from), uploadPath(upload));
    // Its transcript, when there is one, goes with it.
    await copyFile(`${uploadPath(from)}.transcript.json`, `${uploadPath(upload)}.transcript.json`).catch(() => undefined);
  }
  const saved: MyVoice = { baseURL: v.baseURL, model: v.model, ...(v.instructions ? { instructions: v.instructions } : {}), sample: { ...v.sample, upload } };
  await writeMyVoice(saved);
  return saved;
}

/** Writes the voice in use as it is (its sample already kept): choosing an avatar switches to its voice this way. */
export async function writeMyVoice(v: MyVoice) {
  await mkdir(join(MY_VOICE_FILE, '..'), { recursive: true });
  await writeFile(MY_VOICE_FILE, `${JSON.stringify(v, null, 2)}\n`);
}

/**
 * A voice sample from a recording you have (a guest's interview, a podcast, a video): the 30 s from `start` kept as
 * uploads/voice-sample-<id>.webm (sound only; the file itself isn't kept, so a long video never lands in the project).
 */
export async function sampleFromFile(req: IncomingMessage, ext: string, start: number): Promise<{ upload: string; duration: number }> {
  const raw = join(tmpdir(), `jzm-voice-${Date.now()}.${ext.replace(/[^\w]/g, '') || 'webm'}`);
  await pipeline(req, createWriteStream(raw));
  try {
    const info = await probe(raw);
    if (!info.hasAudio) throw new Error('That file has no sound');
    const from = Math.max(0, Math.min(start, Math.max(0, (info.duration ?? 0) - 5)));
    const cut = join(tmpdir(), `jzm-voice-cut-${Date.now()}.webm`);
    await run(FFMPEG, ['-y', '-v', 'error', '-ss', String(from), '-t', '30', '-i', raw, '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '96k', cut]);
    const id = createHash('sha1').update(await readFile(cut)).digest('hex').slice(0, 10);
    const upload = `voice-sample-${id}.webm`;
    await copyFile(cut, uploadPath(upload));
    await rm(cut, { force: true });
    const { duration } = await probe(uploadPath(upload));
    return { upload, duration: duration ?? 30 };
  } finally {
    await rm(raw, { force: true });
  }
}
