import { useState } from 'react';
import { askJson, type AskResult } from '../ai/client';
import { checkDrawing, CLIPART_RULES, drawingMessages, ICON_RULES, type DrawingKind } from '../ai/iconPrompt';
import { loadProfiles, type ModelProfile } from '../ai/profiles';
import { icons, type IconDef } from '../engine/library';
import { IconPreview } from './editor/IconPreview';
import { ModelsEditor } from './ModelsEditor';
import { saveToLibrary } from './userLibrary';

interface Run { profile: ModelProfile; result?: AskResult<IconDef> }

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^(\d)/, 'x$1');

/** Describe an icon or clipart; models draw it under the shown rules; save the one you like to the library. */
export function IconCreator({ onClose, onSaved }: { onClose: () => void; onSaved: (name: string) => void }) {
  const [kind, setKind] = useState<DrawingKind>('icon');
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [profiles, setProfiles] = useState<ModelProfile[]>(loadProfiles);
  const [managing, setManaging] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const enabled = profiles.filter((p) => p.enabled);
  const running = runs.some((r) => !r.result);
  const finalName = slug(name || description.split(/\s+/).slice(0, 3).join(' '));
  const taken = !!finalName && finalName in icons;

  const generate = () => {
    setError(null);
    setRuns(enabled.map((profile) => ({ profile })));
    for (const profile of enabled) {
      void askJson(profile, drawingMessages(kind, description), checkDrawing(kind)).then((result) => {
        setRuns((rs) => rs.map((r) => (r.profile.id === profile.id ? { ...r, result } : r)));
      });
    }
  };

  const save = async (def: IconDef) => {
    try {
      await saveToLibrary(finalName, def);
      onSaved(finalName);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>New {kind} with AI</h2>
          <button onClick={onClose} title="Close">✕</button>
        </div>
        <div className="toggle small">
          <button className={kind === 'icon' ? 'on' : ''} onClick={() => setKind('icon')} title="Single-colour line icon on a 24×24 grid, takes the element's colour">Icon</button>
          <button className={kind === 'clipart' ? 'on' : ''} onClick={() => setKind('clipart')} title="Multi-colour drawing in the marker colours">Clipart</button>
        </div>
        <textarea
          rows={3}
          value={description}
          placeholder={kind === 'icon' ? 'e.g. a vector database: a cylinder with three small dots connected by lines on its front' : 'e.g. a friendly robot holding a glowing GPU card, cyan body, pink GPU'}
          onChange={(e) => setDescription(e.target.value)}
        />
        <label className="field"><span>name</span><input value={name} placeholder={finalName || 'vector-db'} onChange={(e) => setName(e.target.value)} /></label>
        {taken && <p className="error-text">“{finalName}” is already in the library; saving replaces it.</p>}
        <details>
          <summary>Rules sent to the model with your description</summary>
          <pre className="rules">{kind === 'icon' ? ICON_RULES : CLIPART_RULES}</pre>
        </details>
        <div className="row">
          <button className="primary" disabled={!description.trim() || !enabled.length || running} onClick={generate}>
            {running ? 'Drawing…' : `Draw with ${enabled.length} model${enabled.length === 1 ? '' : 's'}`}
          </button>
          <button onClick={() => setManaging(!managing)}>{managing ? 'Done' : 'Models…'}</button>
        </div>
        {managing && <ModelsEditor onChange={setProfiles} />}
        <div className="drawings">
          {runs.map((r) => (
            <div key={r.profile.id} className={`drawing ${r.result ? (r.result.ok ? 'ok' : 'bad') : ''}`}>
              <div className="drawing-art">
                {r.result?.value ? <IconPreview def={r.result.value} size={kind === 'icon' ? 96 : 200} color="#3ef0ff" /> : <span className="muted">{r.result ? 'no drawing' : 'drawing…'}</span>}
              </div>
              <div className="muted drawing-meta">{r.profile.name}{r.result ? ` · ${(r.result.ms / 1000).toFixed(1)}s${r.result.attempts > 1 ? ` · ${r.result.attempts} tries` : ''}` : ''}</div>
              {r.result && !r.result.ok && <details className="error-text"><summary>{r.result.errors.length} problems</summary><ul>{r.result.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul></details>}
              {r.result?.value && <button disabled={!finalName} onClick={() => void save(r.result!.value!)}>Save as “{finalName}”</button>}
            </div>
          ))}
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
