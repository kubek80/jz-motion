// The list of scenes on the left: switch scene, move one up, delete one, add a new one (empty or made by AI).
// Right-click a scene for more: a new scene before or after it (empty or with AI), move it up or down, delete.
import { useEffect, useState } from 'react';
import { moveItem, type RawDoc } from './doc';
import { TOOL_ICONS } from './Library';

interface Props {
  doc: RawDoc | null;
  sceneIndex: number;
  mode: 'edit' | 'play';
  onGo: (i: number) => void;
  onRemove: (i: number) => void;
  /** A new scene before or after scene `i`: empty, or described to a model. */
  onAdd: (i: number, where: 'before' | 'after', withAi: boolean) => void;
  update: (next: RawDoc) => void;
}

export function SceneList({ doc, sceneIndex, mode, onGo, onRemove, onAdd, update }: Props) {
  const [menu, setMenu] = useState<{ i: number; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    window.addEventListener('blur', close);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); window.removeEventListener('blur', close); };
  }, [menu]);

  const editing = mode === 'edit' && !!doc;
  const count = doc?.scenes.length ?? 0;
  const run = (fn: () => void) => () => { setMenu(null); fn(); };

  return (
    <div className="scenes">
      {(doc?.scenes ?? []).map((s, i) => (
        <div
          key={i}
          className={[i === sceneIndex ? 'scene active' : 'scene', menu?.i === i ? 'menu-open' : ''].join(' ')}
          onClick={() => onGo(i)}
          onContextMenu={(e) => {
            if (!editing) return;
            e.preventDefault();
            setMenu({ i, x: Math.min(e.clientX, window.innerWidth - 250), y: Math.min(e.clientY, window.innerHeight - 290) });
          }}
          title={editing ? 'Right-click for more: add a scene before or after, move, delete' : undefined}
        >
          <span className="num">{i + 1}</span>
          <span className="scene-title">{s.title ?? s.id}{s.inherit ? ' ↲' : ''}</span>
          {editing && (
            <span className="tools" onClick={(e) => e.stopPropagation()}>
              <button title="Move up" onClick={() => update({ ...doc!, scenes: moveItem(doc!.scenes, i, i - 1) })}>↑</button>
              <button title="Delete scene" disabled={count < 2} onClick={() => void onRemove(i)}>✕</button>
            </span>
          )}
        </div>
      ))}
      {editing && (
        <div className="scene-adds">
          <button className="add-scene" onClick={() => onAdd(sceneIndex, 'after', false)}><span className="plus">+</span> New scene</button>
          <button className="add-scene ai-add" onClick={() => onAdd(sceneIndex, 'after', true)} title="Describe a scene; a model makes it">{TOOL_ICONS.sparkle} New scene with AI</button>
        </div>
      )}
      {menu && editing && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} role="menu" onPointerDown={(e) => e.stopPropagation()}>
          <div className="menu-head muted">Scene {menu.i + 1}: {doc!.scenes[menu.i]?.title ?? doc!.scenes[menu.i]?.id}</div>
          <button role="menuitem" onClick={run(() => onAdd(menu.i, 'before', false))}><span className="plus">+</span> New scene before</button>
          <button role="menuitem" onClick={run(() => onAdd(menu.i, 'after', false))}><span className="plus">+</span> New scene after</button>
          <button role="menuitem" className="ai" onClick={run(() => onAdd(menu.i, 'before', true))}>{TOOL_ICONS.sparkle} New scene before, with AI…</button>
          <button role="menuitem" className="ai" onClick={run(() => onAdd(menu.i, 'after', true))}>{TOOL_ICONS.sparkle} New scene after, with AI…</button>
          <hr />
          <button role="menuitem" disabled={menu.i === 0} onClick={run(() => update({ ...doc!, scenes: moveItem(doc!.scenes, menu.i, menu.i - 1) }))}>↑ Move up</button>
          <button role="menuitem" disabled={menu.i === count - 1} onClick={run(() => update({ ...doc!, scenes: moveItem(doc!.scenes, menu.i, menu.i + 1) }))}>↓ Move down</button>
          <hr />
          <button role="menuitem" className="danger" disabled={count < 2} onClick={run(() => void onRemove(menu.i))}>✕ Delete scene</button>
        </div>
      )}
    </div>
  );
}
