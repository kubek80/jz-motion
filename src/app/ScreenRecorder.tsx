import { useEffect, useRef, useState } from 'react';
import { addMedia, formatBytes, formatDuration, type MediaEntry } from './media';

// "Record screen" in the Media view: the browser's own picker (a window, a tab or the whole screen), a short
// countdown, Stop, then a quick trim before the recording goes into the media library (converted to WebM there).
// Pictures only, no sound: narration is recorded in the Timing window.

type Phase =
  | { at: 'ready' }
  | { at: 'countdown'; n: number }
  | { at: 'recording'; since: number }
  | { at: 'review'; blob: Blob; url: string; duration: number }
  | { at: 'saving' };

const COUNTDOWN = 3;

/** The best recording format this browser offers: WebM (Chrome, Edge, Firefox), else MP4 (Safari). */
function pickFormat(): { mimeType: string; ext: string } {
  for (const mimeType of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']) {
    if (MediaRecorder.isTypeSupported(mimeType)) return { mimeType, ext: mimeType.startsWith('video/mp4') ? 'mp4' : 'webm' };
  }
  return { mimeType: '', ext: 'webm' };
}

export function ScreenRecorder({ onSaved, onClose }: { onSaved: (entry: MediaEntry) => void; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ at: 'ready' });
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [trim, setTrim] = useState({ start: 0, end: 0 });
  const [now, setNow] = useState(0);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const format = useRef(pickFormat());

  const stopSharing = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  // Leaving the window stops the capture and frees the preview.
  useEffect(() => () => {
    const r = recorder.current;
    if (r?.state === 'recording') {
      r.onstop = null;
      r.stop();
    }
    stopSharing();
  }, []);
  useEffect(() => () => { if (phase.at === 'review') URL.revokeObjectURL(phase.url); }, [phase]);

  // While recording, the tab's title shows it (you are usually looking at another window).
  useEffect(() => {
    if (phase.at !== 'recording') return;
    const title = document.title;
    const tick = () => {
      const s = (performance.now() - phase.since) / 1000;
      setNow(s);
      document.title = `● Recording ${formatDuration(s)}`;
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => { clearInterval(timer); document.title = title; };
  }, [phase]);

  // Esc: stop a recording, or close; never the Library window behind this one.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as HTMLElement).closest('input')) return;
      e.stopImmediatePropagation();
      if (phase.at === 'recording') recorder.current?.stop();
      else if (phase.at !== 'saving') onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [phase, onClose]);

  const start = async () => {
    setError(null);
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
    } catch (e) {
      if ((e as Error).name !== 'NotAllowedError') setError((e as Error).message);
      return;
    }
    stream.current = media;
    // "Stop sharing" in the browser's own bar ends the recording too.
    media.getVideoTracks()[0].addEventListener('ended', () => recorder.current?.state === 'recording' && recorder.current.stop());
    for (let n = COUNTDOWN; n > 0; n--) {
      setPhase({ at: 'countdown', n });
      await new Promise((r) => setTimeout(r, 1000));
      if (!stream.current) return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(media, { ...(format.current.mimeType ? { mimeType: format.current.mimeType } : {}), videoBitsPerSecond: 8_000_000 });
    recorder.current = rec;
    const since = performance.now();
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      stopSharing();
      const duration = (performance.now() - since) / 1000;
      const blob = new Blob(chunks, { type: rec.mimeType || format.current.mimeType });
      setTrim({ start: 0, end: duration });
      setPhase({ at: 'review', blob, url: URL.createObjectURL(blob), duration });
    };
    rec.start(1000);
    setPhase({ at: 'recording', since });
  };

  const cancelCountdown = () => {
    stopSharing();
    setPhase({ at: 'ready' });
  };

  const keep = async () => {
    if (phase.at !== 'review') return;
    const { blob, duration } = phase;
    setPhase({ at: 'saving' });
    try {
      const entry = await addMedia(blob, `screen-recording.${format.current.ext}`, name.trim() || `Screen recording ${new Date().toLocaleString()}`, {
        start: trim.start > 0.05 ? trim.start : undefined,
        end: trim.end < duration - 0.05 ? trim.end : undefined,
      });
      onSaved(entry);
    } catch (e) {
      setError(`Could not save it: ${(e as Error).message}`);
      setPhase(phase);
    }
  };

  // A recording made in the browser doesn't know its own length until the player has looked at its end.
  const onMetadata = () => {
    const v = video.current;
    if (!v || Number.isFinite(v.duration)) return;
    v.currentTime = 1e6;
    v.addEventListener('timeupdate', () => { v.currentTime = 0; }, { once: true });
  };
  const seek = (t: number) => { if (video.current) video.current.currentTime = t; };
  const kept = trim.end - trim.start;

  return (
    <div className="modal-back recorder-back">
      <div className="modal recorder" role="dialog" aria-labelledby="recorder-title">
        <div className="recorder-head">
          <h3 id="recorder-title">Record screen</h3>
          <span className="spacer" />
          {phase.at !== 'recording' && phase.at !== 'saving' && <button onClick={onClose} title="Close (Esc)">✕</button>}
        </div>

        {phase.at === 'ready' && (
          <div className="recorder-ready">
            <p>Choose a window, a browser tab or the whole screen. After a {COUNTDOWN}-second countdown, everything on it is recorded until you press <b>Stop</b> here, or <b>Stop sharing</b> in the browser's bar.</p>
            <p className="muted">Pictures only, no sound: record the narration in the Timing window. You can trim the start and end before keeping it.</p>
            <button className="primary" onClick={() => void start()}>Choose what to record…</button>
          </div>
        )}

        {phase.at === 'countdown' && (
          <div className="recorder-countdown">
            <span className="count">{phase.n}</span>
            <p className="muted">Switch to what you're recording; it starts in a moment.</p>
            <button onClick={cancelCountdown}>Cancel</button>
          </div>
        )}

        {phase.at === 'recording' && (
          <div className="recorder-live">
            <span className="dot" /> <span>Recording</span> <span className="elapsed">{formatDuration(now)}</span>
            <span className="spacer" />
            <button className="danger solid" onClick={() => recorder.current?.stop()}>Stop</button>
          </div>
        )}

        {(phase.at === 'review' || phase.at === 'saving') && (
          <div className="recorder-review">
            {phase.at === 'review' && (
              <>
                <video ref={video} src={phase.url} controls muted onLoadedMetadata={onMetadata} />
                <div className="recorder-trim">
                  <label>Start <input type="range" min={0} max={phase.duration} step={0.1} value={trim.start}
                    onChange={(e) => { const s = Math.min(Number(e.target.value), trim.end - 0.5); setTrim({ ...trim, start: Math.max(0, s) }); seek(Math.max(0, s)); }} />
                    <span>{formatDuration(trim.start)}</span></label>
                  <label>End <input type="range" min={0} max={phase.duration} step={0.1} value={trim.end}
                    onChange={(e) => { const s = Math.max(Number(e.target.value), trim.start + 0.5); setTrim({ ...trim, end: Math.min(phase.duration, s) }); seek(Math.min(phase.duration, s)); }} />
                    <span>{formatDuration(trim.end)}</span></label>
                  <p className="muted">Keeps {formatDuration(kept)} of {formatDuration(phase.duration)} ({formatBytes(phase.blob.size)} before converting).</p>
                </div>
                <label className="recorder-name">Name <input value={name} placeholder="What it shows, e.g. “Recolouring a box”" onChange={(e) => setName(e.target.value)} /></label>
              </>
            )}
            {phase.at === 'saving' && <p className="busy-text">Converting and adding to the media library…</p>}
            <div className="recorder-actions">
              <button disabled={phase.at === 'saving'} onClick={() => setPhase({ at: 'ready' })}>Record again</button>
              <span className="spacer" />
              <button disabled={phase.at === 'saving'} onClick={onClose}>Discard</button>
              <button className="primary" disabled={phase.at === 'saving'} onClick={() => void keep()}>Keep</button>
            </div>
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
