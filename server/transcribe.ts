import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { FFMPEG, probe, run } from './media';

// Recordings uploaded to make a presentation from: kept in uploads/ until they become a take's track.
// Transcription goes to any OpenAI-compatible /audio/transcriptions endpoint (OpenAI, Groq, a local Whisper server).

export const UPLOADS_DIR = resolve(process.env.JZM_UPLOADS_DIR ?? 'uploads');

export interface Segment { start: number; end: number; text: string }

export function uploadPath(upload: string) {
  if (!/^[\w-]+\.\w+$/.test(upload)) throw new Error('bad upload id');
  return join(UPLOADS_DIR, upload);
}

export async function saveUpload(req: IncomingMessage, ext: string): Promise<string> {
  await mkdir(UPLOADS_DIR, { recursive: true });
  const upload = `${randomUUID().slice(0, 8)}.${ext.replace(/[^\w]/g, '') || 'webm'}`;
  await pipeline(req, createWriteStream(uploadPath(upload)));
  return upload;
}

export async function transcribe(upload: string, service: { baseURL: string; model: string; apiKey?: string }) {
  const source = uploadPath(upload);
  const info = await probe(source);
  if (!info.hasAudio) throw new Error('the recording has no sound');
  // Small mono audio keeps the request under the usual 25 MB limit (about an hour).
  // Its own temporary file, so two transcriptions of the same recording can't remove each other's.
  const audio = join(UPLOADS_DIR, `${upload}.${randomUUID().slice(0, 8)}.mp3`);
  await run(FFMPEG, ['-y', '-v', 'error', '-i', source, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', audio]);
  try {
    const form = new FormData();
    form.append('file', new Blob([await readFile(audio)], { type: 'audio/mpeg' }), 'audio.mp3');
    form.append('model', service.model);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    const url = new URL(`${service.baseURL.replace(/\/+$/, '')}/audio/transcriptions`);
    if (!/^https?:$/.test(url.protocol)) throw new Error('the transcription URL must be http(s)');
    const res = await fetch(url, { method: 'POST', headers: service.apiKey ? { authorization: `Bearer ${service.apiKey}` } : {}, body: form });
    const text = await res.text();
    if (!res.ok) throw new Error(`transcription failed (${res.status}): ${text.slice(0, 300)}`);
    const data = JSON.parse(text);
    const segments: Segment[] = Array.isArray(data.segments) && data.segments.length
      ? data.segments.map((s: Segment) => ({ start: Number(s.start), end: Number(s.end), text: String(s.text).trim() }))
      : [{ start: 0, end: info.duration, text: String(data.text ?? '').trim() }];
    return { upload, duration: info.duration, segments };
  } finally {
    await rm(audio, { force: true });
  }
}

/**
 * Transcribes a recording already in uploads/ (a narration clip), keeping the result next to it
 * (`<upload>.transcript.json`) so asking again is instant. `again` ignores the kept one.
 */
export async function transcribeKept(upload: string, service: { baseURL: string; model: string; apiKey?: string }, again = false) {
  const kept = `${uploadPath(upload)}.transcript.json`;
  if (!again) {
    try {
      const saved = JSON.parse(await readFile(kept, 'utf8'));
      if (saved.model === service.model) return saved.result as Awaited<ReturnType<typeof transcribe>>;
    } catch { /* not transcribed yet */ }
  }
  const result = await transcribe(upload, service);
  await writeFile(kept, JSON.stringify({ model: service.model, result }));
  return result;
}
