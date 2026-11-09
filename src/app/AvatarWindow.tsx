import { useEffect, useState } from 'react';
import { MyAvatar } from './MyAvatar';
import { MyVoice } from './MyVoice';
import { VoiceDirections } from './VoiceDirections';
import { ACCENTS, loadVoicer, saveVoicer, VOICERS } from './settingsStore';

// "🧑 Avatar": your avatars and voices in one window. Each avatar is a look (its picture, style, how it moves) and the
// voice it speaks in; choose the one you're using (its voice comes with it: generated speech, npm run voice),
// add one (a copy of the one in use, to change), rename or remove. Below, the look and the voice of the one in use.
// Kept with the project (voice/my-avatar.json, the voice in use in voice/my-voice.json), for every presentation.

type Voice = { baseURL: string; model: string; instructions?: string; sample: { upload: string; start: number; end: number; name?: string; text?: string } };
type Avatar = { id: string; name: string; photo: string; voice?: Voice };

const voiceSummary = (v?: Voice) => {
  if (!v) return 'no voice of its own';
  const label = VOICERS.find((x) => x.model === v.model)?.label ?? v.model;
  const model = /\(([^,;)]+)/.exec(label)?.[1] ?? label.replace(/^OpenRouter · /, '');
  const accent = ACCENTS.find((a) => (a.instructions ?? '') === (v.instructions ?? ''))?.label ?? 'own style';
  return `${model} · ${accent}`;
};

export function AvatarWindow({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<{ current: string | null; avatars: Avatar[] }>({ current: null, avatars: [] });
  const [version, setVersion] = useState(0);
  const [part, setPart] = useState<'look' | 'voice'>('look');
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const load = async () => setList(await (await fetch('/api/me')).json());
  useEffect(() => { void load(); }, [version]);
  useEffect(() => {
    // Not while the directions window is open on top: Esc closes that one.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !help && !(e.target as HTMLElement).closest('input, textarea, select')) { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, help]);

  const post = async (what: string, body: object) => {
    setError(null);
    const res = await fetch(`/api/me/${what}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setError(j.error ?? res.statusText); return null; }
    return j;
  };
  /** Use avatar `id`: its voice becomes the voice this browser speaks in too. */
  const use = async (id: string) => {
    const a: Avatar | null = await post('use', { id });
    if (a?.voice) saveVoicer({ ...loadVoicer(), baseURL: a.voice.baseURL, model: a.voice.model, instructions: a.voice.instructions, sample: a.voice.sample });
    setVersion((v) => v + 1);
  };
  const add = async () => { if (await post('new', { name: `Avatar ${list.avatars.length + 1}` })) { setVersion((v) => v + 1); setPart('look'); } };
  const rename = async (id: string, name: string) => { if (await post('rename', { id, name })) await load(); };
  const remove = async (a: Avatar) => {
    if (!window.confirm(`Remove “${a.name}”? Its look and voice settings go; avatars already made in your videos stay.`)) return;
    const f = await post('delete', { id: a.id });
    if (f) { const now = f.avatars.find((x: Avatar) => x.id === f.current); if (now?.voice) saveVoicer({ ...loadVoicer(), ...now.voice }); setVersion((v) => v + 1); }
  };

  return (
    <div className="modal-back my-voice-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide my-voice me">
        <div className="modal-head">
          <h2>🧑 Avatar</h2>
          <span className="muted">your avatars, each with its voice, for every presentation</span>
          <span className="spacer" />
          <button onClick={() => setHelp(true)} title="How to steer how your voice says a line, with samples to listen to">🎚 How to direct your voice</button>
          <button onClick={onClose} title="Close (Esc)">✕</button>
        </div>
        <section>
          <h4>My avatars</h4>
          <div className="me-avatars">
            {list.avatars.map((a) => {
              const inUse = a.id === list.current;
              return (
                <div key={a.id} className={`me-avatar ${inUse ? 'in-use' : ''}`}>
                  <img src={`/uploads/${a.photo}`} alt={a.name} />
                  <input className="me-name" defaultValue={a.name} onBlur={(e) => e.target.value !== a.name && void rename(a.id, e.target.value)} title="Its name" />
                  <span className="muted">{voiceSummary(a.voice)}</span>
                  <div className="row">
                    {inUse ? <span className="me-badge">in use</span> : <button className="primary" onClick={() => void use(a.id)} title="Use this avatar and its voice from now on">Use</button>}
                    {list.avatars.length > 1 && <button className="small" onClick={() => void remove(a)} title="Remove this avatar">✕</button>}
                  </div>
                </div>
              );
            })}
            <button className="me-add" onClick={() => void add()} disabled={!list.avatars.length} title="A copy of the avatar in use, to give its own look and voice">＋ New avatar</button>
          </div>
          {!list.avatars.length && <p className="muted">No avatar yet: give the first one a picture below (Look), and record your voice (Voice).</p>}
          {error && <p className="note-text">{error}</p>}
        </section>
        <div className="me-tabs" role="tablist">
          <button role="tab" aria-selected={part === 'look'} className={part === 'look' ? 'on' : ''} onClick={() => setPart('look')}>🧑 Look</button>
          <button role="tab" aria-selected={part === 'voice'} className={part === 'voice' ? 'on' : ''} onClick={() => setPart('voice')}>🎙 Voice</button>
          <span className="muted">of {list.avatars.find((a) => a.id === list.current)?.name ?? 'the avatar in use'}</span>
        </div>
        {help && <VoiceDirections onClose={() => setHelp(false)} />}
        {part === 'look' ? <MyAvatar key={`look-${version}`} embedded version={version} onClose={onClose} /> : <MyVoice key={`voice-${version}`} embedded onClose={onClose} />}
      </div>
    </div>
  );
}
