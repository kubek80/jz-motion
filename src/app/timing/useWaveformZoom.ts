// The timeline's waveform and zoom: peaks of the primary clip, the pixels-per-second zoom, drawing
// a clip's slice of the peaks into its canvas, and keeping the playhead in view while playing.
import { useEffect, useRef, useState } from 'react';
import type { Clip } from '../../engine/schema';
import type { Clock } from './useClock';

export function useWaveformZoom(primary: Clip | undefined, total: number, clock: Clock) {
  const { mixer, time, playing } = clock;
  // ---------------------------------------------------------------- waveform (primary clip only for now)
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const PEAKS_PER_SECOND = 50;
  useEffect(() => {
    setPeaks(null);
    if (!primary) return;
    let alive = true;
    void (async () => {
      // Reuses the mix's shared AudioContext and buffer cache so each upload is only decoded once.
      const audioBuf = await mixer.loadBuffer(primary.upload);
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
  }, [primary?.upload]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- zoom
  const lane = useRef<HTMLDivElement>(null);
  const [pps, setPps] = useState(0);
  useEffect(() => {
    // Start with the whole thing in view.
    if (!pps && lane.current) setPps(Math.max(8, (lane.current.clientWidth - 40) / total));
  }, [pps, total]);
  const width = Math.ceil(total * (pps || 20)) + 40;
  /**
   * Draw the peaks for a clip into its own inline canvas (callback ref). Peaks are sampled over
   * the whole source audio, so a clip whose window is `[trimStart, trimEnd]` renders the slice
   * `[trimStart*PEAKS_PER_SECOND, trimEnd*PEAKS_PER_SECOND)` into its block. Only clips that share
   * the primary clip's source have peak data today; others get a flat block until per-clip peak
   * loading lands in a later phase.
   */
  const drawClipPeaks = (canvasEl: HTMLCanvasElement | null, c: Clip) => {
    if (!canvasEl) return;
    const sec = Math.max(0.01, c.trimEnd - c.trimStart);
    const w = Math.max(1, Math.ceil(sec * (pps || 20)));
    const h = Math.max(1, canvasEl.clientHeight || 32);
    canvasEl.width = w;
    canvasEl.height = h;
    const g = canvasEl.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, w, h);
    if (!peaks || c.upload !== primary?.upload) return;
    const startIdx = Math.max(0, Math.floor(c.trimStart * PEAKS_PER_SECOND));
    const endIdx = Math.min(peaks.length, Math.ceil(c.trimEnd * PEAKS_PER_SECOND));
    const pxPerPeak = (pps || 20) / PEAKS_PER_SECOND;
    g.fillStyle = '#ffffffaa';
    for (let i = startIdx; i < endIdx; i++) {
      const v = Math.min(1, peaks[i] * 1.4) * (h / 2 - 2);
      const x = (i - startIdx) * pxPerPeak;
      g.fillRect(x, h / 2 - v, Math.max(1, pxPerPeak * 0.8), v * 2);
    }
  };

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = lane.current;
    if (!el || !playing) return;
    const x = time * pps;
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 80) el.scrollLeft = x - el.clientWidth * 0.3;
  }, [time, playing, pps]);

  return { lane, pps, setPps, width, drawClipPeaks };
}
