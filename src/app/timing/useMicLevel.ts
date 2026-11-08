import { useEffect, useRef, useState } from 'react';
import { micConstraints, micDevice } from './micDevice';

// The microphone, live: its level (loudness right now and the recent peak, in dBFS) for a meter, the inputs to
// choose from, and the stream itself for recording. Opens the mic while `on`, closes it after.

export interface MicLevel {
  /** Loudness right now (RMS), dBFS: -60 (silence) to 0. */
  level: number;
  /** Highest peak in the last second and a half, dBFS. */
  peak: number;
  /** It touched 0 dB (distortion) in the last two seconds. */
  clipped: boolean;
  devices: MediaDeviceInfo[];
  device: string | undefined;
  stream: MediaStream | null;
  error: string | null;
}

const db = (x: number) => (x > 0 ? Math.max(-60, 20 * Math.log10(x)) : -60);

export function useMicLevel(on: boolean, device: string | undefined): MicLevel {
  const [state, setState] = useState<MicLevel>({ level: -60, peak: -60, clipped: false, devices: [], device: micDevice(), stream: null, error: null });
  const hold = useRef({ peak: -60, at: 0, clipAt: -1e9 });
  useEffect(() => {
    if (!on) return;
    let stopped = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { ...micConstraints(), ...(device ? { deviceId: { exact: device } } : {}) } });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        const used = stream.getAudioTracks()[0]?.getSettings().deviceId;
        const tick = () => {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0, max = 0;
          for (const v of buf) { sum += v * v; max = Math.max(max, Math.abs(v)); }
          const now = performance.now();
          const peakNow = db(max);
          const h = hold.current;
          if (peakNow >= h.peak || now - h.at > 1500) { h.peak = peakNow; h.at = now; }
          if (max >= 0.99) h.clipAt = now;
          setState({ level: db(Math.sqrt(sum / buf.length)), peak: h.peak, clipped: now - h.clipAt < 2000, devices, device: used ?? device, stream, error: null });
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        setState((s) => ({ ...s, stream: null, error: `No access to the microphone: ${(e as Error).message}` }));
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      setState((s) => ({ ...s, stream: null, level: -60, peak: -60 }));
    };
  }, [on, device]);
  return state;
}
