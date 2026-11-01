import { addIsoModels, isoModels, type IsoModel } from '../engine/iso';
import { addIcons, icons, type IconDef } from '../engine/library';

// Icons, clipart and 3D models made in the app live on the local server (library/); load them in.

export type Saved = (IconDef & { kind?: undefined }) | (IsoModel & { kind: 'iso'; tags?: string[] });

/** What is in library/ now, by name. Everything else in the palette is built in. */
export const userItems: Record<string, Saved> = {};

export async function loadUserLibrary(): Promise<Record<string, Saved>> {
  try {
    const res = await fetch('/api/library');
    if (!res.ok) return {};
    const all = (await res.json()) as Record<string, Saved>;
    register(all);
    return all;
  } catch {
    return {};
  }
}

function register(all: Record<string, Saved>) {
  const entries = Object.entries(all);
  Object.assign(userItems, all);
  addIcons(Object.fromEntries(entries.filter(([, d]) => d.kind !== 'iso')) as Record<string, IconDef>);
  addIsoModels(Object.fromEntries(entries.filter(([, d]) => d.kind === 'iso')) as Record<string, IsoModel>);
}

function unregister(name: string) {
  delete userItems[name];
  delete icons[name];
  delete isoModels[name];
}

const check = async (res: Response) => {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
};

export async function saveToLibrary(name: string, def: Saved) {
  await check(await fetch(`/api/library/${name}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(def) }));
  register({ [name]: def });
}

export async function deleteFromLibrary(name: string) {
  await check(await fetch(`/api/library/${name}`, { method: 'DELETE' }));
  unregister(name);
}

export async function renameInLibrary(from: string, to: string) {
  const def = userItems[from];
  if (!def) throw new Error(`"${from}" is not in your library`);
  if (to in icons || to in isoModels) throw new Error(`"${to}" is already used`);
  await saveToLibrary(to, def);
  await deleteFromLibrary(from);
}
