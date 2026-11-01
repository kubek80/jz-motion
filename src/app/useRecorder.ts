import { useCallback, useEffect, useRef, useState } from 'react';
import type { PerformState, Stage } from '../engine';
import type { PerformEvent } from '../video/performance';

export interface RecorderState {
  status: 'idle' | 'starting' | 'recording' | 'saving';
  seconds: number;
  error?: string;
  /** Live camera stream for the preview while recording. */
  stream?: MediaStream;
  lastTake?: { id: string; name: string };
}

const MIME = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'audio/webm;codecs=opus', 'audio/webm'];

/**
 * Records a take: microphone (and camera) through MediaRecorder, plus every play/jump on the stage
 * with its time. Saved to the local server as a take with one track, "me".
 */
export function useRecorder(stage: React.RefObject<Stage | null>, presentation: () => unknown, title: () => string, presentationId?: string) {
  const [state, setState] = useState<RecorderState>({ status: 'idle', seconds: 0 });
  const session = useRef<{ recorder: MediaRecorder; chunks: Blob[]; events: PerformEvent[]; t0: number; off: () => void; timer: number; snapshot: unknown } | null>(null);

  const start = useCallback(async (camera: boolean) => {
    const s = stage.current;
    if (!s || session.current) return;
    setState({ status: 'starting', seconds: 0 });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: camera ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } : false,
      });
    } catch (e) {
      setState({ status: 'idle', seconds: 0, error: `No access to the ${camera ? 'camera or microphone' : 'microphone'}: ${(e as Error).message}` });
      return;
    }
    const mimeType = MIME.filter((m) => camera || m.startsWith('audio')).find((m) => MediaRecorder.isTypeSupported(m));
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const t0 = performance.now();
    const at = () => (performance.now() - t0) / 1000;
    const events: PerformEvent[] = [{ t: 0, ...s.performState() }];
    const off = s.onPerform((e: PerformState) => events.push({ t: at(), ...e }));
    const timer = window.setInterval(() => setState((st) => ({ ...st, seconds: at() })), 250);
    session.current = { recorder, chunks, events, t0, off, timer, snapshot: presentation() };
    recorder.start(1000);
    setState({ status: 'recording', seconds: 0, stream });
  }, [stage, presentation]);

  const stop = useCallback(async () => {
    const r = session.current;
    if (!r) return;
    session.current = null;
    r.off();
    clearInterval(r.timer);
    const duration = (performance.now() - r.t0) / 1000;
    const stopped = new Promise((res) => (r.recorder.onstop = res));
    r.recorder.stop();
    r.recorder.stream.getTracks().forEach((t) => t.stop());
    await stopped;
    setState({ status: 'saving', seconds: duration });
    try {
      const name = `${title()} · ${new Date().toLocaleString()}`;
      const take = await fetch('/api/takes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, performance: { events: r.events, duration }, presentation: r.snapshot, presentationId }),
      }).then(ok);
      await fetch(`/api/takes/${take.id}/tracks/me?ext=webm&offset=0`, { method: 'PUT', body: new Blob(r.chunks, { type: r.recorder.mimeType }) }).then(ok);
      setState({ status: 'idle', seconds: 0, lastTake: { id: take.id, name } });
    } catch (e) {
      setState({ status: 'idle', seconds: 0, error: `Could not save the take (is the local server running?): ${(e as Error).message}` });
    }
  }, [title, presentationId]);

  useEffect(() => () => {
    const r = session.current;
    if (r) { r.off(); clearInterval(r.timer); r.recorder.stream.getTracks().forEach((t) => t.stop()); }
  }, []);

  return { state, start, stop };
}

async function ok(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body;
}
