import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { splitSentences } from '../src/app/tts';
import { FFMPEG, probe, run } from './media';
import { TTS_DIR, generateTts, type TtsRequest } from './tts';
import { uploadPath } from './transcribe';

// One voice clip from several beats' notes: each sentence generated (or taken from the cache), joined with short
// pauses, the pause after a beat's words longer where its animation needs more time. Pauses the speech model leaves
// inside a sentence (it can stop for most of a second at a colon) are shortened to MAX_PAUSE. Used by `npm run voice`
// (place, rebuild, again), the Script page and "Generate again" in a clip's window.

export const SENTENCE_GAP = 0.25;
export const BEAT_GAP = 0.6;
/** The longest silence kept inside a generated sentence, in seconds. */
export const MAX_PAUSE = 0.35;

/** `file` with every silence inside it longer than MAX_PAUSE cut down to it, as `out`; its new length. */
async function tighten(file: string, out: string): Promise<number> {
  await run(FFMPEG, ['-y', '-v', 'error', '-i', file, '-af', `silenceremove=stop_periods=-1:stop_duration=${MAX_PAUSE}:stop_threshold=-38dB:stop_silence=${MAX_PAUSE}`, '-ac', '1', '-ar', '48000', out]);
  return (await probe(out)).duration;
}

export type Voicer = Omit<TtsRequest, 'presentationId' | 'text'>;
export interface JoinPart { notes?: string; /** Seconds this part needs on screen (its animation). */ need: number }
export interface Joined { upload: string; duration: number; /** Where each part starts in the clip, in seconds. */ starts: number[]; /** Where the last part ends, its pause included. */ length: number }

/** Generate and join `parts` into uploads/<upload>; null when none of them has words. */
export async function joinVoice(presentationId: string, upload: string, parts: JoinPart[], voicer: Voicer): Promise<Joined | null> {
  const pieces: { audio: string; gap: number }[] = [];
  const starts: number[] = [];
  let t = 0, lead = 0;
  const tmp = await mkdtemp(join(tmpdir(), 'jzm-voice-'));
  try {
  for (const part of parts) {
    starts.push(t);
    const start = t;
    const lines = splitSentences(part.notes ?? '');
    for (const [k, text] of lines.entries()) {
      const r = await generateTts({ presentationId, text, ...voicer });
      const gap = k < lines.length - 1 ? SENTENCE_GAP : BEAT_GAP;
      const audio = join(tmp, `${pieces.length}.wav`);
      const duration = await tighten(join(TTS_DIR, presentationId, r.audio), audio);
      pieces.push({ audio, gap });
      t += duration + gap;
    }
    // Silence where the animation outlasts the words.
    const extra = Math.max(0, start + part.need + 0.3 - t);
    if (extra) { if (pieces.length) pieces[pieces.length - 1].gap += extra; else lead += extra; t += extra; }
  }
  if (!pieces.length) return null;
  const inputs = pieces.flatMap((p) => ['-i', p.audio]);
  const pads = pieces.map((p, k) => `[${k}:a]aresample=48000,aformat=channel_layouts=mono,${k === 0 && lead ? `adelay=${Math.round(lead * 1000)}:all=1,` : ''}apad=pad_dur=${p.gap.toFixed(3)}[p${k}]`);
  // Levelled to the loudness the video aims for (-16 LUFS), so it sits with recorded clips; speech services vary a lot.
  const joined = `${pieces.map((_, k) => `[p${k}]`).join('')}concat=n=${pieces.length}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[out]`;
  const out = uploadPath(upload);
  await run(FFMPEG, ['-y', '-v', 'error', ...inputs, '-filter_complex', [...pads, joined].join(';'), '-map', '[out]', '-c:a', 'libopus', '-b:a', '64k', out]);
  const duration = (await probe(out)).duration;
  return { upload, duration, starts, length: t };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** POST /api/voice/join: { presentationId, name, parts, ...voicer } → a new clip in uploads/, never overwriting one. */
export async function joinVoiceRequest(body: { presentationId: string; name?: string; parts: JoinPart[] } & Voicer) {
  // `fresh` (in the voicer): every line read anew, not taken from the cache.
  const { presentationId, name, parts, ...voicer } = body;
  if (!Array.isArray(parts) || !parts.length) throw new Error('nothing to say');
  const slug = (name ?? 'clip').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'clip';
  const r = await joinVoice(presentationId, `generated-${slug}-${randomBytes(3).toString('hex')}.webm`, parts, voicer);
  if (!r) throw new Error('These beats have no speaker notes to say');
  return r;
}
