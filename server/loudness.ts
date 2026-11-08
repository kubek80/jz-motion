import { spawn } from 'node:child_process';
import { FFMPEG, ffmpegMissing } from './media';
import { uploadPath } from './transcribe';

// How loud a voice clip is: its integrated loudness (LUFS, as the export measures it) and its loudest true peak
// (dBTP), over the part of the recording the clip plays. FFmpeg's loudnorm filter in analysis mode.

export interface Loudness {
  /** Integrated loudness in LUFS; null when the part is silent. */
  lufs: number | null;
  /** Loudest true peak in dBTP; null when silent. */
  peak: number | null;
  /** The export brings the whole video to this. */
  target: number;
}

export const TARGET_LUFS = -16;

export function measureLoudness(file: string, start = 0, end?: number): Promise<Loudness> {
  const args = ['-hide_banner', '-nostats', '-ss', String(Math.max(0, start)), ...(end !== undefined ? ['-t', String(Math.max(0.1, end - start))] : []),
    '-i', uploadPath(file), '-vn', '-af', `loudnorm=I=${TARGET_LUFS}:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-'];
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d: Buffer) => (err += d.toString()));
    p.on('error', (e) => reject(new Error(ffmpegMissing(FFMPEG, e.message))));
    p.on('close', (code) => {
      const json = err.slice(err.lastIndexOf('{'), err.lastIndexOf('}') + 1);
      if (code !== 0 || !json) return reject(new Error(`could not measure ${file}: ${err.slice(-300)}`));
      const m = JSON.parse(json) as { input_i: string; input_tp: string };
      const num = (s: string) => (Number.isFinite(Number(s)) && Number(s) > -70 ? Math.round(Number(s) * 10) / 10 : null);
      resolve({ lufs: num(m.input_i), peak: num(m.input_tp), target: TARGET_LUFS });
    });
  });
}
