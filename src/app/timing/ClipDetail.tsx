import { useEffect, useState } from 'react';
import type { Clip } from '../../engine/schema';
import type { RawBeat } from '../editor/doc';
import type { Click } from '../../video/performance';
import { splitSentences } from '../tts';
import { fmt } from './format';
import { MicCheck, LevelMeter, advice } from './MicCheck';
import { micDevice } from './micDevice';
import { clones, useVoicer, VOICERS } from '../settingsStore';
import { useMicLevel } from './useMicLevel';
import { beatsIn, replaceTake, useRerecord } from './useRerecord';
import { ClipWave } from './ClipWave';
import { AvatarSection, startAvatar } from './AvatarSection';
import { chainOf, removeSpan } from './clipChain';

// One voice clip in detail (double-click it on the timeline): how loud it is and its volume, everything you can
// do with it, a microphone check, and recording or generating it again with its lines as a prompter.

interface Props {
  presentationId: string;
  clip: Clip;
  index: number;
  clips: Clip[];
  clicks: Click[];
  beatOf: (c: Click) => RawBeat | undefined;
  /** Every beat with a cue, scenes left out of the video included. */
  allCued: { scene: number; beat: number; t: number; cued: boolean }[];
  missing: boolean;
  /** Decoded recordings, shared with the timeline. */
  loadBuffer: (upload: string) => Promise<AudioBuffer>;
  setClips: (next: Clip[]) => void;
  /** Clips and cues together, as one change (one undo). */
  setTimeline: (next: Clip[], cues: { scene: number; beat: number; cue: number | undefined }[]) => void;
  onUndo: () => void;
  /** The clip shown was replaced (a new take): show this one. */
  onReplaced: (id: string) => void;
  playFrom: (t: number) => void;
  pause: () => void;
  onClean: (i: number) => void;
  onRestore: (i: number) => void;
  onTranscribe: (i: number) => void;
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
  // The whole recording: this clip and the pieces it was cut into.
  const chain = chainOf(p.clips, index);
  const pieces = chain.indices.map((i) => p.clips[i]);
  const len = chain.end - chain.start;
  /** The recording as one clip, from its start to its end on the timeline. */
  const whole: Clip = { ...pieces[0], offset: chain.start, trimEnd: pieces[0].trimStart + len };
  const srcFrom = Math.min(...pieces.map((x) => x.trimStart));
  const srcTo = Math.max(...pieces.map((x) => x.trimEnd));
  const [loud, setLoud] = useState<Loudness | null>(null);
  const [loudError, setLoudError] = useState<string | null>(null);
  const [name, setName] = useState(c.name ?? '');
  const [micOpen, setMicOpen] = useState(false);
  const [device, setDevice] = useState(micDevice());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<Clip>) => p.setClips(p.clips.map((x, i) => (chain.indices.includes(i) ? { ...x, ...patch } : x)));

  useEffect(() => {
    if (p.missing) return;
    setLoud(null);
    fetch(`/api/uploads/${c.upload}/loudness?start=${srcFrom}&end=${srcTo}`)
      .then(async (r) => (r.ok ? setLoud(await r.json()) : setLoudError((await r.json().catch(() => ({}))).error ?? r.statusText)))
      .catch((e) => setLoudError(String(e)));
  }, [c.upload, srcFrom, srcTo, p.missing]);
  useEffect(() => p.pause(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // "Record again" opens the microphone, starts as soon as it is there, and keeps it open until the take is ready
  // to hear (it must not close mid-take).
  const [wantRecord, setWantRecord] = useState(false);
  const mic = useMicLevel(micOpen || wantRecord, device);
  const rerecord = useRerecord(mic.stream);
  const t = rerecord.take;
  useEffect(() => {
    if (wantRecord && mic.stream && t.state === 'idle') rerecord.start();
  }, [wantRecord, mic.stream]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (t.state === 'review') setWantRecord(false); }, [t.state]);

  const gain = c.gain ?? 0;
  const heard = loud?.lufs !== null && loud?.lufs !== undefined ? loud.lufs + gain : null;
  const v = loud ? verdict(heard, loud.target) : null;
  const evenOut = () => {
    if (!loud?.lufs) return;
    const room = loud.peak !== null ? -1 - loud.peak : 24;
    const g = Math.max(-24, Math.min(24, room, Math.round((loud.target - loud.lufs) * 2) / 2));
    update({ gain: g || undefined });
  };

  const inside = beatsIn(whole, p.clicks);

  // "Generate again": the clip's lines spoken by the voice in Settings (your clone when it is set), as one new clip.
  const voicer = useVoicer();
  const voiceLabel = VOICERS.find((x) => x.baseURL === voicer.baseURL && x.model === voicer.model)?.label.split(';')[0].replace(/\((?!.*\)).*$/, (m) => `${m})`) ?? voicer.model;
  const [fresh, setFresh] = useState(true);
  const [generating, setGenerating] = useState(false);
  const cuedInside = inside.filter((ck) => ck.cued);
  const notesOf = (ck: Click) => Array.from({ length: ck.last - ck.beat + 1 }, (_, k) => p.beatOf({ ...ck, beat: ck.beat + k })?.notes ?? '').filter(Boolean).join('\n\n');
  const canGenerate = cuedInside.some((ck) => splitSentences(notesOf(ck)).length);
  const generate = async () => {
    if (!voicer.apiKey) { setError(`No key for ${voicer.baseURL}: add it in Settings → Voice generation.`); return; }
    setGenerating(true);
    setError(null);
    try {
      const parts = cuedInside.map((ck) => ({ notes: notesOf(ck), need: ck.until - ck.from }));
      const res = await fetch('/api/voice/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ presentationId: p.presentationId, name: c.scene ?? c.name ?? 'clip', parts, fresh, voice: voicer.voice, model: voicer.model, baseURL: voicer.baseURL, apiKey: voicer.apiKey, instructions: voicer.instructions, sample: clones(voicer) ? voicer.sample : undefined }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
      const g: { upload: string; duration: number; starts: number[] } = await res.json();
      const others = p.clips.filter((_, i) => !chain.indices.includes(i));
      const r = replaceTake([...others, whole], others.length, g.upload, g.duration, g.starts.slice(1), p.clicks, p.allCued);
      const made = { ...r.clips[others.length], name: `generated voice · ${(c.name ?? 'clip').replace(/^(generated voice|re-recorded) · /, '')}` };
      p.setTimeline(r.clips.map((x, i) => (i === others.length ? made : x)), r.cues);
      // An avatar saying the old words is made again for the new ones (the new clip's window picks it up).
      if (c.avatar) await startAvatar(made.id, { upload: g.upload, trimStart: 0, trimEnd: g.duration, name: c.scene ?? c.name }).catch((e) => setError(`Avatar: ${(e as Error).message}`));
      p.onReplaced(made.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };
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
      // The whole recording (all its pieces) gives way to the new take.
      const others = p.clips.filter((_, i) => !chain.indices.includes(i));
      const r = replaceTake([...others, whole], others.length, upload, t.duration, t.marks, p.clicks, p.allCued);
      p.setTimeline(r.clips, r.cues);
      p.onReplaced(r.clips[others.length].id);
      rerecord.discard();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  /** Cut a part of the recording out (seconds from its start): closing the gap, or leaving silence. */
  const removePart = (from: number, to: number, close: boolean) => {
    const r = removeSpan(p.clips, chain, chain.start + from, chain.start + to, close, p.allCued);
    p.setTimeline(r.clips, r.cues);
    if (!r.clips.some((x) => x.id === c.id)) {
      const first = r.clips.find((x) => x.upload === c.upload && x.lane === c.lane && Math.abs(x.offset - chain.start) < 0.01) ?? r.clips.find((x) => x.upload === c.upload && x.lane === c.lane);
      if (first) p.onReplaced(first.id);
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
          <span className="muted">lane {c.lane + 1} · {fmt(chain.start)} → {fmt(chain.end)} · {len.toFixed(1)} s{pieces.length > 1 ? ` · ${pieces.length} pieces` : ''}{c.cleanedFrom ? ' · ✨ cleaned' : ''}{c.gain ? ` · ${c.gain > 0 ? '+' : ''}${c.gain} dB` : ''}</span>
          <span className="spacer" />
          <button onClick={p.onUndo} title="Take back the last change (Ctrl+Z)">↶ Undo</button>
          <button onClick={p.onClose} title="Close (Esc)">✕</button>
        </div>

        {p.missing && <p className="note-text">The recording {c.upload} isn't on this computer: it can be recorded again below, or removed.</p>}
        {!p.missing && (
          <ClipWave
            pieces={pieces} start={chain.start} length={len} gain={c.gain ?? 0} loadBuffer={p.loadBuffer}
            lufs={loud?.lufs ?? null} target={loud?.target ?? -16} enabled={t.state !== 'recording'} onRemove={removePart}
            marks={inside.map((ck) => ({ t: ck.t - chain.start, label: `${ck.scene + 1}.${ck.beat + 1}` }))}
          />
        )}

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
            <button onClick={() => p.playFrom(c.offset)} disabled={p.missing} title="Play the timeline from this clip: everything that sounds there, with the board">▶ Play in the timeline</button>
            {c.cleanedFrom
              ? <button onClick={() => p.onRestore(index)} title="Use the recording as it was, with its background noise">↺ Back to the original recording</button>
              : <button onClick={() => p.onClean(index)} disabled={p.missing} title="Remove background noise (fan, hum, room, keyboard) with RNNoise, on this computer; the original is kept">✨ Clean up voice</button>}
            <button onClick={() => p.onTranscribe(index)} disabled={p.missing}>✎ Transcribe…</button>
            <button className="danger" onClick={() => { p.deleteClip(index); p.onClose(); }} title="Takes the clip off the timeline; the recording file stays">✕ Remove clip</button>
          </div>
        </section>

        <AvatarSection clip={c} from={srcFrom} to={srcTo} onAvatar={(a) => update({ avatar: a })} />

        <section>
          <h4><button className={`fold ${micOpen ? 'open' : ''}`} onClick={() => setMicOpen(!micOpen)} aria-expanded={micOpen}>Check the microphone</button></h4>
          {micOpen && <MicCheck mic={mic} onDevice={setDevice} />}
        </section>

        <section className="rerecord">
          <h4>Record or generate it again</h4>
          {t.state === 'recording' && <LevelMeter mic={mic} />}
          <div className="row">
            {t.state === 'idle' && <button className="rec-btn" onClick={() => setWantRecord(true)} disabled={wantRecord} title="Record this clip again with the microphone above; → when you start each next line">● Record again</button>}
            {t.state === 'idle' && <>
              <button onClick={() => void generate()} disabled={generating || !canGenerate} title={canGenerate ? `Say these lines with generated voice (${voiceLabel}) as a new clip in place of this one; everything after it moves by the difference in length. Undo brings this one back.` : 'No beat inside this clip has speaker notes to say'}>{generating ? 'Generating…' : '✨ Generate again'}</button>
              <label className="muted" title="Off: lines that haven't changed keep the reading they had; only edited lines are generated">
                <input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} /> new reading of every line
              </label>
              <span className="muted">{voiceLabel}</span>
            </>}
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
