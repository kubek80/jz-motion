import { useEffect, useRef, useState } from 'react';

// A voice sample from a recording you already have (a guest's interview, a podcast episode, a video of them talking),
// instead of recording one at the microphone: choose the file, find 30 s of them talking alone and clearly, listen,
// use it. Only those 30 s are kept (as sound, uploads/voice-sample-*.webm): the file itself stays on your computer.

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function VoiceFromFile({ busy, onSample }: { busy: boolean; onSample: (sample: { upload: string; duration: number; name: string }) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [length, setLength] = useState(0);
  const [start, setStart] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const player = useRef<HTMLAudioElement>(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  // The preview stops at the end of the 30 s.
  useEffect(() => {
    const a = player.current;
    if (!a) return;
    const stop = () => { if (a.currentTime >= start + 30) a.pause(); };
    a.addEventListener('timeupdate', stop);
    return () => a.removeEventListener('timeupdate', stop);
  }, [start, url]);

  const choose = (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setFile(f);
    setStart(0);
    setLength(0);
    setUrl(URL.createObjectURL(f));
  };
  const listen = () => { const a = player.current; if (a) { a.currentTime = start; void a.play(); } };
  const use = async () => {
    if (!file) return;
    setSending(true);
    setError(null);
    try {
      const ext = (/\.(\w+)$/.exec(file.name)?.[1] ?? 'webm').toLowerCase();
      const res = await fetch(`/api/my-voice/from-file?ext=${ext}&start=${start}`, { method: 'POST', body: file });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? res.statusText);
      await onSample({ upload: j.upload, duration: j.duration, name: `${file.name} · from ${fmt(start)}` });
      setFile(null);
      setUrl(null);
    } catch (e) { setError((e as Error).message); } finally { setSending(false); }
  };

  return (
    <section className="voice-from-file">
      <h4>Or use a recording you have</h4>
      <p className="muted hint">For a guest: an interview, a podcast or a video of them talking (any sound or video file). Pick 30 s where they talk on their own, clearly, without music; only those 30 s are kept.</p>
      <div className="row wrap">
        <label className="file-pick">
          <input type="file" accept="audio/*,video/*" onChange={(e) => choose(e.target.files?.[0])} disabled={sending || busy} />
          <span className="button-like">📁 Choose a recording…</span>
        </label>
        {file && <span className="muted">{file.name}{length ? ` · ${fmt(length)}` : ''}</span>}
      </div>
      {url && (
        <>
          <audio ref={player} src={url} controls onLoadedMetadata={(e) => setLength(e.currentTarget.duration || 0)} />
          {length > 30 && (
            <label className="field">
              <span>from</span>
              <input type="range" min={0} max={Math.max(0, length - 30)} step={0.5} value={start} onChange={(e) => setStart(Number(e.target.value))} />
              <span className="muted">{fmt(start)} – {fmt(Math.min(length, start + 30))}</span>
            </label>
          )}
          <div className="row">
            <button onClick={listen} title="Play these 30 s">▶ Listen to these 30 s</button>
            <button className="primary" onClick={() => void use()} disabled={sending || busy}>{sending ? 'Keeping the 30 s…' : 'Use as the voice'}</button>
            {length > 0 && length < 10 && <span className="muted">short: 20–30 s copies better</span>}
          </div>
        </>
      )}
      {error && <p className="note-text">{error}</p>}
    </section>
  );
}
