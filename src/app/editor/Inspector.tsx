import { useEffect, useState } from 'react';
import { Fields } from './Fields';
import type { Raw, RawDoc } from './doc';
import { actionKinds, actionSchemas, beatSchema, elementSchemas, sceneSchema } from './schemas';
import type { Selection } from './types';

interface Props {
  doc: RawDoc;
  scene: number;
  picked: string[];
  editable: Set<string>;
  ids: string[];
  selection: Selection;
  onElement: (id: string, key: string, value: unknown) => void;
  onRename: (from: string, to: string) => string | null;
  onDelete: (ids: string[]) => void;
  onDuplicate: (id: string) => void;
  onAction: (beat: number, action: number, next: Raw) => void;
  onBeat: (beat: number, key: string, value: unknown) => void;
  onScene: (key: string, value: unknown) => void;
  onTitle: (title: string) => void;
  currentView: () => { x: number; y: number; zoom: number };
}

/** Properties of whatever is selected: board elements first, then an action or beat, else the scene. */
export function Inspector(p: Props) {
  const scene = p.doc.scenes[p.scene];

  if (p.picked.length === 1) {
    const id = p.picked[0];
    const el = scene.elements?.find((e) => e.id === id);
    if (!el || !p.editable.has(id)) {
      return <div className="inspector"><p className="muted">“{id}” comes from an earlier scene. Edit it there.</p></div>;
    }
    return (
      <div className="inspector">
        <h3>{el.type} <span className="muted">element</span></h3>
        <Fields
          schema={elementSchemas[el.type]} value={el} ids={p.ids.filter((i) => i !== id)} hide={['id']} onChange={(k, v) => p.onElement(id, k, v)}
          advanced={<label className="field" title="The name other elements and beats use to refer to this one (arrows, actions). Renaming updates them all."><span>id<i className="help">?</i></span><IdField id={id} onRename={(to) => p.onRename(id, to)} /></label>}
        />
        <div className="row">
          <button onClick={() => p.onDuplicate(id)}>Duplicate</button>
          <button className="danger" onClick={() => p.onDelete([id])}>Delete</button>
        </div>
      </div>
    );
  }
  if (p.picked.length > 1) {
    return (
      <div className="inspector">
        <h3>{p.picked.length} elements</h3>
        <p className="muted">Drag to move them together. Add a beat or an action to animate them.</p>
        <button className="danger" onClick={() => p.onDelete(p.picked.filter((i) => p.editable.has(i)))}>Delete</button>
      </div>
    );
  }
  if (p.selection?.kind === 'action') {
    const { beat, action } = p.selection;
    const a = scene.beats?.[beat]?.actions[action];
    if (!a) return null;
    return (
      <div className="inspector">
        <h3>Action <span className="muted">in beat {beat + 1}</span></h3>
        <label className="field">
          <span>do</span>
          <select
            value={a.do}
            onChange={(e) => {
              // Keep what makes sense across kinds: who it targets and when it runs.
              const keep = Object.fromEntries(Object.entries(a).filter(([k]) => ['target', 'start', 'delay', 'duration'].includes(k) && k in actionSchemas[e.target.value].properties));
              p.onAction(beat, action, { do: e.target.value, ...keep });
            }}
          >
            {actionKinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <Fields
          schema={actionSchemas[a.do]}
          value={a}
          ids={p.ids}
          onChange={(k, v) => {
            const next = { ...a, [k]: v };
            if (v === undefined) delete next[k];
            p.onAction(beat, action, next);
          }}
        />
      </div>
    );
  }
  if (p.selection?.kind === 'beat') {
    const { beat } = p.selection;
    const b = scene.beats?.[beat];
    if (!b) return null;
    return (
      <div className="inspector">
        <h3>Beat {beat + 1}</h3>
        <Fields schema={beatSchema} value={b} ids={p.ids} hide={['actions']} onChange={(k, v) => p.onBeat(beat, k, v)} />
      </div>
    );
  }
  return (
    <div className="inspector">
      <h3>Presentation</h3>
      <label className="field"><span>title</span><Commit value={p.doc.title} onCommit={p.onTitle} /></label>
      <h3>Scene {p.scene + 1}</h3>
      <Fields
        schema={sceneSchema} value={scene} ids={p.ids} hide={['elements', 'beats', 'id']} onChange={p.onScene} currentView={p.currentView}
        advanced={<label className="field" title="The scene's name in the JSON. Rarely needs changing."><span>id<i className="help">?</i></span><Commit value={scene.id} onCommit={(v) => /^[A-Za-z][\w-]*$/.test(v) && p.onScene('id', v)} /></label>}
      />
      <p className="muted hint">Click an element to edit it, shift+click to select several, drag to move. Drag the empty board to pan, scroll to zoom.</p>
    </div>
  );
}

function IdField({ id, onRename }: { id: string; onRename: (to: string) => string | null }) {
  const [draft, setDraft] = useState(id);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setDraft(id); setError(null); }, [id]);
  const commit = () => {
    if (draft === id) return;
    const err = onRename(draft);
    setError(err);
    if (err) setDraft(id);
  };
  return (
    <span>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
      {error && <small className="error-text">{error}</small>}
    </span>
  );
}

function Commit({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== value && onCommit(draft)} onKeyDown={(e) => e.key === 'Enter' && draft !== value && onCommit(draft)} />;
}
