import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage } from '../engine';
import type { CompiledPresentation } from '../engine/compile';
import { palette } from '../engine/palette';
import { cueClicks, cuePerformance, stateAt, type Click } from '../video/performance';

export interface Voiceover { upload: string; duration: number; name?: string }

interface Props {
  presentation: CompiledPresentation;
  /** The presentation as saved (for the take). */
  text: string;
  presentationId: string;
  voiceover?: Voiceover;
  onVoiceover: (v: Voiceover | undefined) => void;
  /** Sets (or with undefined, clears) cues of beats that start clicks; `clearOthers` forgets every other cue first. */
  onCues: (changes: { scene: number; beat: number; cue: number | undefined }[], clearOthers?: boolean) => void;
  /** A take was made from this timing and voice-over, ready to export. */
  onTake: (id: string) => void;
  onClose: () => void;
}

const SCENE_COLORS = [palette.cyan, palette.pink, palette.yellow, palette.green, palette.orange, palette.white];
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

/**
 * Timing a presentation to a voice-over: the narration's waveform with every click placed on it. Drag a click
 * to move it, or play and tap T as each line starts. The board plays along, with the script line beside it.
 */
export function Timing({ presentation, text, presentationId, voiceover, onVoiceover, onCues, onTake, onClose }: Props) {
  const onCue = (scene: number, beat: number, cue: number | undefined) => onCues([{ scene, beat, cue }]);
  const clicks = useMemo(() => cueClicks(presentation), [presentation]);
  const perf = useMemo(() => cuePerformance(presentation, voiceover?.duration ?? 0), [presentation, voiceover?.duration]);
  const total = Math.max(perf.duration, voiceover?.duration ?? 0, 1);

  // ---------------------------------------------------------------- the clock: the voice-over, or a silent stopwatch
  const audio = useRef<HTMLAudioElement>(null);
  const silent = useRef({ startedAt: 0, at: 0, playing: false });
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  /** While recording narration, the clock is the recording. */
  const rec = useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; startedAt: number } | null>(null);
  const now = () => (rec.current ? (performance.now() - rec.current.startedAt) / 1000
    : voiceover ? audio.current?.currentTime ?? 0
      : silent.current.playing ? silent.current.at + (performance.now() - silent.current.startedAt) / 1000 : silent.current.at);
  const seek = (t: number) => {
    const v = Math.max(0, Math.min(total, t));
    if (voiceover && audio.current) audio.current.currentTime = v;
    silent.current.at = v;
    silent.current.startedAt = performance.now();
    setTime(v);
  };
  const play = () => {
    if (voiceover) void audio.current?.play();
    else Object.assign(silent.current, { playing: true, startedAt: performance.now() });
    setPlaying(true);
  };
  const pause = () => {
    if (voiceover) audio.current?.pause();
    else Object.assign(silent.current, { at: now(), playing: false });
    setPlaying(false);
  };

  // ---------------------------------------------------------------- the board, following the clock
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const perfRef = useRef(perf);
  perfRef.current = perf;
  useEffect(() => {
    const s = new Stage(host.current!);
    stage.current = s;
    let raf = 0;
    let alive = true;
    void s.load(presentation).then(() => {
      const tick = () => {
        if (!alive) return;
        const t = now();
        const at = stateAt(perfRef.current, t);
        s.renderAt(at.scene, at.time, t);
        setTime(t);
        if (!voiceover && silent.current.playing && t >= total) pause();
        raf = requestAnimationFrame(tick);
      };
      tick();
    });
    return () => { alive = false; cancelAnimationFrame(raf); s.destroy(); stage.current = null; };
  }, [presentation]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- waveform
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const PEAKS_PER_SECOND = 50;
  useEffect(() => {
    setPeaks(null);
    if (!voiceover) return;
    let alive = true;
    void (async () => {
      const buf = await (await fetch(`/uploads/${voiceover.upload}`)).arrayBuffer();
      const ctx = new AudioContext();
      const audioBuf = await ctx.decodeAudioData(buf);
      void ctx.close();
      const data = audioBuf.getChannelData(0);
      const n = Math.ceil(audioBuf.duration * PEAKS_PER_SECOND);
      const step = data.length / n;
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let m = 0;
        for (let j = Math.floor(i * step); j < Math.floor((i + 1) * step); j += 4) m = Math.max(m, Math.abs(data[j]));
        out[i] = m;
      }
      if (alive) setPeaks(out);
    })().catch(() => undefined);
    return () => { alive = false; };
  }, [voiceover?.upload]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- zoom
  const lane = useRef<HTMLDivElement>(null);
  const [pps, setPps] = useState(0);
  useEffect(() => {
    // Start with the whole thing in view.
    if (!pps && lane.current) setPps(Math.max(8, (lane.current.clientWidth - 40) / total));
  }, [pps, total]);
  const width = Math.ceil(total * (pps || 20)) + 40;
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const h = c.clientHeight || 80;
    c.width = width;
    c.height = h;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, width, h);
    if (!peaks) return;
    g.fillStyle = '#3ef0ff66';
    const k = (pps || 20) / PEAKS_PER_SECOND;
    for (let i = 0; i < peaks.length; i++) {
      const v = Math.min(1, peaks[i] * 1.4) * (h / 2 - 2);
      g.fillRect(i * k, h / 2 - v, Math.max(1, k * 0.8), v * 2);
    }
  }, [peaks, pps, width]);

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = lane.current;
    if (!el || !playing) return;
    const x = time * pps;
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 80) el.scrollLeft = x - el.clientWidth * 0.3;
  }, [time, playing, pps]);

  // ---------------------------------------------------------------- dragging clicks, tapping
  const [drag, setDrag] = useState<{ index: number; t: number } | null>(null);
  const startDrag = (e: React.PointerEvent, index: number) => {
    e.stopPropagation();
    if (rec.current) return;
    const x0 = e.clientX;
    const t0 = clicks[index].t;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    let latest = t0;
    const move = (ev: PointerEvent) => {
      latest = Math.max(0, Math.round((t0 + (ev.clientX - x0) / pps) * 20) / 20);
      setDrag({ index, t: latest });
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      setDrag(null);
      if (Math.abs(latest - t0) > 0.01) onCue(clicks[index].scene, clicks[index].beat, latest);
      else seek(clicks[index].t);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tapping, setTapping] = useState(false);
  const [tapIndex, setTapIndex] = useState(0);
  const nextAfter = (t: number) => Math.max(0, clicks.findIndex((c) => c.t >= t - 0.05));
  const tap = () => {
    const c = clicks[tapIndex];
    if (!c) return;
    onCue(c.scene, c.beat, Math.round(now() * 20) / 20);
    setTapIndex(tapIndex + 1);
  };

  // ---------------------------------------------------------------- recording narration, with the script as a prompter
  const [recording, setRecording] = useState(false);
  const [recIndex, setRecIndex] = useState(0);
  const [prompter, setPrompter] = useState(false);
  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } });
      pause();
      const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? { mimeType: 'audio/webm;codecs=opus' } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.current = { recorder, stream, chunks, startedAt: performance.now() };
      recorder.start(1000);
      // A fresh timing: the first click starts with the recording; → places each next one.
      if (clicks[0]) onCues([{ scene: clicks[0].scene, beat: clicks[0].beat, cue: 0 }], true);
      setRecIndex(0);
      setRecording(true);
      setPrompter(true);
    } catch (e) {
      setError(`Could not use the microphone: ${(e as Error).message}`);
    }
  };
  const nextLine = () => {
    const i = recIndex + 1;
    const c = clicks[i];
    if (!c) return void stopRecording();
    onCue(c.scene, c.beat, Math.round(now() * 20) / 20);
    setRecIndex(i);
  };
  const previousLine = () => {
    // Pressed too early: the line goes back to following the one before, to be placed again.
    if (recIndex === 0) return;
    const c = clicks[recIndex];
    onCue(c.scene, c.beat, undefined);
    setRecIndex(recIndex - 1);
  };
  const stopRecording = async () => {
    const r = rec.current;
    if (!r) return;
    const duration = now();
    rec.current = null;
    setRecording(false);
    const done = new Promise<void>((resolve) => { r.recorder.onstop = () => resolve(); });
    r.recorder.stop();
    await done;
    r.stream.getTracks().forEach((t) => t.stop());
    setBusy('Saving the narration…');
    try {
      const blob = new Blob(r.chunks, { type: r.recorder.mimeType || 'audio/webm' });
      const res = await fetch('/api/uploads?ext=webm', { method: 'POST', body: blob });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
      const { upload } = await res.json();
      onVoiceover({ upload, duration: Math.round(duration * 100) / 100, name: `narration ${new Date().toLocaleString()}` });
      seek(0);
      setPps(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  useEffect(() => () => { rec.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  const keys = useRef({ playing, tapping, tap, play, pause, seek, now, onClose, recording, nextLine, previousLine, stopRecording });
  keys.current = { playing, tapping, tap, play, pause, seek, now, onClose, recording, nextLine, previousLine, stopRecording };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      const k = keys.current;
      if (k.recording) {
        if ([' ', 'ArrowRight', 'ArrowDown', 'PageDown', 'Enter'].includes(e.key)) k.nextLine();
        else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) k.previousLine();
        else if (e.key === 'Escape') void k.stopRecording();
        else return;
      } else if (e.key === ' ') (k.playing ? k.pause() : k.play());
      else if (e.key.toLowerCase() === 't' && k.tapping) k.tap();
      else if (e.key === 'ArrowLeft') k.seek(k.now() - (e.shiftKey ? 10 : 2));
      else if (e.key === 'ArrowRight') k.seek(k.now() + (e.shiftKey ? 10 : 2));
      else if (e.key === 'Escape') k.onClose();
      else return;
      // Captured before the editor's own shortcuts, so Space doesn't also step the board.
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // ---------------------------------------------------------------- voice-over file, take
  const loadVoiceover = async (file: File) => {
    setBusy('Uploading…');
    setError(null);
    try {
      const url = URL.createObjectURL(file);
      const duration = await new Promise<number>((resolve, reject) => {
        const a = new Audio();
        a.preload = 'metadata';
        a.onloadedmetadata = () => resolve(a.duration);
        a.onerror = () => reject(new Error('could not read that file as audio'));
        a.src = url;
      });
      URL.revokeObjectURL(url);
      const ext = (file.name.split('.').pop() ?? 'mp3').toLowerCase();
      const res = await fetch(`/api/uploads?ext=${ext}`, { method: 'POST', body: file });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
      const { upload } = await res.json();
      onVoiceover({ upload, duration: Math.round(duration * 100) / 100, name: file.name });
      seek(0);
      setPps(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const makeTake = async () => {
    if (!voiceover) return;
    setBusy('Making the take…');
    setError(null);
    try {
      const doc = JSON.parse(text);
      const take = await (await fetch('/api/takes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: `${doc.title} · voice-over`, performance: perf, presentation: doc, presentationId }),
      })).json();
      const res = await fetch(`/api/takes/${take.id}/tracks/me?from=${voiceover.upload}&copy=1&offset=0`, { method: 'PUT' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
      onTake(take.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // ---------------------------------------------------------------- what's playing
  const shown = clicks.map((c, i) => (drag?.index === i ? { ...c, t: drag.t } : c));
  const currentIndex = Math.max(0, shown.reduce((found, c, i) => (c.t <= time + 1e-3 ? i : found), -1));
  const current = shown[currentIndex];
  const next = shown[currentIndex + 1];
  const beatOf = (c?: Click) => (c ? presentation.scenes[c.scene].beats[c.beat] : undefined);
  const sceneTitle = (c?: Click) => (c ? presentation.scenes[c.scene].title ?? presentation.scenes[c.scene].id : '');
  const cuedCount = clicks.filter((c) => c.cued).length;

  return (
    <div className="timing">
      <header className="timing-head">
        <h2>Timing</h2>
        <span className="muted">{clicks.length} clicks · {cuedCount} placed on the {voiceover ? 'voice-over' : 'timeline'}</span>
        <span className="spacer" />
        <label className="file-btn" title="An audio or video file with your narration (mp3, m4a, wav, webm, mp4…)">
          {voiceover ? `Voice-over: ${voiceover.name ?? voiceover.upload} (${fmt(voiceover.duration)})` : 'Load a voice-over…'}
          <input type="file" accept="audio/*,video/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void loadVoiceover(f); }} />
        </label>
        {voiceover && <button onClick={() => onVoiceover(undefined)} title="Stop using this voice-over (the cues stay)">Remove</button>}
        <button onClick={() => onCues([], true)} disabled={!cuedCount || recording} title="Forget every cue: clicks go back to even pauses">Clear cues</button>
        <button className="primary" disabled={!voiceover || !!busy} onClick={() => void makeTake()} title="A take with this timing and the voice-over as its sound, ready to export in the Video tab">
          Make a take for export
        </button>
        <button onClick={onClose} title="Close (Esc)">✕</button>
      </header>
      {voiceover && <audio ref={audio} src={`/uploads/${voiceover.upload}`} preload="auto" onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />}
      <div className={prompter ? 'timing-body prompter' : 'timing-body'}>
        <div className="timing-board" ref={host} />
        <aside className="timing-script">
          {recording && <div className="rec-banner"><span className="dot" /> Recording {fmt(time)} · <b>→ / Space</b> next line · <b>←</b> back · <b>Esc</b> stop</div>}
          <div className="now">
            <span className="muted">Now · {sceneTitle(current)}</span>
            <b>{beatOf(current)?.title ?? `Beat ${(current?.beat ?? 0) + 1}`}</b>
            <p>{beatOf(current)?.notes || <span className="muted">No speaker notes</span>}</p>
          </div>
          {next && (
            <div className="next">
              <span className="muted">Next at {fmt(next.t)} · {sceneTitle(next)}</span>
              <b>{beatOf(next)?.title ?? `Beat ${next.beat + 1}`}</b>
              <p>{beatOf(next)?.notes}</p>
            </div>
          )}
        </aside>
      </div>
      <div className="timing-controls">
        {recording ? (
          <button className="rec-btn on" onClick={() => void stopRecording()}>■ Stop recording</button>
        ) : (
          <button className="rec-btn" disabled={!!busy} onClick={() => void startRecording()} title="Record your narration while reading the script: press → (or Space) as you start each new line; that places its beat. Replaces the current timing.">● Record narration</button>
        )}
        <button className={prompter ? 'on' : ''} onClick={() => setPrompter(!prompter)} title="Show the script large, as a teleprompter">Prompter</button>
        <button className="play" disabled={recording} onClick={() => (playing ? pause() : play())} title="Play / pause (Space)">{playing ? '❚❚' : '▶'}</button>
        <span className="clock">{fmt(time)} / {fmt(total)}</span>
        <button
          className={tapping ? 'tap on' : 'tap'}
          onClick={() => { setTapping(!tapping); setTapIndex(nextAfter(now())); }}
          title="Tap mode: play, and press T as each line starts; each tap places the next click"
        >
          Tap to place {tapping && clicks[tapIndex] ? `· next: ${beatOf(clicks[tapIndex])?.title ?? `beat ${clicks[tapIndex].beat + 1}`}` : ''}
        </button>
        {tapping && <button className="primary tap-now" onClick={tap} disabled={!clicks[tapIndex]}>T · place it now</button>}
        <span className="spacer" />
        <span className="muted hint">Drag a click to move it · double-click to let it follow the one before · ←/→ seek</span>
        <label className="zoom" title="Zoom the timeline">
          <span className="muted">zoom</span>
          <input type="range" min={4} max={200} step={1} value={pps || 20} onChange={(e) => setPps(Number(e.target.value))} />
        </label>
      </div>
      {error && <p className="error-text">{error}</p>}
      {busy && <p className="muted">{busy}</p>}
      <div
        className="timing-lane"
        ref={lane}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('.click') || rec.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          seek((e.clientX - r.left + e.currentTarget.scrollLeft - 20) / pps);
        }}
      >
        <div className="timing-track" style={{ width }}>
          <div className="ruler">
            {Array.from({ length: Math.ceil(total / rulerStep(pps)) + 1 }, (_, i) => i * rulerStep(pps)).map((s) => (
              <span key={s} style={{ left: 20 + s * pps }}>{fmt(s).replace(/\.\d$/, '')}</span>
            ))}
          </div>
          <div className="wave">
            <canvas ref={canvas} style={{ left: 20, width: width - 20 }} />
            {!voiceover && <span className="muted wave-empty">No voice-over yet: load one above, or tap along in silence.</span>}
          </div>
          <div className="clicks">
            {shown.map((c, i) => {
              const color = SCENE_COLORS[c.scene % SCENE_COLORS.length];
              const b = beatOf(c);
              return (
                <div
                  key={`${c.scene}:${c.beat}`}
                  className={['click', i % 2 ? 'row2' : '', c.cued ? 'cued' : 'auto', c.late ? 'late' : '', i === currentIndex ? 'current' : '', tapping && i === tapIndex ? 'tap-next' : ''].join(' ')}
                  style={{ left: 20 + c.t * pps, '--c': color } as React.CSSProperties}
                  onPointerDown={(e) => startDrag(e, i)}
                  onDoubleClick={() => onCue(c.scene, c.beat, undefined)}
                  title={`${sceneTitle(c)} · ${b?.title ?? `beat ${c.beat + 1}`} at ${fmt(c.t)}${c.cued ? '' : ' (follows the one before)'}${c.late ? ' (starts before the previous animation ends: that one jumps to its end)' : ''}\n${b?.notes ?? ''}`}
                >
                  <span className="flag">{c.scene + 1}.{c.beat + 1} {b?.title ?? ''}</span>
                  <span className="anim" style={{ width: Math.max(2, (c.until - c.from) * pps) }} />
                </div>
              );
            })}
          </div>
          <div className="playhead" style={{ left: 20 + time * pps }} />
        </div>
      </div>
    </div>
  );
}

/** Seconds between ruler labels, so they stay about 80 px apart. */
function rulerStep(pps: number) {
  for (const s of [0.5, 1, 2, 5, 10, 15, 30, 60, 120]) if (s * (pps || 20) >= 80) return s;
  return 300;
}
