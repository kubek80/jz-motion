import { useEffect, useState } from 'react';
import { loadFalKey, loadVoicer, saveFalKey, sharedKey, withKey } from './settingsStore';

// "My avatar": the picture that says your voice clips in the video. See the one in use, upload a picture to start from
// (only one uploaded here is shown: the picture an avatar was first made from stays out of sight),
// make a styled version of it (an image model through OpenRouter redraws it as the style says: the cartoon talking
// head in a home studio by default), and choose how it moves. Kept with the project (voice/my-avatar.json), for
// every presentation; the fal.ai key stays in this browser.

const OR = 'https://openrouter.ai/api/v1';
type Model = { model: string; label: string; price: number };
type Avatar = { photo: string; model: string; prompt?: string; calm?: boolean; source?: string; style?: string };
type Info = { avatar: Avatar | null; models: Model[]; defaultStyle: string; hasServerKey: boolean };

/** Your OpenRouter key: the voice's when it uses OpenRouter, or OpenRouter's under Models. */
const openRouterKey = () => { const v = loadVoicer(); return (v.baseURL === OR ? withKey(v).apiKey : '') || sharedKey({ baseURL: OR }) || ''; };

/** `embedded`: its parts only, inside another window (🧑 Avatar); `version` changes when another avatar is chosen there. */
export function MyAvatar({ onClose, embedded, version = 0 }: { onClose: () => void; embedded?: boolean; version?: number }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [style, setStyle] = useState('');
  const [candidate, setCandidate] = useState<{ photo: string; style?: string } | null>(null);
  const [prompt, setPrompt] = useState('');
  const [falKey, setFalKey] = useState(loadFalKey);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const i: Info = await (await fetch('/api/my-avatar')).json();
    setInfo(i);
    setStyle((s) => s || i.avatar?.style || i.defaultStyle);
    setPrompt(i.avatar?.prompt ?? '');
  };
  useEffect(() => { setStyle(''); setSource(null); setCandidate(null); setPrompt(''); void load(); }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Inside 🧑 Avatar, it closes on Esc.
    if (embedded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement).closest('input, textarea, select')) { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, embedded]);

  const call = async <T,>(what: string, url: string, body: BodyInit, json = true): Promise<T | null> => {
    setBusy(what);
    setError(null);
    try {
      const res = await fetch(url, { method: 'POST', ...(json ? { headers: { 'content-type': 'application/json' } } : {}), body });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? res.statusText);
      return j as T;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  };
  const save = async (patch: Partial<Avatar>) => { if (await call('Saving…', '/api/my-avatar', JSON.stringify(patch))) await load(); };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const r = await call<{ source: string }>('Adding the picture…', `/api/my-avatar/source?name=${encodeURIComponent(file.name)}`, file, false);
    if (r) { setSource(r.source); setCandidate(null); }
  };
  const asItIs = async () => {
    const r = source && await call<{ photo: string }>('Framing it…', '/api/my-avatar/photo', JSON.stringify({ source }));
    if (r) setCandidate({ photo: r.photo });
  };
  const styled = async () => {
    const r = source && await call<{ photo: string }>('Drawing it in that style (about half a minute)…', '/api/my-avatar/style', JSON.stringify({ source, style, apiKey: openRouterKey() || undefined }));
    if (r) setCandidate({ photo: r.photo, style });
  };
  const use = async () => {
    if (!candidate) return;
    await save({ photo: candidate.photo, source: source ?? undefined, style: candidate.style });
    setCandidate(null);
  };

  const a = info?.avatar;
  const model = info?.models.find((m) => m.model === a?.model) ?? info?.models[0];
  const content = (
      <>

        {/* Two columns inside 🧑 Avatar: the look and where it comes from; the style and how it moves. */}
        <div className="avatar-col">
        <section>
          <h4>The avatar in use</h4>
          {a ? (
            <div className="avatar-in-use">
              <img src={`/uploads/${a.photo}`} alt="Your avatar" />
              <p className="muted hint">{a.style ? 'A styled version of your picture.' : 'Your picture, as it is.'} Kept with the project: <code>voice/my-avatar.json</code> and <code>uploads/{a.photo}</code>, for every presentation. Avatars already made keep the look they were made with: make them again from a clip (its window, or right-click it in Timing).</p>
            </div>
          ) : <p className="muted">None yet: start from a picture below.</p>}
        </section>

        <section>
          <h4>Start from a picture</h4>
          <div className="row wrap">
            <label className="button-like">🖼 Choose a picture…<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void pick(e.target.files?.[0])} /></label>
            {source && <img className="avatar-source" src={`/uploads/${source}`} alt="The picture to start from" />}
            {source && <button onClick={() => void asItIs()} disabled={!!busy}>Use it as it is</button>}
          </div>
          <p className="muted hint">Upload a new picture of you to make a new avatar from: facing the camera works best, head and shoulders, even light. It is framed 16:9.</p>
        </section>
        </div>

        <div className="avatar-col">
        <section>
          <h4>Make a styled version</h4>
          <textarea className="sample-text" rows={5} value={style} onChange={(e) => setStyle(e.target.value)} />
          <div className="row wrap">
            <button className="primary" onClick={() => void styled()} disabled={!!busy || !source} title="An image model redraws the picture as this says (Gemini through OpenRouter, about 14¢)">✨ Draw it in this style</button>
            <button onClick={() => setStyle(info?.defaultStyle ?? '')} disabled={!!busy}>The cartoon studio style</button>
            {!source && <span className="muted">Upload a picture first.</span>}
          </div>
          {candidate && (
            <div className="avatar-candidate">
              <img src={`/uploads/${candidate.photo}`} alt="The new version" />
              <div className="row">
                <button className="primary" onClick={() => void use()} disabled={!!busy}>Use this one</button>
                <button onClick={() => setCandidate(null)} disabled={!!busy}>Discard</button>
                {candidate.style && <button onClick={() => void styled()} disabled={!!busy}>Try again</button>}
              </div>
            </div>
          )}
        </section>

        <section>
          <h4>How it moves</h4>
          <label className="field">
            <span>made by</span>
            <select value={model?.model ?? ''} onChange={(e) => void save({ model: e.target.value })} disabled={!a || !!busy}>
              {info?.models.map((m) => <option key={m.model} value={m.model}>{m.label} · about {Math.round(m.price * 100)}¢ a second</option>)}
            </select>
          </label>
          <label className="check" title="The face follows a quieter copy of your voice with its peaks evened out, so the mouth moves less">
            <input type="checkbox" checked={a?.calm !== false} disabled={!a || !!busy} onChange={(e) => void save({ calm: e.target.checked })} /> calm, small mouth movements
          </label>
          <label className="field">
            <span>movement</span>
            <input value={prompt} disabled={!a} onChange={(e) => setPrompt(e.target.value)} onBlur={() => a && prompt !== (a.prompt ?? '') && void save({ prompt })} placeholder="how it should move while speaking" />
          </label>
          <label className="field">
            <span>fal.ai key</span>
            <input type="password" autoComplete="off" value={falKey} placeholder={info?.hasServerKey ? 'empty: the app’s server has one' : 'from fal.ai → Keys'} onChange={(e) => { setFalKey(e.target.value); saveFalKey(e.target.value); }} />
          </label>
        </section>
        </div>
        {busy && <p className="muted">{busy}</p>}
        {error && <p className="note-text">{error}</p>}
      </>
  );
  if (embedded) return <div className="my-voice my-avatar embedded">{content}</div>;
  return (
    <div className="modal-back my-voice-back" onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal wide my-voice my-avatar">
        <div className="modal-head">
          <h2>My avatar</h2>
          <span className="muted">the picture that says your clips in the video</span>
          <span className="spacer" />
          <button onClick={onClose} title="Close (Esc)">✕</button>
        </div>
        {content}
      </div>
    </div>
  );
}
