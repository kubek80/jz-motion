import { spawn } from 'node:child_process';
import { basename, dirname, extname, join } from 'node:path';

// FFmpeg helpers. Uses FFMPEG_PATH / FFPROBE_PATH if set, else ffmpeg / ffprobe on the PATH. With only
// FFMPEG_PATH set, ffprobe is taken from the same folder (FFmpeg ships them together).

export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE_PATH
  || (process.env.FFMPEG_PATH ? join(dirname(process.env.FFMPEG_PATH), `ffprobe${extname(process.env.FFMPEG_PATH)}`) : 'ffprobe');

/** What to do when FFmpeg (or ffprobe) can't be started. */
export const ffmpegMissing = (cmd: string, why: string) => {
  const probe = basename(cmd).toLowerCase().startsWith('ffprobe');
  return `${probe ? 'ffprobe' : 'FFmpeg'} could not start (${why}). Install FFmpeg (it includes ffprobe): on Windows \`winget install Gyan.FFmpeg\`, on a Mac \`brew install ffmpeg\`, then open a new terminal and run npm run dev again. Or set ${probe ? 'FFPROBE_PATH (or FFMPEG_PATH, with ffprobe in the same folder)' : 'FFMPEG_PATH'} to where it is.`;
};

/** Runs a command and collects stdout; rejects with stderr on failure. */
export function run(cmd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    let err = '';
    p.stdout.on('data', (d: Buffer) => out.push(d));
    p.stderr.on('data', (d: Buffer) => (err += d.toString()));
    p.on('error', (e) => reject(new Error(ffmpegMissing(cmd, e.message))));
    p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`${cmd} failed: ${err.slice(-800)}`))));
  });
}

export interface MediaInfo { hasVideo: boolean; hasAudio: boolean; duration: number }

export async function probe(path: string): Promise<MediaInfo> {
  const out = await run(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', path]);
  const info = JSON.parse(out.toString());
  const types: string[] = (info.streams ?? []).map((s: { codec_type: string }) => s.codec_type);
  return { hasVideo: types.includes('video'), hasAudio: types.includes('audio'), duration: Number(info.format?.duration) || 0 };
}

/** Browser recordings (MediaRecorder WebM) have no duration or seek index; rewriting the container fixes both. */
export async function remux(input: string, output: string) {
  await run(FFMPEG, ['-y', '-v', 'error', '-i', input, '-c', 'copy', output]);
}

const RATE = 8000;
const HOP = 80; // 10 ms at 8 kHz

/** Loudness envelope (one value per 10 ms) of a file's audio, for lining tracks up. */
async function envelope(path: string, maxSeconds: number): Promise<Float32Array> {
  const pcm = await run(FFMPEG, ['-v', 'error', '-i', path, '-t', String(maxSeconds), '-vn', '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-']);
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 4));
  const env = new Float32Array(Math.floor(samples.length / HOP));
  for (let i = 0; i < env.length; i++) {
    let sum = 0;
    for (let j = 0; j < HOP; j++) sum += samples[i * HOP + j] ** 2;
    env[i] = Math.sqrt(sum / HOP);
  }
  // Zero mean so silence doesn't count as agreement.
  const mean = env.reduce((a, b) => a + b, 0) / (env.length || 1);
  for (let i = 0; i < env.length; i++) env[i] -= mean;
  return env;
}

/** Best lag between two envelopes: b[i] lines up with a[i + lag]. Exported for tests. */
export function bestLag(a: Float32Array, b: Float32Array, maxLag: number): { lag: number; score: number } {
  let best = { lag: 0, score: -Infinity };
  const norm = Math.sqrt(a.reduce((s, v) => s + v * v, 0) * b.reduce((s, v) => s + v * v, 0)) || 1;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let sum = 0;
    const from = Math.max(0, -lag);
    const to = Math.min(b.length, a.length - lag);
    for (let i = from; i < to; i++) sum += a[i + lag] * b[i];
    if (sum > best.score) best = { lag, score: sum };
  }
  return { lag: best.lag, score: best.score / norm };
}

/**
 * Seconds after the start of `reference` at which `track` starts, found by matching their sound
 * (a clap at the start makes this reliable). Only the first few minutes are compared.
 */
export async function findOffset(reference: string, track: string, maxShift = 60): Promise<{ offset: number; confidence: number }> {
  const [a, b] = await Promise.all([envelope(reference, 300), envelope(track, 300)]);
  const { lag, score } = bestLag(a, b, Math.round(maxShift * (RATE / HOP)));
  return { offset: lag / (RATE / HOP), confidence: score };
}
