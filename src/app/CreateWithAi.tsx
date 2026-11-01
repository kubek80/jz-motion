import { useEffect, useRef, useState } from 'react';
import { scriptRequest, transcriptRequest, type Segment } from '../ai/assistant';
import { Chat } from './Chat';
import { Preview } from './Preview';
import { TranscriberFields } from './Settings';
import { loadTranscriber, saveTranscriber, type StartMode } from './settingsStore';

export interface RecordingSource { upload: string; duration: number }

interface Props {
  kind: StartMode;
  onClose: () => void;
  /** From the home screen's prompt box: what was typed, the attached recording, the chosen model. */
  initialText?: string;
  initialFile?: File;
  modelId?: string;
  /** Creates the presentation (and, from a recording, its take). */
  onCreate: (json: string, recording?: RecordingSource) => Promise<void>;
}

/** Make a presentation with a model: from a pasted script, or from a recording's transcript. Refine it in chat, then create it. */
export function CreateWithAi({ kind, onClose, onCreate, initialText, initialFile, modelId }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [service, setService] = useState(loadTranscriber);
  // A recording attached on the home screen is transcribed straight away.
  const started = useRef(false);
  useEffect(() => {
    if (initialFile && !started.current) {
      started.current = true;
      void transcribe();
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [recording, setRecording] = useState<(RecordingSource & { segments: Segment[] }) | null>(null);

  const transcribe = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    saveTranscriber(service);
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

  const ready = kind !== 'recording' || recording;
  const titles: Record<StartMode, string> = { topic: 'New presentation', script: 'New presentation from a script', recording: 'New presentation from a recording' };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal tall wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{titles[kind]}</h2>
          <button onClick={onClose} title="Close">✕</button>
        </div>
        {kind === 'recording' && !recording && (
          <div className="recording-step">
            <p className="muted">The recording is transcribed, then a model turns it into a presentation whose beats play when you say them. The recording becomes the presentation's first take, ready to export.</p>
            <label className="file big">
              {file ? `${file.name} (${(file.size / 1e6).toFixed(1)} MB)` : 'Choose a recording (video or audio)…'}
              <input type="file" accept="video/*,audio/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <TranscriberFields value={service} onChange={setService} />
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
                initialModelId={modelId}
                task={`from-${kind}`}
                wrapFirst={kind === 'script' ? scriptRequest : kind === 'topic' ? (t) => `Make a presentation about: ${t}` : (extra) => `${transcriptRequest(recording!.segments)}\n\n${extra}`}
                placeholder={kind === 'script' ? 'Paste your script here, then Send. Afterwards, ask for changes.' : kind === 'topic' ? 'What should it explain?' : 'Anything to add? (e.g. "use the NVIDIA and Apple logos")'}
                intro={kind === 'script'
                  ? 'Paste your script and send it. The model turns it into scenes and beats, with your lines as speaker notes. Then ask for changes until you like it.'
                  : kind === 'topic' ? 'Describe what to explain; then ask for changes until you like it.'
                    : 'Send to make the presentation from the transcript (add instructions if you like), then ask for changes.'}
                initialInput={kind === 'recording' ? initialText || 'Make the presentation from this recording.' : initialText}
                autoSend={!!initialText || (kind === 'recording' && !!initialFile)}
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
