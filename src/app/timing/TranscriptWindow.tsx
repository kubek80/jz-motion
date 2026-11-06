// What you said, as text: transcribes narration clips (one, or every clip whose recording is here) and
// lays the words out under the beats they were said over. Copy it all or one beat at a time to paste
// anywhere, or put a beat's words straight into its speaker notes (the prompter). Transcripts are kept
// next to the recordings, so opening this again is instant.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Clip } from '../../engine/schema';
import type { Click } from '../../video/performance';
import { confirmDialog } from '../confirm';
import { TranscriberFields } from '../Settings';
import { loadTranscriber, saveTranscriber } from '../settingsStore';
import { fmt } from './format';

interface Segment { start: number; end: number; text: string }
interface Props {
  clips: Clip[];
  clicks: Click[];
  beatName: (c: Click) => string;
  notesOf: (c: Click) => string | undefined;
  onNotes: (scene: number, beat: number, notes: string) => void;
  seek: (t: number) => void;
  onClose: () => void;
}

/** A transcript line at its place on the timeline. */
interface Said { t: number; text: string }

export function TranscriptWindow({ clips, clicks, beatName, notesOf, onNotes, seek, onClose }: Props) {
  const [service, setService] = useState(loadTranscriber);
  const [byUpload, setByUpload] = useState<Record<string, Segment[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const ready = /^https?:\/\/.+/.test(service.baseURL) && !!service.model;
  /** Starts by itself only when it can work: a key is set, or the service runs on this computer. */
  const canStart = ready && (!!service.apiKey || /\/\/(localhost|127\.0\.0\.1)\b/.test(service.baseURL));

  const running = useRef(false);
  const run = async (again = false) => {
    if (running.current) return;
    running.current = true;
    setError(null);
    saveTranscriber(service);
    const uploads = [...new Set(clips.map((c) => c.upload))];
    const done: Record<string, Segment[]> = {};
    try {
      for (const [n, upload] of uploads.entries()) {
        setBusy(uploads.length > 1 ? `Transcribing recording ${n + 1} of ${uploads.length}…` : 'Transcribing…');
        const q = new URLSearchParams({ upload, baseURL: service.baseURL, model: service.model, ...(again ? { again: '1' } : {}) });
        const res = await fetch(`/api/transcribe?${q}`, { method: 'POST', headers: service.apiKey ? { 'x-api-key': service.apiKey } : {} });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? res.statusText);
        done[upload] = body.segments;
        setByUpload({ ...done });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      running.current = false;
      setBusy(null);
    }
  };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.confirm')) { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);
  // With a service set up, start straight away.
  useEffect(() => { if (canStart) void run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Each clip's part of its recording, placed where the clip sits on the timeline.
  const said = useMemo<Said[]>(() => clips.flatMap((c) => (byUpload[c.upload] ?? [])
    .filter((s) => s.end > c.trimStart + 0.05 && s.start < c.trimEnd - 0.05 && s.text)
    .map((s) => ({ t: c.offset + Math.max(0, s.start - c.trimStart), text: s.text }))).sort((a, b) => a.t - b.t), [clips, byUpload]);

  // Grouped under the beat playing when each line starts.
  const groups = useMemo(() => {
    const out: { click?: Click; lines: Said[] }[] = [];
    for (const s of said) {
      const click = [...clicks].reverse().find((c) => c.t <= s.t + 0.3);
      const last = out[out.length - 1];
      if (last && last.click === click) last.lines.push(s);
      else out.push({ click, lines: [s] });
    }
    return out;
  }, [said, clicks]);

  const textOf = (lines: Said[]) => lines.map((l) => l.text).join(' ');
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
    } catch {
      setError('The browser did not allow copying; select the text and copy it instead.');
    }
  };
  const useAsNotes = async (click: Click, text: string) => {
    const old = notesOf(click)?.trim();
    if (old && old !== text) {
      const ok = await confirmDialog({ title: `Replace the speaker notes of ${beatName(click)}?`, message: `They say: “${old.length > 160 ? `${old.slice(0, 160)}…` : old}”`, confirm: 'Replace' });
      if (!ok) return;
    }
    onNotes(click.scene, click.beat, text);
    setCopied(`notes:${click.scene}.${click.beat}`);
  };
  const all = groups.map((g) => `${g.click ? `${beatName(g.click)}\n` : ''}${textOf(g.lines)}`).join('\n\n');

  return (
    <div className="modal-back transcript-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal transcript-window" role="dialog" aria-labelledby="transcript-title">
        <div className="transcript-head">
          <h3 id="transcript-title">Transcript</h3>
          <span className="muted">{clips.length === 1 ? clips[0].name ?? 'one clip' : `${clips.length} clips`}</span>
          <span className="spacer" />
          {said.length > 0 && <button className="primary" onClick={() => void copy('all', all)}>{copied === 'all' ? 'Copied ✓' : 'Copy all'}</button>}
          {said.length > 0 && <button onClick={() => void run(true)} disabled={!!busy} title="Ask the service again (the kept transcript is replaced)">Transcribe again</button>}
          <button onClick={onClose} title="Close (Esc)">✕</button>
        </div>

        {!said.length && !busy && (
          <div className="transcript-setup">
            <p className="muted">Turns what you recorded into text, placed under the beats you said it over. Choose a speech-to-text service (it is remembered).</p>
            <TranscriberFields value={service} onChange={setService} />
            <button className="primary" disabled={!ready} onClick={() => void run()}>Transcribe</button>
          </div>
        )}
        {busy && <p className="busy-text">{busy}</p>}
        {error && <p className="error-text">{error}</p>}

        {said.length > 0 && (
          <ol className="transcript-groups">
            {groups.map((g, i) => {
              const key = g.click ? `${g.click.scene}.${g.click.beat}` : `before-${i}`;
              const text = textOf(g.lines);
              return (
                <li key={`${key}-${i}`}>
                  <div className="group-head">
                    <b>{g.click ? beatName(g.click) : 'Before the first beat'}</b>
                    <span className="spacer" />
                    <button className="small" onClick={() => void copy(key, text)}>{copied === key ? 'Copied ✓' : 'Copy'}</button>
                    {g.click && (
                      <button className="small" onClick={() => void useAsNotes(g.click!, text)} title="Put these words into this beat's speaker notes, which the prompter shows">
                        {copied === `notes:${key}` ? 'In the notes ✓' : 'Use as speaker notes'}
                      </button>
                    )}
                  </div>
                  <p>
                    {g.lines.map((l, j) => (
                      <span key={j} className="said" onClick={() => seek(l.t)} title={`At ${fmt(l.t)}: click to go there`}>{l.text} </span>
                    ))}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
