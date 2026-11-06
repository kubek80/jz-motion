// The list of scenes on the left: switch scene, move one up, delete one, add a new one (empty or made by AI).
import { addScene, moveItem, type RawDoc } from './doc';
import { TOOL_ICONS } from './Library';

interface Props {
  doc: RawDoc | null;
  sceneIndex: number;
  mode: 'edit' | 'play';
  onGo: (i: number) => void;
  onRemove: (i: number) => void;
  onNewWithAi: () => void;
  update: (next: RawDoc) => void;
}

export function SceneList({ doc, sceneIndex, mode, onGo, onRemove, onNewWithAi, update }: Props) {
  return (
    <div className="scenes">
      {(doc?.scenes ?? []).map((s, i) => (
        <div key={i} className={i === sceneIndex ? 'scene active' : 'scene'} onClick={() => onGo(i)}>
          <span className="num">{i + 1}</span>
          <span className="scene-title">{s.title ?? s.id}{s.inherit ? ' ↲' : ''}</span>
          {mode === 'edit' && doc && (
            <span className="tools" onClick={(e) => e.stopPropagation()}>
              <button title="Move up" onClick={() => update({ ...doc, scenes: moveItem(doc.scenes, i, i - 1) })}>↑</button>
              <button title="Delete scene" disabled={doc.scenes.length < 2} onClick={() => void onRemove(i)}>✕</button>
            </span>
          )}
        </div>
      ))}
      {mode === 'edit' && doc && (
        <div className="scene-adds">
          <button className="add-scene" onClick={() => update(addScene(doc, sceneIndex))}><span className="plus">+</span> New scene</button>
          <button className="add-scene ai-add" onClick={onNewWithAi} title="Describe a scene; a model makes it">{TOOL_ICONS.sparkle} New scene with AI</button>
        </div>
      )}
    </div>
  );
}
