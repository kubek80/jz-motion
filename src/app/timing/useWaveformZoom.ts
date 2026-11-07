// The timeline's waveform and zoom: peaks of the primary clip, the pixels-per-second zoom, drawing
// a clip's slice of the peaks into its canvas, keeping the playhead in view while playing, and getting
// around when zoomed in: the wheel scrolls sideways, Ctrl/⌘ + wheel zooms around the pointer, zooming
// keeps the playhead (or the middle) where it was, and `view` / `centerOn` drive the minimap.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  /** Until you zoom, the timeline keeps showing all of it (its length is only known once everything has loaded). */
  const zoomed = useRef(false);
  useEffect(() => {
    if (lane.current && (!pps || !zoomed.current)) setPps(Math.max(0.5, (lane.current.clientWidth - 40) / total));
  }, [pps, total]);
  const width = Math.ceil(total * (pps || 20)) + 40;
  const ppsRef = useRef(pps);
  ppsRef.current = pps;
  /** After a zoom, put this moment back at this x in the lane (applied once the new width is laid out). */
  const anchor = useRef<{ t: number; x: number } | null>(null);
  // Far enough out that a long presentation (half an hour on a laptop screen) still fits.
  const clampPps = (v: number) => Math.max(0.5, Math.min(400, v));
  /** Zoom to `next` pixels per second, keeping the moment at lane x `x` where it is. */
  const zoomAround = (next: number, x: number) => {
    zoomed.current = true;
    const el = lane.current;
    const cur = ppsRef.current || 20;
    if (el) anchor.current = { t: (el.scrollLeft + x - 20) / cur, x };
    setPps(clampPps(next));
  };
  /** Zoom keeping the playhead in place when it is in view, else the middle. */
  const zoomTo = (next: number) => {
    const el = lane.current;
    if (!el) return setPps(clampPps(next));
    const px = time * (ppsRef.current || 20) + 20 - el.scrollLeft;
    zoomAround(next, px >= 0 && px <= el.clientWidth ? px : el.clientWidth / 2);
  };
  useLayoutEffect(() => {
    const el = lane.current;
    const a = anchor.current;
    if (!el || !a) return;
    anchor.current = null;
    el.scrollLeft = a.t * pps + 20 - a.x;
  }, [pps]);

  // What the lane shows, for the minimap; the wheel scrolls sideways, Ctrl/⌘ + wheel zooms.
  const [scroll, setScroll] = useState({ left: 0, width: 0 });
  useEffect(() => {
    const el = lane.current;
    if (!el) return;
    const update = () => setScroll({ left: el.scrollLeft, width: el.clientWidth });
    update();
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomAround((ppsRef.current || 20) * Math.exp(-e.deltaY * 0.002), e.clientX - el.getBoundingClientRect().left);
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => { ro.disconnect(); el.removeEventListener('scroll', update); el.removeEventListener('wheel', onWheel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const k = pps || 20;
  const view = { from: Math.max(0, (scroll.left - 20) / k), to: (scroll.left + scroll.width - 20) / k };
  const centerOn = (t: number) => {
    const el = lane.current;
    if (el) el.scrollLeft = t * k + 20 - el.clientWidth / 2;
  };
  const fit = () => {
    const el = lane.current;
    if (!el) return;
    zoomed.current = false;
    setPps(clampPps((el.clientWidth - 40) / total));
    el.scrollLeft = 0;
  };
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

  return { lane, pps, setPps, zoomTo, width, drawClipPeaks, view, centerOn, fit };
}
