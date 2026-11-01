import { useState } from 'react';
import { scriptRequest, transcriptRequest, type Segment } from '../ai/assistant';
import { Chat } from './Chat';
import { Preview } from './Preview';

const TRANSCRIBERS = [
  { label: 'OpenAI (whisper-1)', baseURL: 'https://api.openai.com/v1', model: 'whisper-1' },
  { label: 'Groq (whisper-large-v3)', baseURL: 'https://api.groq.com/openai/v1', model: 'whisper-large-v3' },
  { label: 'Local mock (no key)', baseURL: 'http://localhost:5199/v1', model: 'mock' },
  { label: 'Custom', baseURL: 'https://', model: '' },
];
const KEY = 'jzm.transcriber';
const loadTranscriber = (): { baseURL: string; model: string; apiKey: string } => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '') ;
  } catch {
    return { baseURL: TRANSCRIBERS[0].baseURL, model: TRANSCRIBERS[0].model, apiKey: '' };
  }
};

export interface RecordingSource { upload: string; duration: number }

interface Props {
  kind: 'script' | 'recording';
  onClose: () => void;
  /** Creates the presentation (and, from a recording, its take). */
  onCreate: (json: string, recording?: RecordingSource) => Promise<void>;
}

/** Make a presentation with a model: from a pasted script, or from a recording's transcript. Refine it in chat, then create it. */
export function CreateWithAi({ kind, onClose, onCreate }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [service, setService] = useState(loadTranscriber);
  const [file, setFile] = useState<File | null>(null);
  const [recording, setRecording] = useState<(RecordingSource & { segments: Segment[] }) | null>(null);

  const transcribe = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem(KEY, JSON.stringify(service));
    } catch {
      // ignore
    }
    try {
      const ext = (file.name.split('.').pop() ?? 'webm').toLowerCase();
      const q = new URLSearchParams({ baseURL: service.baseURL, model: service.model, ext });
      const res = await fetch(`/api/transcribe?${q}`, { method: 'POST', headers: service.apiKey ? { 'x-api-key': service.apiKey } : {}, body: file });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      setRecording(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await onCreate(draft, recording ?? undefined);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const scenes = (() => {
    try {
      return draft ? JSON.parse(draft).scenes.length : 0;
    } catch {
      return 0;
    }
  })();

  const ready = kind === 'script' || recording;

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal tall wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{kind === 'script' ? 'New presentation from a script' : 'New presentation from a recording'}</h2>
          <button onClick={onClose} title="Close">✕</button>
        </div>
        {kind === 'recording' && !recording && (
          <div className="recording-step">
            <p className="muted">The recording is transcribed, then a model turns it into a presentation whose beats play when you say them. The recording becomes the presentation's first take, ready to export.</p>
            <label className="file big">
              {file ? `${file.name} (${(file.size / 1e6).toFixed(1)} MB)` : 'Choose a recording (video or audio)…'}
              <input type="file" accept="video/*,audio/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <label className="field">
              <span>transcription</span>
              <select
                value={TRANSCRIBERS.find((t) => t.baseURL === service.baseURL)?.label ?? 'Custom'}
                onChange={(e) => {
                  const t = TRANSCRIBERS.find((x) => x.label === e.target.value)!;
                  setService({ ...service, baseURL: t.baseURL, model: t.model || service.model });
                }}
              >
                {TRANSCRIBERS.map((t) => <option key={t.label}>{t.label}</option>)}
              </select>
            </label>
            <label className="field"><span>base URL</span><input value={service.baseURL} onChange={(e) => setService({ ...service, baseURL: e.target.value })} /></label>
            <label className="field"><span>model</span><input value={service.model} onChange={(e) => setService({ ...service, model: e.target.value })} /></label>
            <label className="field"><span>API key</span><input type="password" autoComplete="off" value={service.apiKey} onChange={(e) => setService({ ...service, apiKey: e.target.value })} /></label>
            <button className="primary" disabled={!file || busy} onClick={() => void transcribe()}>{busy ? 'Uploading and transcribing…' : 'Transcribe'}</button>
          </div>
        )}
        {ready && (
          <div className="create-body">
            <div className="create-chat">
              {recording && (
                <details className="transcript">
                  <summary>Transcript: {recording.segments.length} sentences, {Math.round(recording.duration)} s</summary>
                  <ul>{recording.segments.map((s, i) => <li key={i}><span className="muted">[{s.start.toFixed(1)}]</span> {s.text}</li>)}</ul>
                </details>
              )}
              <Chat
                current={draft}
                onPresentation={setDraft}
                wrapFirst={kind === 'script' ? scriptRequest : (extra) => `${transcriptRequest(recording!.segments)}\n\n${extra}`}
                placeholder={kind === 'script' ? 'Paste your script here, then Send. Afterwards, ask for changes.' : 'Anything to add? (e.g. "use the NVIDIA and Apple logos")'}
                intro={kind === 'script'
                  ? 'Paste your script and send it. The model turns it into scenes and beats, with your lines as speaker notes. Then ask for changes until you like it.'
                  : 'Send to make the presentation from the transcript (add instructions if you like), then ask for changes.'}
                initialInput={kind === 'recording' ? 'Make the presentation from this recording.' : undefined}
              />
            </div>
            <div className="create-side">
              {draft ? <Preview json={draft} className="preview" /> : <div className="preview empty muted">The presentation appears here</div>}
              {draft && <span className="muted">{scenes} scene{scenes === 1 ? '' : 's'}</span>}
              <button className="primary" disabled={!draft || busy} onClick={() => void create()}>{busy ? 'Creating…' : 'Create presentation'}</button>
            </div>
          </div>
        )}
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
