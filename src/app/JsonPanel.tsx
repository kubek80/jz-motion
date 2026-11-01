import { useEffect, useRef, useState } from 'react';
import { confirmDialog } from './confirm';
import { examples } from './examples';
import { JsonEditor, type JsonEditorHandle } from './JsonEditor';

interface Props {
  text: string;
  scene: number;
  errors: string[];
  /** Typing in the whole-file view (merged into one undo step while typing). */
  onText: (text: string) => void;
  /** Replaces everything (import, example); undo brings the old one back. */
  onReplace: (text: string) => void;
}

/**
 * The presentation as JSON: the whole file, or just the scene being edited. A scene's JSON is applied
 * as soon as it is valid; until then the draft stays here and the board keeps the last valid version.
 */
export function JsonPanel({ text, scene, errors, onText, onReplace }: Props) {
  const [view, setView] = useState<'scene' | 'file'>('scene');
  const [full, setFull] = useState(false);
  const editor = useRef<JsonEditorHandle>(null);

  const sceneText = (() => {
    try {
      const s = JSON.parse(text).scenes?.[scene];
      return s ? JSON.stringify(s, null, 2) : null;
    } catch {
      return null;
    }
  })();
  // The scene view needs a valid file to cut the scene out of.
  const mode = view === 'scene' && sceneText !== null ? 'scene' : 'file';
  const [draft, setDraft] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  useEffect(() => { setDraft(null); setDraftError(null); }, [scene, mode]);

  const onSceneText = (value: string) => {
    setDraft(value);
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('a scene is a JSON object');
      const doc = JSON.parse(text);
      doc.scenes[scene] = parsed;
      setDraftError(null);
      setDraft(null);
      onText(JSON.stringify(doc, null, 2));
    } catch (e) {
      setDraftError((e as Error).message);
    }
  };

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);

  const exportJson = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = 'presentation.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className={full ? 'json-panel full' : 'json-panel'}>
      <div className="editor-bar">
        <div className="toggle small">
          <button className={mode === 'scene' ? 'on' : ''} disabled={sceneText === null} onClick={() => setView('scene')} title="Only the scene you are editing">Scene {scene + 1}</button>
          <button className={mode === 'file' ? 'on' : ''} onClick={() => setView('file')} title="The whole presentation">Whole file</button>
        </div>
        <button title="Fold everything" onClick={() => editor.current?.foldAll()}>⊟</button>
        <button title="Unfold everything" onClick={() => editor.current?.unfoldAll()}>⊞</button>
        <span className="spacer" />
        <label className="file" title="Replace with a JSON file">
          Import
          <input type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && void e.target.files[0].text().then(onReplace)} />
        </label>
        <button onClick={exportJson} title="Download as a JSON file">Export</button>
        <select
          value=""
          title="Replace with an example (undo brings yours back)"
          onChange={async (e) => {
            const ex = examples.find((x) => x.name === e.target.value);
            if (ex && (text === ex.text || (await confirmDialog({ title: `Replace this presentation with “${ex.title}”?`, message: 'Undo (Ctrl+Z) brings yours back.', confirm: 'Replace' })))) onReplace(ex.text);
          }}
        >
          <option value="" disabled>Example…</option>
          {examples.map((x) => <option key={x.name} value={x.name}>{x.title}</option>)}
        </select>
        <button title={full ? 'Exit full screen (Esc)' : 'Full screen'} onClick={() => setFull(!full)}>{full ? '✕' : '⤢'}</button>
      </div>
      <JsonEditor ref={editor} key={mode} value={mode === 'scene' ? draft ?? sceneText! : text} onChange={mode === 'scene' ? onSceneText : onText} />
      {mode === 'scene' && draftError && <p className="json-note">Not applied yet: {draftError}</p>}
      {mode === 'file' && errors.length > 0 && (
        <ul className="errors">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
      )}
    </div>
  );
}
