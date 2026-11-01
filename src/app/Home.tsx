import { useEffect, useState } from 'react';
import { compile } from '../engine/compile';
import { cuePerformance } from '../video/performance';
import { CreateWithAi, type RecordingSource } from './CreateWithAi';
import { Settings } from './Settings';
import { LibraryManager } from './LibraryManager';
import { confirmDialog } from './confirm';
import { StartBox, type Start } from './StartBox';
import { examples } from './examples';
import { Preview } from './Preview';
import { blankPresentation, type PresentationInfo, type Store } from './store';

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

/** All presentations: open, create (blank or from an example), rename, duplicate, delete. */
export function Home({ store, onOpen }: { store: Store; onOpen: (id: string) => void }) {
  const [items, setItems] = useState<(PresentationInfo & { text?: string })[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState<Start | null>(null);
  const [settings, setSettings] = useState(false);
  const [library, setLibrary] = useState(false);

  const load = async () => {
    try {
      const list = await store.list();
      setItems(await Promise.all(list.map(async (p) => ({ ...p, text: await store.load(p.id).catch(() => undefined) }))));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => void load(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async (text: string) => onOpen(await store.create(text));

  /** A presentation made from a recording also gets the recording as its first take, timed by the beats' cues. */
  const createFromAi = async (text: string, recording?: RecordingSource) => {
    const id = await store.create(text);
    if (recording) {
      const doc = JSON.parse(text);
      const compiled = compile(doc);
      if (compiled.ok) {
        const performance = cuePerformance(compiled.presentation, recording.duration);
        const take = await (await fetch('/api/takes', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: `${doc.title} · recording`, performance, presentation: doc, presentationId: id }),
        })).json();
        await fetch(`/api/takes/${take.id}/tracks/me?from=${recording.upload}&offset=0`, { method: 'PUT' });
      }
    }
    onOpen(id);
  };
  const retitle = (text: string, title: string) => {
    const doc = JSON.parse(text);
    return JSON.stringify({ ...doc, title }, null, 2);
  };
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const shown = (items ?? []).filter((p) => p.title.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="home">
      {start && (
        <CreateWithAi kind={start.mode} initialText={start.text} initialFile={start.file} modelId={start.modelId} onClose={() => setStart(null)} onCreate={createFromAi} />
      )}
      {settings && <Settings onClose={() => setSettings(false)} />}
      {library && <LibraryManager onClose={() => setLibrary(false)} />}
      <header className="home-bar">
        <span className="spacer" />
        <button onClick={() => setLibrary(true)} title="Icons, logos, clipart and 3D models">Library</button>
        <button onClick={() => setSettings(true)} title="Models, API keys, transcription">⚙ Settings</button>
      </header>
      <div className="hero">
        <img src="/logo.svg" alt="jz-motion" className="hero-logo" />
        <h1>What do you want to explain?</h1>
        <StartBox onStart={setStart} onSettings={() => setSettings(true)} canRecord={store.kind === 'files'} />
        <div className="hero-links">
          <button className="link" onClick={() => void create(blankPresentation())}>Blank presentation</button>
          <span className="muted">·</span>
          <select
            value=""
            onChange={(e) => {
              const ex = examples.find((x) => x.name === e.target.value);
              if (ex) void create(ex.text);
            }}
          >
            <option value="" disabled>Start from an example…</option>
            {examples.map((x) => <option key={x.name} value={x.name}>{x.title}</option>)}
          </select>
        </div>
      </div>
      <div className="home-list-head">
        <h2>Your presentations</h2>
        <span className="spacer" />
        <input className="search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <p className="muted store-note">
        {store.kind === 'files' ? 'Saved as files in presentations/ (on this computer).' : 'Saved in this browser only. Run the app with npm run dev to save presentations as files.'}
      </p>
      {error && <p className="error-text">{error}</p>}
      {items === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="cards">
          {shown.map((p) => (
            <div key={p.id} className="card">
              <button className="card-open" onClick={() => onOpen(p.id)} title="Open">
                {p.text ? <Preview json={p.text} className="thumb" /> : <div className="thumb" />}
              </button>
              <div className="card-body">
                <strong className="card-title" title={p.title}>{p.title}</strong>
                <span className="muted">{p.scenes} scene{p.scenes === 1 ? '' : 's'} · {ago(p.updated)}</span>
                <span className="row card-tools">
                  <button onClick={() => onOpen(p.id)}>Open</button>
                  <button
                    disabled={!p.text}
                    onClick={() => {
                      const title = prompt('Rename presentation', p.title);
                      if (title && p.text) void act(() => store.save(p.id, retitle(p.text!, title)));
                    }}
                  >
                    Rename
                  </button>
                  <button disabled={!p.text} onClick={() => p.text && void act(() => store.create(retitle(p.text!, `${p.title} (copy)`)))}>Duplicate</button>
                  <button className="danger" onClick={async () => (await confirmDialog({ title: `Delete “${p.title}”?`, message: "This can't be undone.", confirm: 'Delete', danger: true })) && void act(() => store.remove(p.id))}>Delete</button>
                </span>
              </div>
            </div>
          ))}
          {!shown.length && <p className="muted">{query ? 'Nothing matches.' : 'No presentations yet: start a new one or pick an example.'}</p>}
        </div>
      )}
    </div>
  );
}
