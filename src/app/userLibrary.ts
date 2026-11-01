import { addIcons, type IconDef } from '../engine/library';

// Icons and clipart made in the app live on the local server (library/); load them into the library.

export async function loadUserLibrary(): Promise<Record<string, IconDef>> {
  try {
    const res = await fetch('/api/library');
    if (!res.ok) return {};
    const defs = (await res.json()) as Record<string, IconDef>;
    addIcons(defs);
    return defs;
  } catch {
    return {};
  }
}

export async function saveToLibrary(name: string, def: IconDef) {
  const res = await fetch(`/api/library/${name}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(def) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  addIcons({ [name]: def });
}
