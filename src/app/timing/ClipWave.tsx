import { useEffect, useMemo, useRef, useState } from 'react';
import type { Clip } from '../../engine/schema';
import { fmt } from './format';

// A recording's sound wave in the clip window, over all its pieces (parts cut out are gone, or silent): drawn on a
// decibel scale with how loud it is over time, its average and the level the video aims for, so you can see where
// you are. Play it alone (at its volume), click to go to a moment, drag to select a part: loop it, or remove it
// (closing the gap or keeping the timing). Space plays or pauses.

export interface WaveProps {
  pieces: Clip[];
  /** Timeline seconds where the first piece starts. */
  start: number;
  length: number;
  gain: number;
  loadBuffer: (upload: string) => Promise<AudioBuffer>;
  /** Beats that start inside, in seconds from `start`. */
  marks: { t: number; label: string }[];
  /** Integrated loudness of the recording (LUFS) and what the video aims for. */
  lufs: number | null;
  target: number;
  enabled: boolean;
  onRemove: (from: number, to: number, close: boolean) => void;
}

const FLOOR = -54; // dB at the centre line
const len = (c: Clip) => c.trimEnd - c.trimStart;

export function ClipWave(p: WaveProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [loop, setLoop] = useState(false);
  const drag = useRef<{ x0: number; t0: number; moved: boolean } | null>(null);
  const player = useRef<{ ctx: AudioContext; nodes: AudioBufferSourceNode[]; gain?: GainNode; startedAt: number; from: number; to: number; raf: number; timer: number } | null>(null);
  const upload = p.pieces[0]?.upload;
  // Where each piece sits, in seconds from the start of the first.
  const segs = useMemo(() => p.pieces.map((c) => ({ at: c.offset - p.start, src: c.trimStart, len: len(c) })), [p.pieces, p.start]);

  useEffect(() => {
    if (!upload) return;
    setBuffer(null);
    p.loadBuffer(upload).then(setBuffer).catch((e) => setError(`Can't read the recording: ${(e as Error).message}`));
  }, [upload]); // eslint-disable-line react-hooks/exhaustive-deps

  // Running sum of squares, for the loudness over any stretch.
  const squares = useMemo(() => {
    if (!buffer) return null;
    const d = buffer.getChannelData(0);
    const s = new Float64Array(d.length + 1);
    for (let i = 0; i < d.length; i++) s[i + 1] = s[i] + d[i] * d[i];
    return s;
  }, [buffer]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !buffer || !squares) return;
    const w = Math.round(el.clientWidth * devicePixelRatio);
    const h = Math.round(el.clientHeight * devicePixelRatio);
    el.width = w;
    el.height = h;
    const g = el.getContext('2d')!;
    const data = buffer.getChannelData(0);
    const sr = buffer.sampleRate;
    const mid = h / 2;
    const yOf = (db: number) => Math.max(0, Math.min(1, (db - FLOOR) / -FLOOR)) * (mid - 2);
    const dbOf = (x: number) => (x > 0 ? 20 * Math.log10(x) + p.gain : -120);
    const srcAt = (t: number) => { const s = segs.find((q) => t >= q.at && t < q.at + q.len); return s ? s.src + (t - s.at) : null; };
    const per = p.length / w;
    const loud: (number | null)[] = [];
    for (let x = 0; x < w; x++) {
      const s = srcAt(x * per);
      if (s === null) { loud.push(null); continue; }
      let m = 0;
      for (let i = Math.floor(s * sr), end = Math.min(data.length, Math.floor((s + per) * sr) + 1); i < end; i++) m = Math.max(m, Math.abs(data[i]));
      const y = yOf(dbOf(m));
      g.fillStyle = m * 10 ** (p.gain / 20) >= 0.98 ? '#ff5a6e' : '#3ef0ff55';
      g.fillRect(x, mid - y, 1, Math.max(1, y * 2));
      // Loudness right here: the power over 0.4 s around it.
      const a = Math.max(0, Math.floor((s - 0.2) * sr)), b = Math.min(data.length, Math.floor((s + 0.2) * sr));
      loud.push(b > a ? dbOf(Math.sqrt((squares[b] - squares[a]) / (b - a))) : null);
    }
    // Loudness over time, mirrored like the wave.
    g.strokeStyle = '#3ef0ff';
    g.lineWidth = 1.5 * devicePixelRatio;
    for (const sign of [-1, 1]) {
      g.beginPath();
      let pen = false;
      loud.forEach((db, x) => { if (db === null || db < FLOOR) { pen = false; return; } const y = mid + sign * yOf(db); if (pen) g.lineTo(x, y); else g.moveTo(x, y); pen = true; });
      g.stroke();
    }
    const line = (db: number, color: string, dash: number[], label: string) => {
      g.strokeStyle = color; g.fillStyle = color; g.setLineDash(dash.map((d) => d * devicePixelRatio)); g.lineWidth = 1.5 * devicePixelRatio;
      for (const sign of [-1, 1]) { g.beginPath(); g.moveTo(0, mid + sign * yOf(db)); g.lineTo(w, mid + sign * yOf(db)); g.stroke(); }
      g.setLineDash([]);
      g.font = `${11 * devicePixelRatio}px sans-serif`;
      g.fillText(label, w - g.measureText(label).width - 6 * devicePixelRatio, mid - yOf(db) - 4 * devicePixelRatio);
    };
    line(p.target, '#4ade80', [6, 4], `target ${p.target}`);
    if (p.lufs !== null) line(p.lufs + p.gain, '#facc15', [], `average ${(p.lufs + p.gain).toFixed(1)}`);
  }, [buffer, squares, segs, p.length, p.gain, p.lufs, p.target]);

  const stop = () => {
    const q = player.current;
    if (!q) return;
    cancelAnimationFrame(q.raf);
    clearTimeout(q.timer);
    for (const n of q.nodes) { n.onended = null; try { n.stop(); } catch { /* not started */ } }
    q.nodes = [];
    setPlaying(false);
  };
  /** Plays [from, to) of the recording (its pieces as they sit), again and again when looping. */
  const play = (from: number, to: number, again = false) => {
    if (!buffer) return;
    stop();
    const ctx = player.current?.ctx ?? new AudioContext();
    const gain = ctx.createGain();
    gain.gain.value = 10 ** (p.gain / 20);
    gain.connect(ctx.destination);
    const t0 = ctx.currentTime + 0.02;
    const nodes: AudioBufferSourceNode[] = [];
    for (const s of segs) {
      const a = Math.max(from, s.at), b = Math.min(to, s.at + s.len);
      if (b <= a) continue;
      const n = ctx.createBufferSource();
      n.buffer = buffer;
      n.connect(gain);
      n.start(t0 + (a - from), s.src + (a - s.at), b - a);
      nodes.push(n);
    }
    const q = { ctx, nodes, gain, startedAt: t0, from, to, raf: 0, timer: 0 };
    player.current = q;
    const tick = () => { setPos(Math.min(to, from + Math.max(0, ctx.currentTime - t0))); q.raf = requestAnimationFrame(tick); };
    tick();
    q.timer = window.setTimeout(() => {
      if (again) play(from, to, true);
      else { stop(); setPos(to); }
    }, (to - from) * 1000 + 30);
    setPlaying(true);
  };
  const toggle = () => {
    if (playing) { stop(); return; }
    if (sel && loop) play(sel[0], sel[1], true);
    else if (sel) play(sel[0], sel[1]);
    else play(pos >= p.length - 0.05 ? 0 : pos, p.length);
  };
  useEffect(() => { if (player.current?.gain) player.current.gain.gain.value = 10 ** (p.gain / 20); }, [p.gain]);
  useEffect(() => () => { stop(); void player.current?.ctx.close(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!p.enabled) stop(); }, [p.enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  // The pieces changed (a part removed, undo): stop and forget the selection.
  useEffect(() => { stop(); setSel(null); setPos((x) => Math.min(x, p.length)); }, [segs]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!p.enabled || (e.target as HTMLElement).closest('input, textarea, select, button')) return;
      if (e.key === ' ') { e.preventDefault(); toggle(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const timeAt = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return Math.max(0, Math.min(p.length, ((e.clientX - r.left) / r.width) * p.length));
  };
  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x0: e.clientX, t0: timeAt(e), moved: false };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.x0) > 4) d.moved = true;
    if (d.moved) { const t = timeAt(e); setSel([Math.min(d.t0, t), Math.max(d.t0, t)]); }
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      const t = timeAt(e);
      const s: [number, number] = [Math.min(d.t0, t), Math.max(d.t0, t)];
      setSel(s);
      setPos(s[0]);
      if (playing) (loop ? play(s[0], s[1], true) : play(s[0], s[1]));
    } else {
      setSel(null);
      setPos(d.t0);
      if (playing) play(d.t0, p.length);
    }
  };
  const pct = (t: number) => `${(t / p.length) * 100}%`;

  return (
    <div className="clip-wave">
      <div className="row">
        <button className="play" onClick={toggle} disabled={!buffer || !p.enabled} title="Play only this recording, at its volume (Space). With a part selected: that part.">
          {playing ? '❚❚ Pause' : sel ? (loop ? '⟲ Loop the selection' : '▶ Play the selection') : '▶ Play this clip'}
        </button>
        <span className="muted">{fmt(pos)} / {fmt(p.length)}</span>
        {sel && <>
          <label className="loop" title="Play the selected part again and again"><input type="checkbox" checked={loop} onChange={(e) => { setLoop(e.target.checked); if (playing) (e.target.checked ? play(sel[0], sel[1], true) : play(sel[0], sel[1])); }} /> loop</label>
          <span className="muted">{fmt(sel[0])}–{fmt(sel[1])} ({(sel[1] - sel[0]).toFixed(1)} s)</span>
          <span className="spacer" />
          <button onClick={() => p.onRemove(sel[0], sel[1], true)} title="Cut this part out; everything after it (clips and beats) moves earlier">✂ Remove, close the gap</button>
          <button onClick={() => p.onRemove(sel[0], sel[1], false)} title="Cut this part out and leave silence; nothing moves">✂ Remove, keep the timing</button>
          <button onClick={() => setSel(null)}>Clear selection</button>
        </>}
      </div>
      <p className="muted hint wave-legend"><span className="k loud" /> how loud, moment by moment · <span className="k avg" /> its average · <span className="k target" /> what the video aims for · red: may distort</p>
      {error ? <p className="note-text">{error}</p> : (
        <div className="wave" onPointerDown={down} onPointerMove={move} onPointerUp={up} title="Click to go to a moment; drag to select a part">
          <canvas ref={canvas} />
          {!buffer && <span className="muted loading">Loading the sound…</span>}
          {segs.slice(1).map((s, i) => <span key={i} className="piece-join" style={{ left: pct(s.at) }} title="A part was cut out here" />)}
          {sel && <span className="wave-sel" style={{ left: pct(sel[0]), width: pct(sel[1] - sel[0]) }} />}
          {p.marks.map((m) => <span key={m.label} className="mark" style={{ left: pct(m.t) }}><b>{m.label}</b></span>)}
          <span className="wave-playhead" style={{ left: pct(pos) }} />
        </div>
      )}
    </div>
  );
}
