import { useEffect, useState } from 'react';
import { ACCENTS, clones, keepVoiceInProject, projectVoice, saveVoicer, useVoicer, VOICERS, type Voicer } from './settingsStore';
import { requestTts } from './tts';
import { MicCheck, LevelMeter } from './timing/MicCheck';
import { micDevice } from './timing/micDevice';
import { useMicLevel } from './timing/useMicLevel';
import { useRerecord } from './timing/useRerecord';

// "My voice": the sample a cloning model copies your voice from. See and hear the one in use, record a new one
// reading a suggested text (with the microphone check), choose the model, and hear a sentence in your voice.

/** About 30 seconds read at a calm narration pace: questions, numbers, a list, short and long sentences. */
export const SAMPLE_TEXT = `Hi, I'm Jakub. I make short explainer videos about software, drawn on a dark board with glowing markers.

Each one starts with a single sentence. Then I sketch the idea, point at the parts that matter, and talk you through it, step by step.

Some topics take two minutes; others need ten. Does that sound simple? Mostly, yes. The tricky part is choosing what to leave out, and that's exactly what I'd like to show you today.`;

const CLONERS = VOICERS.filter((v) => v.clones);

export function MyVoice({ onClose }: { onClose: () => void }) {
  const voicer = useVoicer();
  const [text, setText] = useState(SAMPLE_TEXT);
  const [device, setDevice] = useState(micDevice());
  // The microphone test is on while the window is open (it can be switched off).
  const [micOpen, setMicOpen] = useState(true);
  const [want, setWant] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trial, setTrial] = useState('This is my own voice, copied from a short sample. Does it sound like me?');
  const [heard, setHeard] = useState<string | null>(null);
  // `want` keeps the microphone open from the click until the take is ready to hear (it must not close mid-take).
  const mic = useMicLevel(micOpen || want, device);
  const take = useRerecord(mic.stream);
  const t = take.take;
  useEffect(() => { if (want && mic.stream && t.state === 'idle') take.start(); }, [want, mic.stream]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (t.state === 'review') setWant(false); }, [t.state]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (t.state === 'recording' && (e.key === ' ' || e.key === 'Escape')) { e.preventDefault(); e.stopPropagation(); void take.stop(); }
      else if (t.state !== 'recording' && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [t.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = voicer.sample;
  // Whether the sample in use is the one kept with the project (in git).
  const [inProject, setInProject] = useState<boolean | null>(null);
  useEffect(() => {
    void projectVoice().then((v) => setInProject(!!v && !!s && v.sample.upload === s.upload && v.sample.start === s.start && v.sample.end === s.end && v.model === voicer.model));
  }, [s?.upload, s?.start, s?.end, voicer.model]); // eslint-disable-line react-hooks/exhaustive-deps
  const keepInProject = async () => {
    setBusy('Saving it in the project…');
    setError(null);
    try { await keepVoiceInProject(voicer); setInProject(true); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const set = (next: Voicer) => saveVoicer(next);
  // The accent is the speaking style sent with each line; with your voice kept in the project, it goes there too.
  const accent = ACCENTS.find((a) => (a.instructions ?? '') === (voicer.instructions ?? ''))?.label ?? 'custom';
  const setAccent = async (label: string) => {
    const a = ACCENTS.find((x) => x.label === label);
    if (!a) return;
    const next = { ...voicer, instructions: a.instructions };
    set(next);
    if (inProject) await keepVoiceInProject(next).catch((e) => setError((e as Error).message));
  };
  const cloner = clones(voicer) ? voicer : { ...voicer, baseURL: CLONERS[0].baseURL, model: CLONERS[0].model };

  const keep = async () => {
    if (t.state !== 'review') return;
    setBusy('Saving the sample…');
    setError(null);
    try {
      const res = await fetch('/api/uploads?ext=webm', { method: 'POST', body: t.blob });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
      const { upload } = await res.json();
      await keepVoiceInProject({ ...cloner, sample: { upload, start: 0, end: Math.min(t.duration, 30), name: `my voice sample · ${new Date().toLocaleDateString()}`, text: t.duration >= 15 && t.duration <= 31 ? text : undefined } });
      setInProject(true);
      take.discard();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const hear = async () => {
    setBusy('Making it in your voice…');
    setError(null);
    try {
      const r = await requestTts('my-voice', trial, voicer);
      setHeard(`/tts/my-voice/${r.audio}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="modal-back my-voice-back" onPointerDown={(e) => e.target === e.currentTarget && t.state !== 'recording' && onClose()}>
      <div className="modal wide my-voice">
        <div className="modal-head">
          <h2>My voice</h2>
          <span className="muted">what generated speech copies, for prompter timings and new scenes</span>
          <span className="spacer" />
          <button onClick={onClose} title="Close (Esc)">✕</button>
        </div>

        <section>
          <h4>The sample in use</h4>
          {s ? (
            <div className="row wrap">
              <b>{s.name ?? s.upload}</b>
              <span className="muted">{(s.end - s.start).toFixed(0)} s{s.text ? ' · read from the text below' : ''}</span>
              <audio controls src={`/uploads/${s.upload}#t=${s.start},${s.end}`} />
              <button onClick={() => set({ ...voicer, sample: undefined })}>Stop using it</button>
            </div>
          ) : null}
          {s && clones(voicer) ? (
            inProject
              ? <p className="muted hint">Kept with the project: <code>voice/my-voice.json</code> and <code>uploads/{s.upload}</code>. Commit and push them, and it works on your other computers (and for Claude working in the repository).</p>
              : <div className="row"><button onClick={() => void keepInProject()} disabled={!!busy} title="Keep the sample and these settings in the project (git), never the key">💾 Save in the project</button><span className="muted">so it works on your other computers, and for Claude in the repository</span></div>
          ) : null}
          {!s && <p className="muted">None yet: record one below.</p>}
          <label className="field">
            <span>copied by</span>
            <select value={clones(voicer) ? voicer.model : ''} onChange={(e) => { const v = CLONERS.find((x) => x.model === e.target.value); if (v) set({ ...voicer, baseURL: v.baseURL, model: v.model }); }}>
              {!clones(voicer) && <option value="">— not a cloning model now ({voicer.model}) —</option>}
              {CLONERS.map((v) => <option key={v.model} value={v.model}>{v.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>accent</span>
            <select value={accent} onChange={(e) => void setAccent(e.target.value)} title="How your cloned voice speaks; lines already generated keep theirs until generated again">
              {accent === 'custom' && <option value="custom">Your own style (Settings → how to speak)</option>}
              {ACCENTS.map((a) => <option key={a.label} value={a.label}>{a.label}</option>)}
            </select>
          </label>
          {!clones(voicer) && s && <p className="note-text">Generated speech uses another voice now; choose a model above to use yours.</p>}
        </section>

        <section className="mic-section">
          <div className="row">
            <h4>Microphone</h4>
            <span className="spacer" />
            <button onClick={() => setMicOpen(!micOpen)} disabled={t.state === 'recording'} title={micOpen ? 'Stop listening to the microphone' : 'Listen to the microphone: its level, live'}>
              {micOpen ? 'Stop the test' : '🎙 Test the microphone'}
            </button>
          </div>
          {micOpen ? <MicCheck mic={mic} onDevice={setDevice} /> : <p className="muted">Off. Test it before recording: pick the microphone, speak, and turn the gain on your device until your peaks sit in the green.</p>}
        </section>

        <section>
          <h4>Record a new sample</h4>
          <p className="muted hint">Read this the way you narrate: same microphone, same distance, a quiet room, no music. About 30 seconds; change the words if you like. A clear, natural reading copies best.</p>
          <textarea className="sample-text" rows={7} value={text} onChange={(e) => setText(e.target.value)} disabled={t.state === 'recording'} />
          {t.state === 'recording' && <LevelMeter mic={mic} />}
          <div className="row">
            {t.state === 'idle' && <button className="rec-btn" onClick={() => setWant(true)} disabled={want}>{want ? 'Opening the microphone…' : '● Record the sample'}</button>}
            {t.state === 'recording' && <>
              <button className="rec-btn on" onClick={() => void take.stop()}>■ Stop</button>
              <span className="muted">{t.elapsed.toFixed(1)} s · Space stops{mic.clipped ? ' · ⚠ it distorts: turn the gain down' : ''}</span>
            </>}
            {t.state === 'review' && <>
              <audio controls src={t.url} />
              <button className="primary" onClick={() => void keep()} disabled={!!busy}>Use as my voice</button>
              <button onClick={take.discard}>Discard</button>
              <span className="muted">{t.duration.toFixed(1)} s{t.duration < 10 ? ' · short: 20–30 s copies better' : t.duration > 31 ? ' · the first 30 s are used' : ''}</span>
            </>}
          </div>
        </section>

        <section>
          <h4>Hear it</h4>
          <div className="row">
            <input className="grow" value={trial} onChange={(e) => setTrial(e.target.value)} />
            <button onClick={() => void hear()} disabled={!!busy || !trial.trim() || (clones(voicer) && !s)}>▶ Say it in my voice</button>
          </div>
          {heard && <audio controls autoPlay src={heard} />}
        </section>
        {busy && <p className="muted">{busy}</p>}
        {error && <p className="note-text">{error}</p>}
        <p className="muted hint">It uses the OpenRouter key in Settings → Voice generation (about 1.5¢ per 1,000 characters). The sample stays on this computer and is sent with each line to the model you chose.</p>
      </div>
    </div>
  );
}
