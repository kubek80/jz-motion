import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { splitSentences } from '../src/app/tts';
import { FFMPEG, probe, run } from './media';
import { TTS_DIR, generateTts, type TtsRequest } from './tts';
import { uploadPath } from './transcribe';

// One voice clip from several beats' notes: each sentence generated (or taken from the cache), joined with short
// pauses, the pause after a beat's words longer where its animation needs more time. Used by `npm run voice`
// (place, rebuild) and by "Generate again" in a clip's window.

export const SENTENCE_GAP = 0.25;
export const BEAT_GAP = 0.6;

export type Voicer = Omit<TtsRequest, 'presentationId' | 'text'>;
export interface JoinPart { notes?: string; /** Seconds this part needs on screen (its animation). */ need: number }
export interface Joined { upload: string; duration: number; /** Where each part starts in the clip, in seconds. */ starts: number[]; /** Where the last part ends, its pause included. */ length: number }

/** Generate and join `parts` into uploads/<upload>; null when none of them has words. */
export async function joinVoice(presentationId: string, upload: string, parts: JoinPart[], voicer: Voicer): Promise<Joined | null> {
  const pieces: { audio: string; gap: number }[] = [];
  const starts: number[] = [];
  let t = 0, lead = 0;
  for (const part of parts) {
    starts.push(t);
    const start = t;
    const lines = splitSentences(part.notes ?? '');
    for (const [k, text] of lines.entries()) {
      const r = await generateTts({ presentationId, text, ...voicer });
      const gap = k < lines.length - 1 ? SENTENCE_GAP : BEAT_GAP;
      pieces.push({ audio: join(TTS_DIR, presentationId, r.audio), gap });
      t += r.duration + gap;
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
