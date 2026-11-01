// Where presentations live: files on the local server (presentations/<id>.json) when it is running,
// otherwise this browser's storage (a static build of the app has no server).

export interface PresentationInfo { id: string; title: string; scenes: number; updated: string }

export interface Store {
  kind: 'files' | 'browser';
  list(): Promise<PresentationInfo[]>;
  load(id: string): Promise<string>;
  save(id: string, text: string): Promise<void>;
  create(text: string): Promise<string>;
  remove(id: string): Promise<void>;
}

const api = async (url: string, init?: RequestInit) => {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res;
};

const files: Store = {
  kind: 'files',
  list: async () => (await api('/api/presentations')).json(),
  load: async (id) => (await api(`/api/presentations/${id}`)).text(),
  save: async (id, text) => void (await api(`/api/presentations/${id}`, { method: 'PUT', body: text })),
  create: async (text) => (await (await api('/api/presentations', { method: 'POST', body: text })).json()).id,
  remove: async (id) => void (await api(`/api/presentations/${id}`, { method: 'DELETE' })),
};

const KEY = 'jzm.presentations';
type Local = Record<string, { text: string; updated: string }>;
const read = (): Local => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
};
const write = (all: Local) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage full or unavailable: changes last for this page only.
  }
};
const infoOf = (id: string, text: string, updated: string): PresentationInfo => {
  try {
    const doc = JSON.parse(text);
    return { id, title: String(doc.title ?? id), scenes: doc.scenes?.length ?? 0, updated };
  } catch {
    return { id, title: id, scenes: 0, updated };
  }
};

const browser: Store = {
  kind: 'browser',
  list: async () => Object.entries(read()).map(([id, p]) => infoOf(id, p.text, p.updated)).sort((a, b) => b.updated.localeCompare(a.updated)),
  load: async (id) => {
    const p = read()[id];
    if (!p) throw new Error(`no presentation ${id}`);
    return p.text;
  },
  save: async (id, text) => write({ ...read(), [id]: { text, updated: new Date().toISOString() } }),
  create: async (text) => {
    const id = crypto.randomUUID().slice(0, 8);
    write({ ...read(), [id]: { text, updated: new Date().toISOString() } });
    return id;
  },
  remove: async (id) => {
    const all = read();
    delete all[id];
    write(all);
  },
};

/** The files store if the local server answers, else browser storage. */
export async function openStore(): Promise<Store> {
  try {
    await files.list();
    return files;
  } catch {
    return browser;
  }
}

export const blankPresentation = (title = 'Untitled') => JSON.stringify({
  version: 1,
  title,
  scenes: [{
    id: 'scene-1',
    title: 'Scene 1',
    elements: [{ id: 'title', type: 'text', text: title, x: 960, y: 540, size: 96, color: 'yellow' }],
    beats: [{ title: 'Title', actions: [{ do: 'draw', target: 'title' }] }],
  }],
}, null, 2);
