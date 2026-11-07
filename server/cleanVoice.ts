import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FFMPEG, ffmpegMissing, probe } from './media';
import { uploadPath } from './transcribe';

// "Clean up voice" for a narration clip: removes background noise (fan, hum, room, keyboard) with RNNoise, a
// small neural network built into FFmpeg (the `arnndn` filter), after a gentle low cut for rumble. Local, free
// and private. The cleaned copy is a new file next to the original (`<name>-clean.webm`); the original stays.

// From the project folder, like media/ and uploads/ (the server code is bundled when it starts).
const MODELS = resolve(process.env.JZM_MODELS_DIR ?? 'server/models');
const MODEL = 'speech-somnolent-hogwash.rnnn';

export async function cleanVoice(upload: string): Promise<{ upload: string; duration: number }> {
  const source = uploadPath(upload);
  if (!existsSync(source)) throw new Error(`the recording ${upload} is not on this computer`);
  const cleaned = `${upload.replace(/\.[^.]+$/, '')}-clean.webm`;
  const out = uploadPath(cleaned);
  if (!existsSync(out)) {
    // FFmpeg runs in the models folder so the filter gets a plain file name (no drive letter to escape on Windows).
    await new Promise<void>((done, fail) => {
      const p = spawn(FFMPEG, ['-y', '-v', 'error', '-i', source, '-vn', '-af', `highpass=f=70,arnndn=m=${MODEL}`, '-c:a', 'libopus', '-b:a', '96k', out], { cwd: MODELS });
      let err = '';
      p.stderr.on('data', (d: Buffer) => { err += d.toString(); });
      p.on('error', (e) => fail(new Error(ffmpegMissing(FFMPEG, e.message))));
      p.on('close', (code) => (code === 0 ? done() : fail(new Error(`could not clean up the voice: ${err.slice(-400)}`))));
    });
  }
  return { upload: cleaned, duration: (await probe(out)).duration };
}
