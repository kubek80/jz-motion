import { useCallback, useEffect, useRef, useState } from 'react';
import type { Performance } from '../video/performance';

interface Track { name: string; file: string; offset: number; hasVideo: boolean; hasAudio: boolean; duration: number }
interface Take { id: string; name: string; created: string; performance: Performance; tracks: Track[] }
interface Job { id: string; status: 'running' | 'done' | 'failed'; done: number; total: number; file?: string; error?: string; started: number }

const api = async (url: string, init?: RequestInit) => {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body;
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** Takes (recordings), their tracks and offsets, and MP4 export. */
export function VideoPanel({ presentation, refreshKey }: { presentation: string; refreshKey: unknown }) {
  const [takes, setTakes] = useState<Take[] | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fps, setFps] = useState(30);
  const [scale, setScale] = useState(1);
  const [gap, setGap] = useState(1.5);
  const [asRecorded, setAsRecorded] = useState(true);
  const [job, setJob] = useState<Job | null>(null);
  const [newTrack, setNewTrack] = useState('friend');
  const poll = useRef<number>(0);

  const load = useCallback(async () => {
    try {
      setTakes(await api('/api/takes'));
      setError(null);
    } catch (e) {
      setTakes([]);
      setError(`Recording and export need the local server (npm run dev): ${(e as Error).message}`);
    }
  }, []);
  useEffect(() => void load(), [load, refreshKey]);
  useEffect(() => () => clearInterval(poll.current), []);

  const take = takes?.find((t) => t.id === selected);
  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const exportVideo = async () => {
    setError(null);
    try {
      const started: Job = await api('/api/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          presentation: JSON.parse(presentation), takeId: take?.id, useTakePresentation: asRecorded, fps, scale,
          timing: { lead: 0.8, gap, tail: 2 },
        }),
      });
      setJob(started);
      clearInterval(poll.current);
      poll.current = window.setInterval(async () => {
        const j: Job = await api(`/api/export/${started.id}`).catch(() => ({ ...started, status: 'failed', error: 'lost the export job' }));
        setJob(j);
        if (j.status !== 'running') clearInterval(poll.current);
      }, 1000);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const running = job?.status === 'running';
  const eta = job && job.done > 0 && running ? ((Date.now() - job.started) / job.done) * (job.total - job.done) / 1000 : null;

  return (
    <div className="video-panel">
      <section>
        <h3>Recording</h3>
        <p className="muted hint">Record in <b>Play</b> mode with <b>● Record</b>: your clicks set the timing, your camera and voice become the “me” track.</p>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">No recording: automatic timing</option>
          {(takes ?? []).map((t) => <option key={t.id} value={t.id}>{t.name} ({mmss(t.performance.duration)})</option>)}
        </select>
        {!take && (
          <label className="field"><span>pause between beats</span><input type="number" step="0.1" min="0" value={gap} onChange={(e) => setGap(Number(e.target.value))} /></label>
        )}
        {take && (
          <>
            <table className="tracks">
              <thead><tr><th>track</th><th>has</th><th>starts at (s)</th><th /></tr></thead>
              <tbody>
                {take.tracks.map((t) => (
                  <tr key={t.name}>
                    <td>{t.name}</td>
                    <td className="muted">{[t.hasVideo && 'video', t.hasAudio && 'sound'].filter(Boolean).join(' + ')} · {mmss(t.duration)}</td>
                    <td>
                      <input
                        type="number" step="0.01" defaultValue={t.offset.toFixed(2)} key={`${t.name}-${t.offset}`}
                        onBlur={(e) => Number(e.target.value) !== t.offset && act('offset', () => api(`/api/takes/${take.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ offsets: { [t.name]: Number(e.target.value) } }) }))}
                      />
                    </td>
                    <td className="row">
                      {t.name !== 'me' && t.hasAudio && (
                        <button title="Line this track up with “me” by matching the sound (a clap at the start helps)" disabled={!!busy} onClick={() => act('sync', () => api(`/api/takes/${take.id}/sync/${t.name}`, { method: 'POST' }))}>Auto-sync</button>
                      )}
                      <button className="danger" title="Remove track" onClick={() => confirm(`Remove track "${t.name}"?`) && act('remove', () => api(`/api/takes/${take.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ removeTracks: [t.name] }) }))}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row add-track">
              <input value={newTrack} onChange={(e) => setNewTrack(e.target.value.replace(/[^\w-]/g, ''))} placeholder="track name" />
              <label className="file">
                + add recording
                <input
                  type="file" accept="video/*,audio/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file || !newTrack) return;
                    const ext = (file.name.split('.').pop() ?? 'mp4').toLowerCase();
                    void act('upload', () => api(`/api/takes/${take.id}/tracks/${newTrack}?ext=${ext}&offset=0`, { method: 'PUT', body: file }));
                  }}
                />
              </label>
            </div>
            <label className="check"><input type="checkbox" checked={asRecorded} onChange={(e) => setAsRecorded(e.target.checked)} /> Use the presentation as it was when recorded (keeps the timing exact)</label>
            <button className="danger" onClick={() => confirm('Delete this take and its recordings?') && act('delete', async () => { await api(`/api/takes/${take.id}`, { method: 'DELETE' }); setSelected(''); })}>Delete take</button>
          </>
        )}
        <p className="muted hint">Layouts are set per beat or scene (properties: <b>layout</b>, <b>track</b>): board, pip, pip-left, camera, side.</p>
      </section>

      <section>
        <h3>Export</h3>
        <div className="row">
          <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
            <option value={1}>1080p</option>
            <option value={2}>4K</option>
          </select>
          <select value={fps} onChange={(e) => setFps(Number(e.target.value))}>
            <option value={30}>30 fps</option>
            <option value={60}>60 fps</option>
          </select>
          <button className="primary" disabled={running || !!busy || takes === null} onClick={exportVideo}>{running ? 'Exporting…' : 'Export MP4'}</button>
        </div>
        {job && (
          <div className="job">
            {running && (
              <>
                <progress max={job.total || 1} value={job.done} />
                <span className="muted">{job.total ? `frame ${job.done} / ${job.total}` : 'starting…'}{eta !== null ? ` · about ${mmss(eta)} left` : ''}</span>
              </>
            )}
            {job.status === 'done' && job.file && (
              <>
                <video src={`/exports/${job.file}`} controls className="preview" />
                <a href={`/exports/${job.file}`} download={job.file}>Download {job.file}</a>
              </>
            )}
            {job.status === 'failed' && <p className="error-text">{job.error}</p>}
          </div>
        )}
      </section>
      {busy && <p className="muted">Working: {busy}…</p>}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
