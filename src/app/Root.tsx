import { useCallback, useEffect, useState } from 'react';
import intro from '../examples/intro.json';
import { Editor } from './App';
import { Home } from './Home';
import { openStore, type Store } from './store';
import { loadUserLibrary } from './userLibrary';

/** The id in the address (#/p/<id>), so a reload keeps the presentation open. */
const idFromHash = () => location.hash.match(/^#\/p\/([\w-]+)/)?.[1] ?? null;

/** First run: the single draft older versions kept in the browser becomes a presentation, else the intro example. */
async function seed(store: Store) {
  if ((await store.list()).length) return;
  let draft: string | null = null;
  try {
    draft = localStorage.getItem('jzm.draft');
  } catch {
    // no storage
  }
  await store.create(draft ?? JSON.stringify(intro, null, 2));
}

// Shared so React's double-run of effects in development can't seed twice.
let ready: Promise<Store> | null = null;
const getStore = () => (ready ??= Promise.all([openStore(), loadUserLibrary()]).then(async ([s]) => {
  await seed(s).catch(() => undefined);
  return s;
}));

export function Root() {
  const [store, setStore] = useState<Store | null>(null);
  const [openId, setOpenId] = useState<string | null>(idFromHash);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getStore().then(setStore);
    const onHash = () => setOpenId(idFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    setText(null);
    setError(null);
    if (!store || !openId) return;
    store.load(openId).then(setText, (e: Error) => setError(e.message));
  }, [store, openId]);

  const open = (id: string | null) => {
    location.hash = id ? `#/p/${id}` : '';
    setOpenId(id);
  };
  const save = useCallback((t: string) => void store?.save(openId!, t), [store, openId]);

  if (!store) return <div className="home"><p className="muted">Loading…</p></div>;
  if (!openId) return <Home store={store} onOpen={open} />;
  if (error) return <div className="home"><p className="error-text">Could not open this presentation: {error}</p><button onClick={() => open(null)}>All presentations</button></div>;
  if (text === null) return <div className="home"><p className="muted">Opening…</p></div>;
  return <Editor key={openId} id={openId} initial={text} onSave={save} onHome={() => open(null)} />;
}
