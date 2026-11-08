import { useEffect, useState } from 'react';
import type { Clip } from '../../engine/schema';
import type { RawBeat } from '../editor/doc';
import type { Click } from '../../video/performance';
import { splitSentences } from '../tts';
import { fmt } from './format';
import { MicCheck, LevelMeter, advice } from './MicCheck';
import { micDevice } from './micDevice';
import { clones, loadVoicer, saveVoicer, VOICERS } from '../settingsStore';
import { useMicLevel } from './useMicLevel';
import { beatsIn, replaceTake, useRerecord } from './useRerecord';

// One voice clip in detail (double-click it on the timeline): how loud it is and its volume, everything you can
// do with it, a microphone check, and recording it again with its lines as a prompter.

interface Props {
  clip: Clip;
  index: number;
  clips: Clip[];
  clicks: Click[];
  beatOf: (c: Click) => RawBeat | undefined;
  missing: boolean;
  setClips: (next: Clip[]) => void;
  onCues: (changes: { scene: number; beat: number; cue: number | undefined }[]) => void;
  playFrom: (t: number) => void;
  pause: () => void;
  onClean: (i: number) => void;
  onRestore: (i: number) => void;
  onTranscribe: (i: number) => void;
  setClipLane: (i: number, lane: 0 | 1) => void;
  deleteClip: (i: number) => void;
  onClose: () => void;
}

interface Loudness { lufs: number | null; peak: number | null; target: number }

function verdict(lufs: number | null, target: number) {
  if (lufs === null) return { text: 'Silent', tone: 'low' };
  const d = lufs - target;
  if (d < -6) return { text: `Quiet: ${Math.round(-d)} dB under the level of the video`, tone: 'warn' };
  if (d > 4) return { text: `Loud: ${Math.round(d)} dB over the level of the video`, tone: 'warn' };
  return { text: 'About right', tone: 'good' };
}

export function ClipDetail(p: Props) {
  const { clip: c, index } = p;
  const len = c.trimEnd - c.trimStart;
  const [loud, setLoud] = useState<Loudness | null>(null);
  const [loudError, setLoudError] = useState<string | null>(null);
  const [name, setName] = useState(c.name ?? '');
  const [micOpen, setMicOpen] = useState(false);
  const [device, setDevice] = useState(micDevice());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<Clip>) => p.setClips(p.clips.map((x, i) => (i === index ? { ...x, ...patch } : x)));

  useEffect(() => {
    if (p.missing) return;
    setLoud(null);
    fetch(`/api/uploads/${c.upload}/loudness?start=${c.trimStart}&end=${c.trimEnd}`)
      .then(async (r) => (r.ok ? setLoud(await r.json()) : setLoudError((await r.json().catch(() => ({}))).error ?? r.statusText)))
      .catch((e) => setLoudError(String(e)));
  }, [c.upload, c.trimStart, c.trimEnd, p.missing]);
  useEffect(() => p.pause(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [wantRecord, setWantRecord] = useState(false);
  const [recordingOn, setRecordingOn] = useState(false);
  const mic = useMicLevel(micOpen || wantRecord || recordingOn, device);
  const rerecord = useRerecord(mic.stream);
  const t = rerecord.take;
  // "Record again" opens the microphone first, then starts as soon as it is there.
  useEffect(() => {
    if (wantRecord && mic.stream) { setWantRecord(false); rerecord.start(); }
  }, [wantRecord, mic.stream]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setRecordingOn(t.state === 'recording'), [t.state]);

  const gain = c.gain ?? 0;
  const heard = loud?.lufs !== null && loud?.lufs !== undefined ? loud.lufs + gain : null;
  const v = loud ? verdict(heard, loud.target) : null;
  const evenOut = () => {
    if (!loud?.lufs) return;
    const room = loud.peak !== null ? -1 - loud.peak : 24;
    const g = Math.max(-24, Math.min(24, room, Math.round((loud.target - loud.lufs) * 2) / 2));
    update({ gain: g || undefined });
  };

  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const takeAsMyVoice = () => {
    const v = loadVoicer();
    const sample = { upload: c.upload, start: c.trimStart, end: Math.min(c.trimEnd, c.trimStart + 30), name: c.name };
    const clone = VOICERS.find((x) => x.clones)!;
    const next = clones(v) ? { ...v, sample } : { ...v, baseURL: clone.baseURL, model: clone.model, sample };
    saveVoicer(next);
    const model = VOICERS.find((x) => x.baseURL === next.baseURL && x.model === next.model)?.label ?? next.model;
    setVoiceNote(`Generated voice now copies your voice from this clip (${(sample.end - sample.start).toFixed(0)} s, ${model}).${len < 10 ? ' A clip of 10–30 s copies it more closely.' : ''} Lines already generated in another voice stay until you generate again; Settings → Voice generation to change it. It uses your OpenRouter key there.`);
  };

  const inside = beatsIn(c, p.clicks);
  const marks = t.state === 'recording' || t.state === 'review' ? t.marks : [];
  const current = Math.min(marks.length, Math.max(0, inside.length - 1));

  const keep = async () => {
    if (t.state !== 'review') return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/uploads?ext=webm', { method: 'POST', body: t.blob });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
      const { upload } = await res.json();
      const r = replaceTake(p.clips, index, upload, t.duration, t.marks, p.clicks);
      p.setClips(r.clips);
      if (r.cues.length) p.onCues(r.cues);
      rerecord.discard();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Keys while recording: → next line, ← back, Space or Esc stops.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (t.state === 'recording') {
        if (['ArrowRight', 'ArrowDown', 'PageDown', 'Enter'].includes(e.key)) rerecord.mark();
        else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) rerecord.unmark();
        else if (e.key === ' ' || e.key === 'Escape') void rerecord.stop();
        else return;
      } else if (e.key === 'Escape') p.onClose();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [t.state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="modal-back clip-detail-back" onPointerDown={(e) => e.target === e.currentTarget && t.state !== 'recording' && p.onClose()}>
      <div className="modal wide clip-detail">
        <div className="modal-head">
          <input className="clip-name-input" value={name} placeholder={`clip ${index + 1}`} onChange={(e) => setName(e.target.value)} onBlur={() => name !== (c.name ?? '') && update({ name: name || undefined })} title="The clip's name" />
          <span className="muted">lane {c.lane + 1} · {fmt(c.offset)} → {fmt(c.offset + len)} · {len.toFixed(1)} s{c.cleanedFrom ? ' · ✨ cleaned' : ''}{c.gain ? ` · ${c.gain > 0 ? '+' : ''}${c.gain} dB` : ''}</span>
          <span className="spacer" />
          <button onClick={p.onClose} title="Close (Esc)">✕</button>
        </div>

        {p.missing && <p className="note-text">The recording {c.upload} isn't on this computer: it can be recorded again below, or removed.</p>}

        <section>
          <h4>Volume</h4>
          {loudError ? <p className="note-text">Could not measure it: {loudError}</p> : !loud ? <p className="muted">{p.missing ? '—' : 'Measuring…'}</p> : (
            <>
              <div className={`loudness ${v!.tone}`}>
                <b>{heard === null ? '—' : `${heard.toFixed(1)} LUFS`}</b>
                <span>{v!.text}{loud.peak !== null && loud.peak + gain > -1 ? ' · its loudest moments may distort' : ''}</span>
              </div>
              <p className="muted hint">The video evens out its overall volume to {loud.target} LUFS; set each clip near it so one doesn't stand out from the others. Loudest moment: {loud.peak === null ? '—' : `${(loud.peak + gain).toFixed(1)} dB`}.</p>
              <div className="row">
                <label className="gain">volume <input type="range" min={-12} max={12} step={0.5} value={gain} onChange={(e) => update({ gain: Number(e.target.value) || undefined })} /> <b>{gain > 0 ? '+' : ''}{gain} dB</b></label>
                <button onClick={evenOut} disabled={loud.lufs === null} title="Set the volume so this clip sits at the level of the video (without distorting)">Even it out</button>
                {!!c.gain && <button onClick={() => update({ gain: undefined })}>As recorded</button>}
              </div>
            </>
          )}
        </section>

        <section>
          <h4>This clip</h4>
          <div className="row wrap">
            <button onClick={() => p.playFrom(c.offset)} disabled={p.missing}>▶ Play</button>
            {c.cleanedFrom
              ? <button onClick={() => p.onRestore(index)} title="Use the recording as it was, with its background noise">↺ Back to the original recording</button>
              : <button onClick={() => p.onClean(index)} disabled={p.missing} title="Remove background noise (fan, hum, room, keyboard) with RNNoise, on this computer; the original is kept">✨ Clean up voice</button>}
            <button onClick={() => p.onTranscribe(index)} disabled={p.missing}>✎ Transcribe…</button>
            <button onClick={takeAsMyVoice} disabled={p.missing} title="Generated voice will copy your voice from this clip (a cloning model through OpenRouter). Transcribe the clip first for a closer copy.">🎙 Use as my voice</button>
            <button onClick={() => p.setClipLane(index, c.lane === 0 ? 1 : 0)}>{c.lane === 0 ? '↓ Move to the lower lane' : '↑ Move to the upper lane'}</button>
            <button className="danger" onClick={() => { p.deleteClip(index); p.onClose(); }} title="Takes the clip off the timeline; the recording file stays">✕ Remove clip</button>
          </div>
          {voiceNote && <p className="muted hint">{voiceNote}</p>}
        </section>

        <section>
          <h4><button className={`fold ${micOpen ? 'open' : ''}`} onClick={() => setMicOpen(!micOpen)} aria-expanded={micOpen}>Check the microphone</button></h4>
          {micOpen && <MicCheck mic={mic} onDevice={setDevice} />}
        </section>

        <section className="rerecord">
          <h4>Record it again</h4>
          {t.state === 'recording' && <LevelMeter mic={mic} />}
          <div className="row">
            {t.state === 'idle' && <button className="rec-btn" onClick={() => setWantRecord(true)} disabled={wantRecord} title="Record this clip again with the microphone above; → when you start each next line">● Record again</button>}
            {t.state === 'recording' && <>
              <button className="rec-btn on" onClick={() => void rerecord.stop()}>■ Stop</button>
              <span className="muted">{t.elapsed.toFixed(1)} s of {len.toFixed(1)} s · <b>→</b> next line · <b>←</b> back · <b>Space</b> stop{mic.clipped ? ' · ⚠ it distorts: turn the gain down' : ''}</span>
            </>}
            {t.state === 'review' && <>
              <audio controls src={t.url} />
              <button className="primary" onClick={() => void keep()} disabled={saving}>{saving ? 'Saving…' : 'Use this take'}</button>
              <button onClick={rerecord.discard} disabled={saving}>Discard</button>
              <span className="muted">{t.duration.toFixed(1)} s ({t.duration - len >= 0 ? '+' : ''}{(t.duration - len).toFixed(1)} s): {Math.abs(t.duration - len) < 0.05 ? 'same length' : `everything after this clip moves ${t.duration > len ? 'later' : 'earlier'}`}{inside.length > 1 ? (t.marks.length ? `; its beats go where you pressed →` : '; its beats are spread over the new length') : ''}</span>
            </>}
          </div>
          <ol className="rerecord-lines">
            {inside.map((ck, k) => {
              const b = p.beatOf(ck);
              return (
                <li key={`${ck.scene}.${ck.beat}`} ref={(el) => { if (el && t.state === 'recording' && k === current) el.scrollIntoView({ block: 'nearest' }); }} className={t.state === 'recording' && k === current ? 'now' : t.state === 'recording' && k < current ? 'done' : ''}>
                  <small>{ck.scene + 1}.{ck.beat + 1} {b?.title ?? ''}</small>
                  {splitSentences(b?.notes).map((s, j) => <p key={j}>{s}</p>)}
                </li>
              );
            })}
            {!inside.length && <li className="muted">No beat starts inside this clip; record what it should say.</li>}
          </ol>
          {error && <p className="note-text">{error}</p>}
          {t.state === 'idle' && mic.peak > -60 && <p className={`mic-advice ${advice(mic.peak, mic.clipped).tone}`}>{advice(mic.peak, mic.clipped).text}</p>}
        </section>
      </div>
    </div>
  );
}
