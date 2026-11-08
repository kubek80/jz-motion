import { useEffect, useRef, useState } from 'react';
import type { Clip } from '../../engine/schema';
import { fmt } from './format';

// A clip's sound wave in its window, with a player for that clip alone (at its own volume): play/pause, click the
// wave to go to a moment, Space to play or pause. The beats that start inside it are marked on the wave.

interface Props {
  clip: Clip;
  loadBuffer: (upload: string) => Promise<AudioBuffer>;
  /** Beats that start inside the clip: seconds from the clip's start, and a label. */
  marks: { t: number; label: string }[];
  /** Not while recording a new take. */
  enabled: boolean;
}

export function ClipWave({ clip, loadBuffer, marks, enabled }: Props) {
  const len = clip.trimEnd - clip.trimStart;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const player = useRef<{ ctx: AudioContext; node?: AudioBufferSourceNode; gain?: GainNode; startedAt: number; from: number; raf: number } | null>(null);

  useEffect(() => {
    setBuffer(null);
    loadBuffer(clip.upload).then(setBuffer).catch((e) => setError(`Can't read the recording: ${(e as Error).message}`));
  }, [clip.upload]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw the wave: the loudest sample in each column, mirrored, over the part the clip plays.
  useEffect(() => {
    const el = canvas.current;
    if (!el || !buffer) return;
    const w = el.clientWidth * devicePixelRatio;
    const h = el.clientHeight * devicePixelRatio;
    el.width = w;
    el.height = h;
    const g = el.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    const data = buffer.getChannelData(0);
    const from = Math.floor(clip.trimStart * buffer.sampleRate);
    const per = Math.max(1, Math.floor((len * buffer.sampleRate) / w));
    let loudest = 0.001;
    const peaks: number[] = [];
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let i = from + x * per, end = Math.min(data.length, i + per); i < end; i++) m = Math.max(m, Math.abs(data[i]));
      peaks.push(m);
      loudest = Math.max(loudest, m);
    }
    const mid = h / 2;
    g.fillStyle = '#3ef0ff';
    // Scaled to the loudest moment, so a quiet clip's shape is still visible (the volume panel says how loud it is).
    peaks.forEach((m, x) => { const y = (m / loudest) * (mid - 2); g.fillRect(x, mid - y, 1, Math.max(1, y * 2)); });
    // Near full scale (0 dB): those moments may distort.
    g.fillStyle = '#ff5a6e';
    peaks.forEach((m, x) => { if (m >= 0.98) g.fillRect(x, 0, 1, h); });
  }, [buffer, clip.trimStart, clip.trimEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = () => {
    const p = player.current;
    if (!p) return;
    cancelAnimationFrame(p.raf);
    if (p.node) { p.node.onended = null; p.node.stop(); }
    p.node = undefined;
    setPlaying(false);
  };
  const play = (from = pos >= len - 0.05 ? 0 : pos) => {
    if (!buffer) return;
    stop();
    const ctx = player.current?.ctx ?? new AudioContext();
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 10 ** ((clip.gain ?? 0) / 20);
    node.connect(gain).connect(ctx.destination);
    node.start(0, clip.trimStart + from, len - from);
    const p = { ctx, node, gain, startedAt: ctx.currentTime, from, raf: 0 };
    player.current = p;
    node.onended = () => { cancelAnimationFrame(p.raf); setPlaying(false); setPos(len); };
    const tick = () => { setPos(Math.min(len, p.from + (ctx.currentTime - p.startedAt))); p.raf = requestAnimationFrame(tick); };
    tick();
    setPlaying(true);
  };
  // The volume can change while it plays.
  useEffect(() => { if (player.current?.gain) player.current.gain.gain.value = 10 ** ((clip.gain ?? 0) / 20); }, [clip.gain]);
  useEffect(() => () => { stop(); void player.current?.ctx.close(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!enabled) stop(); }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = () => (playing ? (stop(), setPos(pos)) : play());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' || !enabled || (e.target as HTMLElement).closest('input, textarea, select, button')) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const at = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const t = Math.max(0, Math.min(len, ((e.clientX - r.left) / r.width) * len));
    setPos(t);
    if (playing) play(t);
  };

  return (
    <div className="clip-wave">
      <div className="row">
        <button className="play" onClick={toggle} disabled={!buffer || !enabled} title="Play only this clip, at its volume (Space)">{playing ? '❚❚ Pause' : '▶ Play this clip'}</button>
        <span className="muted">{fmt(pos)} / {fmt(len)}</span>
      </div>
      {error ? <p className="note-text">{error}</p> : (
        <div className="wave" onClick={at} title="Click to go to that moment">
          <canvas ref={canvas} />
          {!buffer && <span className="muted loading">Loading the sound…</span>}
          {marks.map((m) => <span key={m.label} className="mark" style={{ left: `${(m.t / len) * 100}%` }}><b>{m.label}</b></span>)}
          <span className="wave-playhead" style={{ left: `${(pos / len) * 100}%` }} />
        </div>
      )}
    </div>
  );
}
