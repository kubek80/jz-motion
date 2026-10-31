import { useEffect, useRef, useState } from 'react';
import { generate, type GenerateResult } from '../ai/client';
import { loadProfiles, PRESETS, saveProfiles, type ModelProfile } from '../ai/profiles';
import { compile, Stage } from '../engine';

interface Run { profile: ModelProfile; status: 'running' | 'done'; result?: GenerateResult }

/** Generate a presentation (or change the current one) with one or more models and pick a result. */
export function AiPanel({ current, onUse }: { current: string; onUse: (json: string) => void }) {
  const [profiles, setProfiles] = useState<ModelProfile[]>(loadProfiles);
  const [editing, setEditing] = useState<ModelProfile | null>(null);
  const [request, setRequest] = useState('');
  const [mode, setMode] = useState<'new' | 'edit'>('new');
  const [runs, setRuns] = useState<Run[]>([]);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => saveProfiles(profiles), [profiles]);
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
        {profiles.length === 0 && <p className="muted">Add a model to generate with. Keys are kept in this browser only and sent only to that model's API, through your local dev server.</p>}
        <ul className="profiles">
          {profiles.map((p) => (
            <li key={p.id}>
              <label>
                <input type="checkbox" checked={p.enabled} onChange={(e) => setProfiles(profiles.map((x) => (x.id === p.id ? { ...x, enabled: e.target.checked } : x)))} />
                <span>{p.name}</span>
              </label>
              <span className="muted model-id">{p.model}</span>
              <button onClick={() => setEditing(p)}>Edit</button>
            </li>
          ))}
        </ul>
        {editing ? (
          <ProfileForm
            profile={editing}
            onSave={(p) => {
              setProfiles(profiles.some((x) => x.id === p.id) ? profiles.map((x) => (x.id === p.id ? p : x)) : [...profiles, p]);
              setEditing(null);
            }}
            onDelete={() => { setProfiles(profiles.filter((x) => x.id !== editing.id)); setEditing(null); }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <button className="add" onClick={() => setEditing({ id: crypto.randomUUID(), name: '', baseURL: PRESETS[0].baseURL, model: '', apiKey: '', enabled: true })}>+ add model</button>
        )}
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

/** Small board showing the end of the first scene. */
function Preview({ json }: { json: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const result = compile(JSON.parse(json));
    if (!result.ok || !host.current) return;
    const stage = new Stage(host.current);
    void stage.load(result.presentation, { scene: 0, beat: result.presentation.scenes[0].beats.length });
    return () => stage.destroy();
  }, [json]);
  return <div className="preview" ref={host} />;
}

function ProfileForm({ profile, onSave, onDelete, onCancel }: { profile: ModelProfile; onSave: (p: ModelProfile) => void; onDelete: () => void; onCancel: () => void }) {
  const [p, setP] = useState(profile);
  const preset = PRESETS.find((x) => x.baseURL === p.baseURL) ?? PRESETS.at(-1)!;
  const set = (patch: Partial<ModelProfile>) => setP({ ...p, ...patch });
  return (
    <div className="profile-form">
      <label className="field">
        <span>provider</span>
        <select
          value={preset.label}
          onChange={(e) => {
            const next = PRESETS.find((x) => x.label === e.target.value)!;
            set({ baseURL: next.baseURL, model: next.model || p.model });
          }}
        >
          {PRESETS.map((x) => <option key={x.label}>{x.label}</option>)}
        </select>
      </label>
      <p className="muted hint">{preset.hint}</p>
      <label className="field"><span>base URL</span><input value={p.baseURL} onChange={(e) => set({ baseURL: e.target.value })} /></label>
      <label className="field"><span>model</span><input value={p.model} placeholder="vendor/model-name" onChange={(e) => set({ model: e.target.value })} /></label>
      <label className="field"><span>API key</span><input type="password" value={p.apiKey} autoComplete="off" onChange={(e) => set({ apiKey: e.target.value })} /></label>
      <label className="field"><span>name</span><input value={p.name} placeholder={p.model || 'shown in results'} onChange={(e) => set({ name: e.target.value })} /></label>
      <div className="row">
        <button className="primary" disabled={!p.model || !p.baseURL} onClick={() => onSave({ ...p, name: p.name || p.model })}>Save</button>
        <button onClick={onCancel}>Cancel</button>
        <button className="danger" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}
