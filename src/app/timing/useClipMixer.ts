import { useRef, useState } from 'react';
import type { Clip } from '../../engine/schema';

/**
 * Plays an array of clips on a shared AudioContext. Each clip becomes an AudioBufferSourceNode
 * scheduled at `clip.offset` with its trim window; everything mixes through `ctx.destination`.
 *
 * Call `play()` to start from the last paused/seeked position, `pause()` to stop (freezes the
 * playhead at the current time), `seek(t)` to move the playhead (restarts in-flight playback).
 * `now()` returns the live timeline position while playing, or the frozen position otherwise.
 *
 * `loadBuffer(upload)` is exposed so the waveform renderer can share decoded buffers — one file
 * is fetched and decoded at most once per mount.
 *
 * `dispose()` closes the AudioContext; call it from the Timing component's unmount effect.
 */
export function useClipMixer(clips: Clip[]) {
  const ctx = useRef<AudioContext | null>(null);
  const bufferCache = useRef<Map<string, Promise<AudioBuffer>>>(new Map());
  const sources = useRef<AudioBufferSourceNode[]>([]);
  /** Anchor relating ctx.currentTime to the timeline; null when paused. */
  const anchor = useRef<{ ctxT: number; tlT: number } | null>(null);
  /** Timeline position when paused or seeked; starting point for the next play(). */
  const pausedAt = useRef(0);
  const [playing, setPlaying] = useState(false);
  // The scheduleMix closure reads the live clip list at play time, not the mount-time one.
  const clipsRef = useRef(clips);
  clipsRef.current = clips;

  const ensureCtx = () => {
    if (!ctx.current) ctx.current = new AudioContext();
    return ctx.current;
  };

  const loadBuffer = (upload: string): Promise<AudioBuffer> => {
    let p = bufferCache.current.get(upload);
    if (!p) {
      p = (async () => {
        const a = ensureCtx();
        const res = await fetch(`/uploads/${upload}`);
        if (!res.ok) throw new Error(`could not load ${upload}`);
        const buf = await res.arrayBuffer();
        return a.decodeAudioData(buf);
      })();
      bufferCache.current.set(upload, p);
    }
    return p;
  };

  const stopSources = () => {
    for (const s of sources.current) { try { s.stop(); } catch { /* already ended */ } }
    sources.current = [];
  };

  const scheduleMix = async (fromT: number) => {
    const a = ensureCtx();
    if (a.state === 'suspended') await a.resume();
    stopSources();
    const anchorCtx = a.currentTime + 0.05; // small lookahead so sources start in sync
    const toPlay = clipsRef.current.filter((c) => c.offset + (c.trimEnd - c.trimStart) > fromT);
    const bufs = await Promise.all(toPlay.map((c) => loadBuffer(c.upload).catch(() => null)));
    toPlay.forEach((c, i) => {
      const buf = bufs[i];
      if (!buf) return;
      const srcStart = c.trimStart + Math.max(0, fromT - c.offset);
      const dur = c.trimEnd - srcStart;
      if (dur <= 0) return;
      const startCtxT = anchorCtx + Math.max(0, c.offset - fromT);
      const node = a.createBufferSource();
      node.buffer = buf;
      if (c.gain) {
        // The clip's own volume change (dB).
        const g = a.createGain();
        g.gain.value = 10 ** (c.gain / 20);
        node.connect(g).connect(a.destination);
      } else node.connect(a.destination);
      node.start(startCtxT, srcStart, dur);
      sources.current.push(node);
    });
    anchor.current = { ctxT: anchorCtx, tlT: fromT };
  };

  const now = (): number => {
    if (anchor.current && ctx.current) return anchor.current.tlT + (ctx.current.currentTime - anchor.current.ctxT);
    return pausedAt.current;
  };

  const play = () => {
    void scheduleMix(pausedAt.current);
    setPlaying(true);
  };

  const pause = () => {
    pausedAt.current = now();
    stopSources();
    anchor.current = null;
    setPlaying(false);
  };

  const seek = (t: number) => {
    pausedAt.current = t;
    if (anchor.current) void scheduleMix(t);
  };

  /** Stop in-flight sources and clear the anchor without changing `playing`/`pausedAt`. Used when
   * the clip arrangement changes mid-playback and the caller wants a hard reset. */
  const hardStop = () => {
    stopSources();
    anchor.current = null;
    setPlaying(false);
  };

  const dispose = () => {
    stopSources();
    void ctx.current?.close();
    ctx.current = null;
    bufferCache.current = new Map();
  };

  const isActive = () => anchor.current !== null;

  return { playing, play, pause, seek, now, loadBuffer, hardStop, isActive, dispose };
}
