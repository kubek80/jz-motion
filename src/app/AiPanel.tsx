import { useRef, useState } from 'react';
import { generate, type GenerateResult } from '../ai/client';
import { loadProfiles, type ModelProfile } from '../ai/profiles';
import { Chat, type ChatMessageView } from './Chat';
import { ModelsEditor } from './ModelsEditor';
import { Preview } from './Preview';

interface Run { profile: ModelProfile; status: 'running' | 'done'; result?: GenerateResult }

/** Generate a presentation (or change the current one) with several models side by side and pick a result. */
export function ComparePanel({ current, onUse }: { current: string; onUse: (json: string) => void }) {
  const [profiles, setProfiles] = useState<ModelProfile[]>(loadProfiles);
  const [request, setRequest] = useState('');
  const [mode, setMode] = useState<'new' | 'edit'>('new');
  const [runs, setRuns] = useState<Run[]>([]);
  const abort = useRef<AbortController | null>(null);

  const enabled = profiles.filter((p) => p.enabled);
  const running = runs.some((r) => r.status === 'running');

  const start = () => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setRuns(enabled.map((profile) => ({ profile, status: 'running' })));
    enabled.forEach((profile) => {
      void generate(profile, request, mode, current, { signal: ctrl.signal }).then((result) => {
        if (ctrl.signal.aborted) return;
        setRuns((rs) => rs.map((r) => (r.profile.id === profile.id ? { ...r, status: 'done', result } : r)));
      });
    });
  };

  return (
    <div className="ai-panel">
      <section>
        <h3>Models</h3>
        <ModelsEditor onChange={setProfiles} />
      </section>

      <section>
        <h3>Ask</h3>
        <div className="toggle small">
          <button className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>New presentation</button>
          <button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>Change current</button>
        </div>
        <textarea
          rows={5}
          value={request}
          placeholder={mode === 'new' ? 'e.g. How RAG works: a user asks, we embed the question, search a vector DB, and the LLM answers with the found documents. 2 scenes.' : 'e.g. Add a beat at the end that zooms into the database and circles it.'}
          onChange={(e) => setRequest(e.target.value)}
        />
        <button className="primary" disabled={!request.trim() || !enabled.length || running} onClick={start}>
          {running ? 'Generating…' : `Generate with ${enabled.length} model${enabled.length === 1 ? '' : 's'}`}
        </button>
      </section>

      {runs.length > 0 && (
        <section>
          <h3>Results</h3>
          {runs.map((r) => <ResultCard key={r.profile.id} run={r} onUse={onUse} />)}
        </section>
      )}
    </div>
  );
}

function ResultCard({ run, onUse }: { run: Run; onUse: (json: string) => void }) {
  const r = run.result;
  const json = r?.presentation ? JSON.stringify(r.presentation, null, 2) : undefined;
  return (
    <div className={`result ${r ? (r.ok ? 'ok' : 'bad') : ''}`}>
      <div className="result-head">
        <strong>{run.profile.name}</strong>
        <span className="muted">
          {run.status === 'running' ? 'working…' : `${(r!.ms / 1000).toFixed(1)}s · ${r!.attempts} ${r!.attempts === 1 ? 'try' : 'tries'} · ${r!.usage.prompt + r!.usage.completion} tokens${r!.usage.cost !== undefined ? ` · $${r!.usage.cost.toFixed(4)}` : ''}`}
        </span>
      </div>
      {r?.ok && json && <Preview json={json} />}
      {r && !r.ok && (
        <details>
          <summary>{r.errors.length} problem{r.errors.length === 1 ? '' : 's'}</summary>
          <ul className="errors">{r.errors.slice(0, 20).map((e) => <li key={e}>{e}</li>)}</ul>
        </details>
      )}
      {json && (
        <button onClick={() => onUse(json)} title={r?.ok ? 'Replace the current presentation (undo brings it back)' : 'Load it anyway and fix the errors by hand'}>
          {r?.ok ? 'Use this' : 'Use anyway'}
        </button>
      )}
    </div>
  );
}

/** The AI tab: a conversation that edits the presentation, or several models compared on one request. */
export function AiPanel({ current, scene, onUse, chat, onChat }: {
  current: string;
  scene: number;
  onUse: (json: string) => void;
  chat: ChatMessageView[];
  onChat: (m: ChatMessageView[]) => void;
}) {
  const [tab, setTab] = useState<'chat' | 'compare'>('chat');
  return (
    <div className="ai-wrap">
      <div className="toggle small ai-tabs">
        <button className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>Chat</button>
        <button className={tab === 'compare' ? 'on' : ''} onClick={() => setTab('compare')}>Compare models</button>
      </div>
      {tab === 'chat'
        ? <Chat current={current} scene={scene} onPresentation={onUse} initial={chat} onMessages={onChat} />
        : <ComparePanel current={current} onUse={onUse} />}
    </div>
  );
}
