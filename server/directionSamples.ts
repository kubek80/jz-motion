import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { voiceKey } from '../src/app/tts';
import { DIRECTION_SAMPLES } from '../src/app/directionSampleList';
import { generateTts, TTS_DIR, type TtsRequest } from './tts';
import { uploadPath } from './transcribe';

// The samples in "How to direct your voice": each example sentence said in the voice in use, kept in uploads/
// (direction-sample-<id>.mp3) with a list of them in voice/direction-samples.json (which voice said them).
//
//   GET  /api/voice/direction-samples   { voice, samples: { id, upload, duration }[] } (empty until made)
//   POST /api/voice/direction-samples   { ...voicer } → the same, made (again) in that voice

const LIST = join(process.cwd(), 'voice', 'direction-samples.json');
const CACHE_ID = 'direction-samples';

export interface DirectionSampleList { voice: string; samples: { id: string; upload: string; duration: number }[] }

export async function readDirectionSamples(): Promise<DirectionSampleList> {
  return JSON.parse(await readFile(LIST, 'utf8').catch(() => '{"voice":"","samples":[]}'));
}

export async function makeDirectionSamples(voicer: Omit<TtsRequest, 'presentationId' | 'text'>): Promise<DirectionSampleList> {
  const samples: DirectionSampleList['samples'] = [];
  for (const s of DIRECTION_SAMPLES) {
    const r = await generateTts({ ...voicer, presentationId: CACHE_ID, text: s.text, fresh: true });
    const upload = `direction-sample-${s.id}.mp3`;
    await copyFile(join(TTS_DIR, CACHE_ID, r.audio), uploadPath(upload));
    samples.push({ id: s.id, upload, duration: Math.round(r.duration * 100) / 100 });
  }
  const list = { voice: voiceKey({ ...voicer, voice: voicer.voice ?? '' }), samples };
  await writeFile(LIST, `${JSON.stringify(list, null, 2)}\n`);
  return list;
}
