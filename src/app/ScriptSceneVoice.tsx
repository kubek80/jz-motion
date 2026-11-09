import { useEffect, useRef, useState } from 'react';
import { clones, useVoicer, VOICERS } from './settingsStore';

// Beside a scene on the Script page: its voice clip (play it), and Generate / Generate again, which says the scene's
// notes in the voice in use (🎙 Me) as one clip in place of the scene's clip and moves what follows by the difference
// (server/sceneVoice.ts). Directions in brackets in the notes ([emphasis], [warmer, slower]) steer how it is said.

export interface SceneClip { id: string; scene?: string; upload: string; offset: number; trimStart: number; trimEnd: number; name?: string; avatar?: unknown }

interface Props {
  presentationId: string;
  sceneId: string;
  clips: SceneClip[];
  hasNotes: boolean;
  /** The presentation as saved (with its voice-over), for the server to change. */
  doc: unknown;
  onDoc: (next: unknown) => void;
  /** After generating: the sentences' new lengths are worth loading. */
  onVoiced?: () => void;
}

const fmt = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${s.toFixed(1)} s`);

export function ScriptSceneVoice({ presentationId, sceneId, clips, hasNotes, doc, onDoc, onVoiced }: Props) {
  const voicer = useVoicer();
  const pieces = [...clips].sort((a, b) => a.offset - b.offset);
  const length = pieces.reduce((s, c) => s + c.trimEnd - c.trimStart, 0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const player = usePieces(pieces);
  const voiceName = (VOICERS.find((x) => x.baseURL === voicer.baseURL && x.model === voicer.model)?.label ?? voicer.model).replace(/^OpenRouter · /, '').replace(/[;(].*$/, '').trim();

  const generate = async () => {
    if (!voicer.apiKey) { setError(`No key for ${voicer.baseURL}: add it in Settings → Voice generation.`); return; }
    player.stop();
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch('/api/voice/scene', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ presentation: doc, presentationId, scene: sceneId, fresh: true, voice: voicer.voice, model: voicer.model, baseURL: voicer.baseURL, apiKey: voicer.apiKey, instructions: voicer.instructions, sample: clones(voicer) ? voicer.sample : undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? res.statusText);
      onDoc(j.presentation);
      onVoiced?.();
      setNote(j.avatar ? `${j.note}. Its avatar said the old words: make it again in Timing (right-click the clip).` : j.note);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="script-voice">
      <div className="script-voice-head">
        <span className="muted">Voice</span>
        {pieces.length > 0 && <span className="muted script-voice-len">{fmt(length)}</span>}
      </div>
      {pieces.length ? (
        <div className="script-voice-player">
          <button className="small" onClick={player.toggle} title={player.playing ? 'Stop' : 'Play the scene’s voice'}>{player.playing ? '■' : '▶'}</button>
          <div className="script-voice-bar" onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); player.seek(((e.clientX - r.left) / r.width) * length); }}>
            <div style={{ width: `${length ? (player.at / length) * 100 : 0}%` }} />
          </div>
        </div>
      ) : (
        <p className="muted hint">{hasNotes ? 'No voice yet.' : 'No notes to say yet.'}</p>
      )}
      <button onClick={() => void generate()} disabled={busy || !hasNotes} title={`The scene’s notes said in ${voiceName} (a new reading of every line), in place of its clip; what follows moves by the difference`}>
        {busy ? 'Generating…' : pieces.length ? '✨ Generate again' : '✨ Generate'}
      </button>
      {busy && <p className="muted hint">About half a minute.</p>}
      {note && !busy && <p className="muted hint">{note}</p>}
      {error && <p className="note-text">{error}</p>}
    </aside>
  );
}

/** Plays a scene's clip pieces one after another; `at`: seconds into them. */
function usePieces(pieces: SceneClip[]) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const state = useRef({ index: 0, before: 0 });
  const key = pieces.map((p) => `${p.upload}@${p.trimStart}-${p.trimEnd}`).join('|');

  const stop = () => { audio.current?.pause(); setPlaying(false); };
  useEffect(() => { stop(); setAt(0); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => audio.current?.pause(), []);

  const playFrom = (t: number) => {
    let before = 0, index = 0;
    while (index < pieces.length - 1 && t >= before + pieces[index].trimEnd - pieces[index].trimStart) { before += pieces[index].trimEnd - pieces[index].trimStart; index++; }
    const p = pieces[index];
    if (!p) return;
    state.current = { index, before };
    const a = audio.current ?? (audio.current = new Audio());
    a.ontimeupdate = () => {
      const c = pieces[state.current.index];
      if (!c) return;
      setAt(state.current.before + Math.max(0, a.currentTime - c.trimStart));
      if (a.currentTime >= c.trimEnd - 0.02) next();
    };
    a.onended = () => next();
    const next = () => {
      const c = pieces[state.current.index];
      const nb = state.current.before + c.trimEnd - c.trimStart;
      if (state.current.index + 1 < pieces.length) playFrom(nb + 1e-3);
      else { a.pause(); setPlaying(false); setAt(0); }
    };
    const src = `/uploads/${p.upload}`;
    if (!a.src.endsWith(src)) a.src = src;
    a.currentTime = p.trimStart + Math.max(0, t - before);
    void a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  return {
    playing, at, stop,
    toggle: () => (playing ? stop() : playFrom(at)),
    seek: (t: number) => { setAt(t); if (playing) playFrom(t); },
  };
}
