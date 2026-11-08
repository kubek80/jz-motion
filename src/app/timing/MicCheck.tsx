import { useEffect, useRef, useState } from 'react';
import { log } from '../debug';
import { setMicDevice } from './micDevice';
import type { MicLevel } from './useMicLevel';

// "Check the microphone": pick the input, watch the level while you speak and turn the dial on your interface
// or microphone until the peaks sit in the green, then record five seconds and listen to it.

/** Where a speaking voice's peaks should sit, in dBFS. */
export const ZONES = [
  { to: -30, label: 'too quiet', tone: 'low' },
  { to: -18, label: 'a bit quiet', tone: 'warn' },
  { to: -6, label: 'good', tone: 'good' },
  { to: -3, label: 'a bit loud', tone: 'warn' },
  { to: 0, label: 'too loud', tone: 'bad' },
] as const;

export function advice(peak: number, clipped: boolean): { text: string; tone: string } {
  if (clipped) return { text: 'It distorts: it reached 0 dB. Turn the gain down.', tone: 'bad' };
  if (peak < -50) return { text: 'Say a sentence as you would when recording.', tone: 'low' };
  if (peak < -30) return { text: 'Too quiet: turn the gain up (or move closer).', tone: 'low' };
  if (peak < -18) return { text: 'A bit quiet: turn the gain up a little.', tone: 'warn' };
  if (peak <= -6) return { text: 'Good: your peaks are in the green.', tone: 'good' };
  if (peak <= -3) return { text: 'A bit loud: turn the gain down a little.', tone: 'warn' };
  return { text: 'Too loud: turn the gain down.', tone: 'bad' };
}

const pct = (dbfs: number) => `${Math.max(0, Math.min(100, ((dbfs + 60) / 60) * 100))}%`;

export function LevelMeter({ mic }: { mic: MicLevel }) {
  return (
    <div className="level-meter" title="Your voice's level now (bar) and its recent peak (line). Peaks should sit in the green.">
      {ZONES.map((z, i) => <span key={z.label} className={`zone ${z.tone}`} style={{ left: pct(i ? ZONES[i - 1].to : -60), width: `calc(${pct(z.to)} - ${pct(i ? ZONES[i - 1].to : -60)})` }} />)}
      <span className="fill" style={{ width: pct(mic.level) }} />
      <span className="peak" style={{ left: pct(mic.peak) }} />
      <span className="scale">{[-60, -30, -18, -6, 0].map((d) => <b key={d} style={{ left: pct(d) }}>{d}</b>)}</span>
    </div>
  );
}

export function MicCheck({ mic, onDevice }: { mic: MicLevel; onDevice: (id: string | undefined) => void }) {
  const a = advice(mic.peak, mic.clipped);
  const [test, setTest] = useState<{ state: 'idle' | 'recording' | 'ready'; url?: string; left?: number; note?: string; bad?: boolean }>({ state: 'idle' });
  const timer = useRef<number | undefined>(undefined);
  const recorder = useRef<MediaRecorder | null>(null);
  // The previous test's sound is let go when a new one replaces it; the countdown is only stopped by the test
  // itself or when the window closes (letting go of the old sound used to stop the new countdown too).
  useEffect(() => () => { if (test.url) URL.revokeObjectURL(test.url); }, [test.url]);
  useEffect(() => () => { window.clearInterval(timer.current); if (recorder.current?.state === 'recording') recorder.current.stop(); }, []);

  const stopTest = () => {
    window.clearInterval(timer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
  };
  const recordTest = () => {
    if (!mic.stream || recorder.current?.state === 'recording') return;
    const track = mic.stream.getAudioTracks()[0];
    if (!track || track.readyState !== 'live') {
      setTest({ state: 'idle', note: 'The microphone is not giving sound (its input ended): pick it again above, or close and reopen this window.', bad: true });
      return;
    }
    let rec: MediaRecorder;
    try { rec = new MediaRecorder(mic.stream); } catch (e) { setTest({ state: 'idle', note: `The browser can't record from it: ${(e as Error).message}`, bad: true }); return; }
    recorder.current = rec;
    const chunks: Blob[] = [];
    const started = performance.now();
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onerror = (e) => setTest({ state: 'idle', note: `Recording failed: ${(e as unknown as { error?: Error }).error?.message ?? 'unknown error'}`, bad: true });
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      const secs = (performance.now() - started) / 1000;
      log('micTest', { bytes: blob.size, chunks: chunks.length, secs, type: rec.mimeType, track: track.readyState, muted: track.muted, label: track.label });
      // A few hundred bytes is just the file's header: no sound came through.
      if (blob.size < 2000) setTest({ state: 'idle', note: `Nothing came through from "${track.label || 'the microphone'}"${track.muted ? ' (it is muted)' : ''}: check that it is not muted or used by another app, pick it again above, or reload the page.`, bad: true });
      else setTest({ state: 'ready', url: URL.createObjectURL(blob), note: `Recorded ${secs.toFixed(1)} s (${Math.round(blob.size / 1024)} KB). Listen:` });
    };
    // In small pieces as it goes (more reliable than one piece at the end).
    rec.start(250);
    let left = 5;
    setTest({ state: 'recording', left });
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      left -= 1;
      if (left <= 0) stopTest(); else setTest({ state: 'recording', left });
    }, 1000);
  };

  return (
    <div className="mic-check">
      <label className="field">
        <span>microphone</span>
        <select value={mic.device ?? ''} onChange={(e) => { setMicDevice(e.target.value || undefined); onDevice(e.target.value || undefined); }}>
          {!mic.devices.length && <option value="">default</option>}
          {mic.devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `microphone ${i + 1}`}</option>)}
        </select>
      </label>
      {mic.error ? <p className="note-text">{mic.error}</p> : (
        <>
          <LevelMeter mic={mic} />
          <p className={`mic-advice ${a.tone}`}>{a.text}</p>
        </>
      )}
      <div className="row">
        <button onClick={test.state === 'recording' ? stopTest : recordTest} disabled={!mic.stream} className={test.state === 'recording' ? 'rec-btn on' : ''} title={test.state === 'recording' ? 'Stop the test now' : 'Record five seconds and listen to how you sound'}>
          {test.state === 'recording' ? `■ Stop (${test.left} s left)` : test.state === 'ready' ? '● Record another 5 s test' : '● Record a 5 s test'}
        </button>
        {test.note && <span className={test.bad ? 'note-text' : 'muted'}>{test.note}</span>}
        {test.state === 'ready' && test.url && <audio key={test.url} controls src={test.url} />}
      </div>
      <p className="muted hint">Recording narration uses this microphone too. The video evens out the overall volume, so aim for peaks in the green rather than as loud as possible.</p>
    </div>
  );
}
