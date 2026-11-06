import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { addIsoModels, type IsoModel } from '../src/engine/iso';
import { addIcons, type IconDef } from '../src/engine/library';

// Icons and clipart made in the app: library/<name>.json, one drawing each.

export const LIBRARY_DIR = resolve(process.env.JZM_LIBRARY_DIR ?? 'library');

const file = (name: string) => {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('names use lowercase letters, digits and -');
  return join(LIBRARY_DIR, `${name}.json`);
};

export async function readLibrary(): Promise<Record<string, unknown>> {
  await mkdir(LIBRARY_DIR, { recursive: true });
  const out: Record<string, unknown> = {};
  for (const f of (await readdir(LIBRARY_DIR)).filter((n) => n.endsWith('.json')).sort()) {
    try {
      out[f.slice(0, -5)] = JSON.parse(await readFile(join(LIBRARY_DIR, f), 'utf8'));
    } catch {
      // Skip a file that isn't valid JSON rather than losing the whole library.
    }
  }
  return out;
}

export async function saveIcon(name: string, def: unknown) {
  await mkdir(LIBRARY_DIR, { recursive: true });
  await writeFile(file(name), JSON.stringify(def, null, 1));
}

export async function deleteIcon(name: string) {
  await rm(file(name), { force: true });
}

/**
 * Makes the engine know the icons, clipart and 3D models in library/, as the app does when it loads them.
 * Needed before compiling on the server (export, snapshot, check); returns their names.
 */
export async function registerLibrary(): Promise<string[]> {
  const all = await readLibrary();
  for (const [name, def] of Object.entries(all) as [string, { kind?: string }][]) {
    if (def.kind === 'iso') addIsoModels({ [name]: def as unknown as IsoModel });
    else addIcons({ [name]: def as unknown as IconDef });
  }
  return Object.keys(all);
}
