import { addIsoModels, type IsoModel } from '../engine/iso';
import { addIcons, type IconDef } from '../engine/library';

// Icons, clipart and 3D models made in the app live on the local server (library/); load them in.

type Saved = (IconDef & { kind?: undefined }) | (IsoModel & { kind: 'iso' });

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
  addIcons(Object.fromEntries(entries.filter(([, d]) => d.kind !== 'iso')) as Record<string, IconDef>);
  addIsoModels(Object.fromEntries(entries.filter(([, d]) => d.kind === 'iso')) as Record<string, IsoModel>);
}

export async function saveToLibrary(name: string, def: Saved) {
  const res = await fetch(`/api/library/${name}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(def) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  register({ [name]: def });
}
