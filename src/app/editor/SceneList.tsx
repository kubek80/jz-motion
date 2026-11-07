// The list of scenes on the left: switch scene, move one up, delete one, add a new one (empty or made by AI).
// Right-click a scene for more: a new scene before or after it (empty or with AI), move it up or down, delete.
import { useEffect, useRef, useState } from 'react';
import { ContextMenu, menuAt, type MenuAt } from '../ContextMenu';
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
  const [menu, setMenu] = useState<(MenuAt & { i: number }) | null>(null);

  const editing = mode === 'edit' && !!doc;
  const count = doc?.scenes.length ?? 0;
  // Keep the current scene in view when it changes from elsewhere (closing Timing, playing on).
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.querySelector('.scene.active')?.scrollIntoView({ block: 'nearest' }); }, [sceneIndex]);

  return (
    <div className="scenes" ref={list}>
      {(doc?.scenes ?? []).map((s, i) => (
        <div
          key={i}
          className={[i === sceneIndex ? 'scene active' : 'scene', menu?.i === i ? 'menu-open' : ''].join(' ')}
          onClick={() => onGo(i)}
          onContextMenu={(e) => {
            if (!editing) return;
            e.preventDefault();
            setMenu({ i, ...menuAt(e) });
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
        <ContextMenu
          at={menu}
          onClose={() => setMenu(null)}
          title={`Scene ${menu.i + 1}: ${doc!.scenes[menu.i]?.title ?? doc!.scenes[menu.i]?.id}`}
          items={[
            { label: <><span className="plus">+</span> New scene before</>, onClick: () => onAdd(menu.i, 'before', false) },
            { label: <><span className="plus">+</span> New scene after</>, onClick: () => onAdd(menu.i, 'after', false) },
            { label: <>{TOOL_ICONS.sparkle} New scene before, with AI…</>, tone: 'ai', onClick: () => onAdd(menu.i, 'before', true) },
            { label: <>{TOOL_ICONS.sparkle} New scene after, with AI…</>, tone: 'ai', onClick: () => onAdd(menu.i, 'after', true) },
            'separator',
            { label: '↑ Move up', disabled: menu.i === 0, onClick: () => update({ ...doc!, scenes: moveItem(doc!.scenes, menu.i, menu.i - 1) }) },
            { label: '↓ Move down', disabled: menu.i === count - 1, onClick: () => update({ ...doc!, scenes: moveItem(doc!.scenes, menu.i, menu.i + 1) }) },
            'separator',
            { label: '✕ Delete scene', tone: 'danger', disabled: count < 2, onClick: () => void onRemove(menu.i) },
          ]}
        />
      )}
    </div>
  );
}
