import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// Presentations as files: presentations/<id>.json holds the presentation exactly as edited.

export const PRESENTATIONS_DIR = resolve(process.env.JZM_PRESENTATIONS_DIR ?? 'presentations');

export interface PresentationInfo { id: string; title: string; scenes: number; updated: string }

const file = (id: string) => {
  if (!/^[\w-]+$/.test(id)) throw new Error('bad presentation id');
  return join(PRESENTATIONS_DIR, `${id}.json`);
};

export async function listPresentations(): Promise<PresentationInfo[]> {
  await mkdir(PRESENTATIONS_DIR, { recursive: true });
  const names = (await readdir(PRESENTATIONS_DIR)).filter((n) => n.endsWith('.json'));
  const infos = await Promise.all(names.map(async (n) => {
    const id = n.slice(0, -5);
    try {
      const [text, info] = await Promise.all([readFile(file(id), 'utf8'), stat(file(id))]);
      const doc = JSON.parse(text);
      return { id, title: String(doc.title ?? id), scenes: Array.isArray(doc.scenes) ? doc.scenes.length : 0, updated: info.mtime.toISOString() };
    } catch {
      // A file that isn't valid JSON (being edited by hand?) still shows up, so it can be opened and fixed.
      return { id, title: id, scenes: 0, updated: new Date(0).toISOString() };
    }
  }));
  return infos.sort((a, b) => b.updated.localeCompare(a.updated));
}

export async function readPresentation(id: string): Promise<{ text: string; modifiedAt: string }> {
  const [text, info] = await Promise.all([readFile(file(id), 'utf8'), stat(file(id))]);
  return { text, modifiedAt: info.mtime.toISOString() };
}

/**
 * Saves the text as given (it may be mid-edit and not valid yet). If `expectedModifiedAt` is
 * given and the file on disk is newer than that, throws a Conflict error — the editor's copy is
 * stale (the file was changed outside the app, e.g. by a code agent or git checkout) and the
 * user should reload before overwriting.
 *
 * Returns the new mtime so the editor can update its tracked value for the next save, otherwise
 * every save after the first would look stale.
 */
export async function writePresentation(id: string, text: string, expectedModifiedAt?: string): Promise<{ modifiedAt: string }> {
  await mkdir(PRESENTATIONS_DIR, { recursive: true });
  if (expectedModifiedAt) {
    const info = await stat(file(id)).catch(() => null);
    if (info && info.mtime.toISOString() > expectedModifiedAt) {
      const err = new Error(`the presentation was changed on disk at ${info.mtime.toISOString()} — reload the page before saving`);
      (err as Error & { code?: string }).code = 'STALE';
      throw err;
    }
  }
  await writeFile(file(id), text);
  const info = await stat(file(id));
  return { modifiedAt: info.mtime.toISOString() };
}

export async function createPresentation(text: string): Promise<string> {
  const id = randomUUID().slice(0, 8);
  await writePresentation(id, text);
  return id;
}

export async function deletePresentation(id: string) {
  await rm(file(id), { force: true });
}
