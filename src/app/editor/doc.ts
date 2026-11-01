// Edits on the raw presentation JSON (as the person wrote it, without schema defaults filled in).
// Every function returns a new document and leaves the input untouched.

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Raw = Record<string, any>;
export interface RawDoc { version: 1; title: string; scenes: RawScene[]; voiceover?: { upload: string; duration: number; name?: string } }
export interface RawScene { id: string; title?: string; inherit?: boolean; elements?: Raw[]; beats?: RawBeat[]; [k: string]: unknown }
export interface RawBeat { title?: string; notes?: string; auto?: boolean; cue?: number; actions: Raw[] }

const clone = <T>(v: T): T => structuredClone(v);

/** Scenes whose element ids are visible from scene `si`: the scene itself and the chain it inherits from. */
function inheritChain(doc: RawDoc, si: number): number[] {
  const out = [si];
  for (let i = si; i > 0 && doc.scenes[i].inherit; i--) out.push(i - 1);
  return out;
}

/** Scenes that can refer to ids of scene `si`: the scene and the inheriting scenes right after it. */
function referencingScenes(doc: RawDoc, si: number): number[] {
  const out = [si];
  for (let i = si + 1; i < doc.scenes.length && doc.scenes[i].inherit; i++) out.push(i);
  return out;
}

export function idsInScope(doc: RawDoc, si: number): Set<string> {
  const ids = new Set<string>();
  for (const i of inheritChain(doc, si)) for (const el of doc.scenes[i].elements ?? []) ids.add(el.id);
  return ids;
}

export function uniqueId(doc: RawDoc, si: number, base: string): string {
  const taken = new Set<string>();
  for (const i of [...inheritChain(doc, si), ...referencingScenes(doc, si)]) {
    for (const el of doc.scenes[i].elements ?? []) taken.add(el.id);
  }
  const clean = base.replace(/[^\w-]/g, '-').replace(/^[^A-Za-z]+/, '') || 'el';
  if (!taken.has(clean)) return clean;
  for (let n = 2; ; n++) if (!taken.has(`${clean}-${n}`)) return `${clean}-${n}`;
}

export function addElement(doc: RawDoc, si: number, el: Raw): RawDoc {
  const d = clone(doc);
  (d.scenes[si].elements ??= []).push(el);
  return d;
}

/** Sets fields on an element; a field set to undefined is removed. */
export function updateElement(doc: RawDoc, si: number, id: string, patch: Raw): RawDoc {
  const d = clone(doc);
  const el = d.scenes[si].elements?.find((e) => e.id === id);
  if (!el) return doc;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete el[k];
    else el[k] = v;
  }
  return d;
}

const refId = (ref: unknown) => (typeof ref === 'string' ? ref.split('.')[0] : undefined);
const renameRef = (ref: unknown, from: string, to: string) =>
  typeof ref === 'string' && refId(ref) === from ? to + ref.slice(from.length) : ref;

/** Removes an element, the arrows attached to it, and its mentions in actions. Actions left without targets are dropped. */
export function deleteElement(doc: RawDoc, si: number, id: string): RawDoc {
  const d = clone(doc);
  const gone = new Set([id]);
  for (const i of referencingScenes(d, si)) {
    const scene = d.scenes[i];
    for (const el of scene.elements ?? []) {
      if (el.type === 'arrow' && (gone.has(refId(el.from)!) || gone.has(refId(el.to)!))) gone.add(el.id);
    }
  }
  for (const i of referencingScenes(d, si)) {
    const scene = d.scenes[i];
    scene.elements = (scene.elements ?? []).filter((el) => !gone.has(el.id));
    for (const beat of scene.beats ?? []) {
      beat.actions = beat.actions.flatMap((a) => {
        for (const key of ['target', 'focus'] as const) {
          if (a[key] === undefined || a[key] === 'all') continue;
          const list = [a[key]].flat().filter((t: string) => !gone.has(t));
          if (!list.length) return [];
          a[key] = Array.isArray(a[key]) ? list : list[0];
        }
        return [a];
      });
    }
  }
  return d;
}

/** Renames an element and every reference to it (arrows, action targets, camera focus). */
export function renameElement(doc: RawDoc, si: number, from: string, to: string): RawDoc {
  if (from === to) return doc;
  const d = clone(doc);
  const own = d.scenes[si].elements?.find((e) => e.id === from);
  if (own) own.id = to;
  for (const i of referencingScenes(d, si)) {
    const scene = d.scenes[i];
    for (const el of scene.elements ?? []) {
      if (el.type === 'arrow') {
        el.from = renameRef(el.from, from, to);
        el.to = renameRef(el.to, from, to);
      }
    }
    for (const beat of scene.beats ?? []) {
      for (const a of beat.actions) {
        for (const key of ['target', 'focus'] as const) {
          if (Array.isArray(a[key])) a[key] = a[key].map((t: string) => (t === from ? to : t));
          else if (a[key] === from) a[key] = to;
        }
        if (a.do === 'circle' && a.id === from) a.id = to;
      }
    }
  }
  return d;
}

export function updateScene(doc: RawDoc, si: number, patch: Partial<RawScene>): RawDoc {
  const d = clone(doc);
  Object.assign(d.scenes[si], patch);
  for (const [k, v] of Object.entries(patch)) if (v === undefined) delete (d.scenes[si] as Raw)[k];
  return d;
}

export function addScene(doc: RawDoc, after: number): RawDoc {
  const d = clone(doc);
  const ids = new Set(d.scenes.map((s) => s.id));
  let n = d.scenes.length + 1;
  while (ids.has(`scene-${n}`)) n++;
  d.scenes.splice(after + 1, 0, { id: `scene-${n}`, title: `Scene ${n}`, elements: [], beats: [] });
  return d;
}

export function deleteScene(doc: RawDoc, si: number): RawDoc {
  if (doc.scenes.length <= 1) return doc;
  const d = clone(doc);
  d.scenes.splice(si, 1);
  // A scene that inherited from the deleted one now inherits from the one before it, which may not have the same elements.
  if (si === 0 && d.scenes[0]) delete d.scenes[0].inherit;
  return d;
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const out = [...list];
  if (to < 0 || to >= out.length) return out;
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

export function updateBeats(doc: RawDoc, si: number, fn: (beats: RawBeat[]) => RawBeat[]): RawDoc {
  const d = clone(doc);
  d.scenes[si].beats = fn(d.scenes[si].beats ?? []);
  return d;
}
