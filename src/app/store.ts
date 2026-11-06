// Where presentations live: files on the local server (presentations/<id>.json) when it is running,
// otherwise this browser's storage (a static build of the app has no server).

import { log, voiceoverSummary, cuedBeatCount } from './debug';

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

// Per-id mtime we loaded, sent back on save so the server can refuse a stale write
// (if the file changed on disk — e.g. a code agent, git checkout — the editor's copy is stale).
const loadedMtime = new Map<string, string>();
// Per-id in-flight save chain. Saves are serialized: #2 waits for #1 to finish (and update
// `loadedMtime`) before it reads the mtime for its own PUT. Without this, two debounced saves
// fired back-to-back both carry the pre-save mtime, the server accepts the first, rejects the
// second as STALE, and the editor's later edits are silently dropped from disk — on next reload
// you'd see your change "revert" to what the server actually kept.
const pending = new Map<string, Promise<unknown>>();

const files: Store = {
  kind: 'files',
  list: async () => (await api('/api/presentations')).json(),
  load: async (id) => {
    const res = await api(`/api/presentations/${id}`);
    const m = res.headers.get('x-modified-at');
    if (m) loadedMtime.set(id, m); else loadedMtime.delete(id);
    return res.text();
  },
  save: async (id, text) => {
    const summary = (() => { try { const d = JSON.parse(text); return { voiceover: voiceoverSummary(d.voiceover), cuedBeats: cuedBeatCount(d) }; } catch { return { parse: 'failed' }; } })();
    log('save:queued', { id, ...summary, bytes: text.length });
    const prev = pending.get(id) ?? Promise.resolve();
    const task = prev.catch(() => undefined).then(async () => {
      const headers: Record<string, string> = {};
      const m = loadedMtime.get(id);
      if (m) headers['x-modified-at'] = m;
      log('save:sending', { id, expectedMtime: m, ...summary });
      const res = await fetch(`/api/presentations/${id}`, { method: 'PUT', headers, body: text });
      if (res.status === 409) {
        const msg = await res.text().catch(() => '');
        log('save:stale', { id, expectedMtime: m, message: msg });
        // The file was changed on disk; the editor's copy is stale.
        const err = new Error('STALE: ' + msg);
        (err as Error & { stale?: boolean }).stale = true;
        throw err;
      }
      if (!res.ok) {
        const txt = await res.text();
        log('save:error', { id, status: res.status, body: txt });
        throw new Error(`${res.status} ${txt}`);
      }
      // The server returns the new mtime (header + body). Track it so the next save doesn't look
      // stale against the file this save just wrote.
      const nm = res.headers.get('x-modified-at');
      if (nm) {
        loadedMtime.set(id, nm);
      } else {
        // Fallback: body may carry it.
        const body = await res.json().catch(() => null);
        if (body?.modifiedAt) loadedMtime.set(id, body.modifiedAt);
      }
      log('save:ok', { id, newMtime: loadedMtime.get(id) });
    });
    pending.set(id, task);
    return task;
  },
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
