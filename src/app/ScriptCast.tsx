import { useEffect, useState } from 'react';

// Who speaks in a presentation (a podcast: you and your guests), on the Script page: the cast, each person one of
// your avatars (the Avatar window: their look and their voice), and a label on each beat saying who says it.

export interface CastMember { id: string; name: string; avatar: string }
type AvatarInfo = { id: string; name: string; photo: string };
type CastDoc = { cast?: CastMember[]; scenes: { id: string; speaker?: string; beats?: { speaker?: string }[] }[] };

/** Each person's colour, by their place in the cast. */
export const speakerColor = (cast: CastMember[] | undefined, id: string | undefined) => ['#56d4dd', '#f2cc60', '#ff7eb6', '#7ee787', '#d2a8ff'][Math.max(0, cast?.findIndex((c) => c.id === id) ?? 0) % 5];

/** The cast bar: the people, rename or remove one, add one from your avatars. */
export function CastBar({ doc, onDoc }: { doc: CastDoc; onDoc: (next: unknown) => void }) {
  const [avatars, setAvatars] = useState<AvatarInfo[]>([]);
  useEffect(() => { void fetch('/api/me').then((r) => r.json()).then((j) => setAvatars(j.avatars ?? [])).catch(() => undefined); }, []);
  const cast = doc.cast ?? [];
  const set = (next: CastMember[]) => {
    const ids = new Set(next.map((c) => c.id));
    // Someone removed: their beats and scenes go back to the first in the cast (or to no one, with nobody left).
    const fix = <T extends { speaker?: string }>(x: T): T => { if (!x.speaker || ids.has(x.speaker)) return x; const { speaker: _s, ...rest } = x; return rest as T; };
    onDoc({ ...doc, ...(next.length ? { cast: next } : { cast: undefined }), scenes: doc.scenes.map((s) => ({ ...fix(s), ...(s.beats ? { beats: s.beats.map(fix) } : {}) })) });
  };
  const add = (avatarId: string) => {
    const a = avatars.find((x) => x.id === avatarId);
    if (!a) return;
    const base = a.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'speaker';
    let id = /^[a-z]/.test(base) ? base : `p-${base}`;
    for (let n = 2; cast.some((c) => c.id === id); n++) id = `${base}-${n}`;
    set([...cast, { id, name: a.name.split(/[\s(]/)[0] || a.name, avatar: a.id }]);
  };
  return (
    <div className="cast-bar">
      <span className="muted">Cast</span>
      {!cast.length && <span className="muted hint">just you (your avatar in use). Add people for a podcast: each is one of your avatars, with its look and voice.</span>}
      {cast.map((c, i) => {
        const a = avatars.find((x) => x.id === c.avatar);
        return (
          <span key={c.id} className="cast-person" style={{ borderColor: speakerColor(cast, c.id) }} title={`${c.name}: speaks with the avatar “${a?.name ?? c.avatar}” (its look and voice)${i === 0 ? '; says every beat that names no one' : ''}`}>
            {a?.photo && <img src={`/uploads/${a.photo}`} alt="" />}
            <input value={c.name} onChange={(e) => set(cast.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))} aria-label="Name" />
            <select value={c.avatar} onChange={(e) => set(cast.map((x) => (x.id === c.id ? { ...x, avatar: e.target.value } : x)))} title="Their avatar (look and voice)">
              {!a && <option value={c.avatar}>{c.avatar} (missing)</option>}
              {avatars.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <button className="small" onClick={() => set(cast.filter((x) => x.id !== c.id))} title={`Remove ${c.name} from the cast (their beats go to ${cast.find((x) => x.id !== c.id)?.name ?? 'no one'})`}>✕</button>
          </span>
        );
      })}
      <select value="" onChange={(e) => add(e.target.value)} title="Add someone: one of your avatars (make a guest's in 🧑 Avatar)">
        <option value="">＋ Add a person…</option>
        {avatars.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </div>
  );
}

/** A beat's speaker, as a coloured label that changes it. */
export function SpeakerLabel({ cast, speaker, own, onChange }: { cast: CastMember[]; speaker?: string; own?: string; onChange: (id: string | undefined) => void }) {
  const who = cast.find((c) => c.id === speaker);
  return (
    <select className={`speaker-label${own ? '' : ' inherited'}`} style={{ color: speakerColor(cast, speaker), borderColor: speakerColor(cast, speaker) }} value={own ?? ''} onChange={(e) => onChange(e.target.value || undefined)}
      title={own ? 'Who says this beat' : 'Who says this beat (from the scene or the first in the cast); choose someone for this beat alone'}>
      <option value="">{who ? `${who.name} (scene)` : '—'}</option>
      {cast.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}
