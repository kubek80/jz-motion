import { useEffect, useState } from 'react';
import { loadProfiles, PRESETS, saveProfiles, type ModelProfile } from '../ai/profiles';

/** The models to work with (any OpenAI-compatible endpoint): add, edit, tick the ones to use. */
export function ModelsEditor({ onChange }: { onChange?: (profiles: ModelProfile[]) => void }) {
  const [profiles, setProfiles] = useState<ModelProfile[]>(loadProfiles);
  const [editing, setEditing] = useState<ModelProfile | null>(null);
  useEffect(() => {
    saveProfiles(profiles);
    onChange?.(profiles);
  }, [profiles]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="models">
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
    </div>
  );
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
