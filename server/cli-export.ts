// npm run export -- <presentation.json> [--take <id>] [--current] [--out file.mp4] [--fps 30|60] [--4k] [--gap 1.5]
// Renders a presentation (optionally with a recorded take) to MP4 without opening the app.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { exportVideo } from './export';
import { getTake } from './takes';
import { DEFAULT_TIMING } from '../src/video/performance';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const input = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!input) {
  console.error('usage: npm run export -- <presentation.json> [--take <id>] [--current] [--out file.mp4] [--fps 30|60] [--4k] [--gap seconds]');
  process.exit(1);
}

const presentation = JSON.parse(await readFile(input, 'utf8'));
const take = value('take') ? await getTake(value('take')!) : undefined;
const out = resolve(value('out') ?? `exports/${input.replace(/^.*\//, '').replace(/\.json$/, '')}.mp4`);
const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
await server.listen();
const started = Date.now();
try {
  const { duration } = await exportVideo({
    presentation, take, useTakePresentation: !flag('current'),
    fps: value('fps') === '60' ? 60 : 30, scale: flag('4k') ? 2 : 1,
    timing: { ...DEFAULT_TIMING, ...(value('gap') ? { gap: Number(value('gap')) } : {}) },
    out, appUrl: server.resolvedUrls!.local[0],
    onProgress: (done, total) => {
      if (done % 30 === 0 || done === total) process.stdout.write(`\rframe ${done}/${total}`);
    },
  });
  console.log(`\nwrote ${out} (${duration.toFixed(1)}s of video in ${((Date.now() - started) / 1000).toFixed(0)}s)`);
} finally {
  await server.close();
}
