import { useEffect, useRef, useState } from 'react';
import { clones, useVoicer } from './settingsStore';
import { splitDirections, voiceKey } from './tts';
import { DIRECTION_SAMPLES } from './directionSampleList';

// "How to direct your voice": what directions in [brackets] in the speaker notes do, with the same sentence said
// plainly and with different directions to listen to (made in the voice in use: server/directionSamples.ts).
// Opened from 🧑 Avatar and the Script page.

type List = { voice: string; samples: { id: string; upload: string; duration: number }[] };

/** The sentence with its direction picked out. */
const Line = ({ text }: { text: string }) => (
  <>{splitDirections(text).map(({ part, direction }, i) => (direction ? <span key={i} className="script-direction">{part}</span> : part))}</>
);

export function VoiceDirections({ onClose }: { onClose: () => void }) {
  const voicer = useVoicer();
  const [list, setList] = useState<List | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { void fetch('/api/voice/direction-samples').then((r) => r.json()).then(setList).catch(() => setList({ voice: '', samples: [] })); }, []);
  useEffect(() => {
    // Esc closes this window only (it sits on top of another).
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); audio.current?.pause(); };
  }, [onClose]);

  const play = (id: string) => {
    const s = list?.samples.find((x) => x.id === id);
    if (!s) return;
    const a = audio.current ?? (audio.current = new Audio());
    if (playing === id) { a.pause(); setPlaying(null); return; }
    a.src = `/uploads/${s.upload}?v=${s.duration}`;
    a.onended = () => setPlaying(null);
    void a.play().then(() => setPlaying(id)).catch(() => setPlaying(null));
  };

  const inUse = voiceKey(voicer);
  const sameVoice = !!list?.voice && list.voice === inUse;
  const make = async () => {
    if (!voicer.apiKey) { setError(`No key for ${voicer.baseURL}: add it in Settings → Voice generation.`); return; }
    audio.current?.pause();
    setPlaying(null);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/voice/direction-samples', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ voice: voicer.voice, model: voicer.model, baseURL: voicer.baseURL, apiKey: voicer.apiKey, instructions: voicer.instructions, sample: clones(voicer) ? voicer.sample : undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? res.statusText);
      setList(j);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-back voice-directions-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide voice-directions">
        <div className="modal-head">
          <h2>How to direct your voice</h2>
          <span className="muted">directions in [brackets] in the speaker notes</span>
          <span className="spacer" />
          <button onClick={onClose} title="Close (Esc)">✕</button>
        </div>
        <section>
          <p>When a line comes out flat or stressed oddly, write how it should sound in square brackets in the notes, then <b>✨ Generate again</b> (Script page, or the clip’s window in Timing).</p>
          <ul className="voice-directions-rules">
            <li><b>Say more, and stronger:</b> one mild word (<code>[excited]</code>) changes little; <code>[very excited, shouting with joy]</code> changes a lot. Up to three things at once: <code>[sad, disappointed, slow]</code>.</li>
            <li><b>Where it starts:</b> a direction changes what follows it. Before one word for just that word (<code>on [strong emphasis] Friday</code>), at the start for the sentence.</li>
            <li><b>Pauses</b> with round brackets, where you want them: <code>(break)</code>, <code>(long-break)</code> (about a second), <code>(breath)</code>.</li>
            <li><b>Short sentences</b> show it best: in a long one the effect spreads thin. Split a line to direct part of it.</li>
            <li>Directions are <b>not read out</b> and never show in the prompter. Only your cloned voice (Fish Audio) follows them; other voices never get them. Each reading differs a little: <b>✨ Generate again</b> if one misses.</li>
          </ul>
        </section>
        <section>
          <h4>Listen: the same short sentence, directed differently</h4>
          {list && !list.samples.length && <p className="muted">No samples yet: make them below, in the voice in use.</p>}
          <ol className="voice-directions-samples">
            {DIRECTION_SAMPLES.map((s) => {
              const made = list?.samples.find((x) => x.id === s.id);
              return (
                <li key={s.id} className={playing === s.id ? 'playing' : ''}>
                  <button className="small" onClick={() => play(s.id)} disabled={!made || busy} title={playing === s.id ? 'Stop' : 'Listen'}>{playing === s.id ? '■' : '▶'}</button>
                  <div>
                    <b>{s.label}</b>{made && <span className="muted"> · {made.duration.toFixed(1)} s</span>}
                    <div className="voice-directions-line"><Line text={s.text} /></div>
                    <div className="muted hint">{s.tip}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
        <div className="row wrap">
          <button onClick={() => void make()} disabled={busy} title="Say every sample again in the voice in use (about 1¢)">{busy ? 'Making them (about a minute)…' : list?.samples.length ? '↻ Make these again in the voice in use' : '✨ Make them in the voice in use'}</button>
          <span className="muted">{!list?.samples.length ? '' : sameVoice ? 'Said in the voice in use.' : 'Said in another voice than the one in use.'}</span>
        </div>
        {error && <p className="note-text">{error}</p>}
      </div>
    </div>
  );
}
