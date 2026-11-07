import { useEffect, useState } from 'react';
import type { CompiledPresentation } from '../../engine/compile';
import { ActionEditor } from '../editor/ActionEditor';
import { describeAction } from '../editor/actionInfo';
import type { Raw, RawBeat, RawDoc } from '../editor/doc';
import { Fields } from '../editor/Fields';
import { beatSchema } from '../editor/schemas';

// A beat's options, without leaving Timing: its title, speaker notes, whether it plays by itself, where it
// starts, how the video is laid out while it plays, and its actions (click one to change it). Opens when you
// click a beat on the timeline; "Open in editor" (or a double-click on the beat) goes to the editor.

interface Props {
  doc: RawDoc;
  presentation: CompiledPresentation;
  scene: number;
  beat: number;
  onBeat: (scene: number, beat: number, next: RawBeat) => void;
  onEditBeat: (scene: number, beat: number) => void;
  onClose: () => void;
}

const secs = (s: number) => `${Math.round(s * 10) / 10} s`;

export function BeatDrawer({ doc, presentation, scene, beat, onBeat, onEditBeat, onClose }: Props) {
  const raw = doc.scenes[scene]?.beats?.[beat];
  const compiled = presentation.scenes[scene]?.beats[beat];
  const [action, setAction] = useState<number | null>(null);
  useEffect(() => setAction(null), [scene, beat]);
  // Esc closes the drawer (not Timing), unless typing in it.
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as HTMLElement).closest('input, textarea, select') || document.querySelector('.context-menu, .confirm')) return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);
  if (!raw) return null;

  const ids = (doc.scenes[scene]?.elements ?? []).map((e) => String(e.id));
  const set = (key: string, value: unknown) => {
    const next: Raw = { ...raw, [key]: value };
    if (value === undefined) delete next[key];
    onBeat(scene, beat, next as RawBeat);
  };
  const setAction_ = (ai: number, next: Raw) => onBeat(scene, beat, { ...raw, actions: raw.actions.map((a, i) => (i === ai ? next : a)) });
  const sceneName = doc.scenes[scene]?.title ?? doc.scenes[scene]?.id;

  return (
    <aside className="beat-drawer" onPointerDown={(e) => e.stopPropagation()}>
      <div className="drawer-head">
        <div>
          <span className="muted">{scene + 1}.{beat + 1} · {sceneName}{compiled ? ` · ${secs(compiled.end - compiled.start)} of animation` : ''}</span>
          <h3>{raw.title ?? `Beat ${beat + 1}`}</h3>
        </div>
        <span className="spacer" />
        <button onClick={() => onEditBeat(scene, beat)} title="Close Timing and open this beat in the editor (or double-click it)">Open in editor</button>
        <button onClick={onClose} title="Close (Esc)">✕</button>
      </div>
      <div className="drawer-body">
        <Fields schema={beatSchema} value={raw} ids={ids} hide={['actions']} onChange={set} />
        <h4>Actions</h4>
        <ol className="drawer-actions">
          {raw.actions.map((a, ai) => {
            const v = describeAction(a);
            const t = compiled?.actions[ai];
            const who = [a.target ?? a.focus ?? []].flat().join(', ');
            return (
              <li key={ai} className={`fam-${v.family} ${action === ai ? 'on' : ''}`} onClick={() => setAction(action === ai ? null : ai)} title="Click to change it">
                <span className="verb"><i>{v.icon}</i>{v.label}</span>
                <span className="who">{who}</span>
                {t && <span className="muted when">{a.start === 'with' ? 'with · ' : ''}{secs(t.start)}–{secs(t.end)}</span>}
              </li>
            );
          })}
          {!raw.actions.length && <li className="muted">No actions</li>}
        </ol>
        {action !== null && raw.actions[action] && (
          <ActionEditor key={`${scene}.${beat}.${action}`} action={raw.actions[action]} beat={beat} index={action} ids={ids} time={compiled?.actions[action]} onChange={(next) => setAction_(action, next)} />
        )}
      </div>
    </aside>
  );
}
