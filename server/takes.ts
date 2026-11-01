import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Performance } from '../src/video/performance';
import { probe, remux } from './media';

// A take is one recording session: the presenter's clicks (the performance), the presentation as it was,
// and media tracks (my camera and mic, a friend's recording...). Stored as files in takes/<id>/.

export interface Track {
  name: string;
  file: string;
  /** Seconds into the take at which the track starts (negative: it started earlier). */
  offset: number;
  hasVideo: boolean;
  hasAudio: boolean;
  duration: number;
}

export interface Take {
  id: string;
  name: string;
  created: string;
  performance: Performance;
  /** The presentation when it was recorded; the timing in `performance` refers to it. */
  presentation: unknown;
  tracks: Track[];
}

export const TAKES_DIR = resolve(process.env.JZM_TAKES_DIR ?? 'takes');
const safe = (s: string) => /^[\w-]+$/.test(s);
const dir = (id: string) => {
  if (!safe(id)) throw new Error('bad take id');
  return join(TAKES_DIR, id);
};

export async function listTakes(): Promise<Take[]> {
  await mkdir(TAKES_DIR, { recursive: true });
  const ids = await readdir(TAKES_DIR);
  const takes = await Promise.all(ids.filter(safe).map((id) => getTake(id).catch(() => null)));
  return takes.filter((t): t is Take => !!t).sort((a, b) => b.created.localeCompare(a.created));
}

export async function getTake(id: string): Promise<Take> {
  return JSON.parse(await readFile(join(dir(id), 'take.json'), 'utf8'));
}

async function save(take: Take) {
  await writeFile(join(dir(take.id), 'take.json'), JSON.stringify(take, null, 2));
}

export async function createTake(input: { name: string; performance: Performance; presentation: unknown }): Promise<Take> {
  const take: Take = { id: randomUUID().slice(0, 8), created: new Date().toISOString(), tracks: [], ...input };
  await mkdir(dir(take.id), { recursive: true });
  await save(take);
  return take;
}

/** Stores a media file as a track, cleaning up browser recordings and reading what it contains. */
export async function addTrack(id: string, name: string, upload: string, ext: string, offset: number): Promise<Take> {
  if (!safe(name)) throw new Error('track names use letters, digits, - and _');
  const take = await getTake(id);
  const file = `${name}.${ext === 'webm' ? 'webm' : ext}`;
  const target = join(dir(id), file);
  if (ext === 'webm') {
    await remux(upload, target);
    await rm(upload, { force: true });
  } else {
    await rename(upload, target);
  }
  const info = await probe(target);
  take.tracks = [...take.tracks.filter((t) => t.name !== name), { name, file, offset, ...info }];
  // A recording that runs past the last click still belongs in the video.
  take.performance.duration = Math.max(take.performance.duration, ...take.tracks.map((t) => t.offset + t.duration));
  await save(take);
  return take;
}

export async function updateTake(id: string, patch: { name?: string; offsets?: Record<string, number>; removeTracks?: string[] }): Promise<Take> {
  const take = await getTake(id);
  if (patch.name) take.name = patch.name;
  for (const t of take.tracks) if (patch.offsets?.[t.name] !== undefined) t.offset = patch.offsets[t.name];
  for (const name of patch.removeTracks ?? []) {
    const t = take.tracks.find((x) => x.name === name);
    if (t) await rm(join(dir(id), t.file), { force: true });
    take.tracks = take.tracks.filter((x) => x.name !== name);
  }
  await save(take);
  return take;
}

export async function deleteTake(id: string) {
  await rm(dir(id), { recursive: true, force: true });
}

export const trackPath = (id: string, t: Track) => join(dir(id), t.file);
