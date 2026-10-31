import { moveItem, type Raw, type RawBeat } from './doc';
import type { Selection } from './types';

interface Props {
  beats: RawBeat[];
  selection: Selection;
  /** Elements selected on the board, used as targets for new actions. */
  picked: string[];
  onSelect: (s: Selection) => void;
  onChange: (beats: RawBeat[]) => void;
}

const describe = (a: Raw) => {
  const who = a.target ?? a.focus;
  const list = who === undefined ? '' : [who].flat().join(', ');
  if (a.do === 'camera' && who === undefined) return `camera → ${a.x ?? '·'}, ${a.y ?? '·'} ×${a.zoom ?? '·'}`;
  return `${a.do}${list ? ` → ${list}` : ''}${a.start === 'with' ? '  (with previous)' : ''}`;
};

/** The scene's beats and their actions, in order. One beat is one click while presenting. */
export function Beats({ beats, selection, picked, onSelect, onChange }: Props) {
  const setBeat = (bi: number, beat: RawBeat) => onChange(beats.map((b, i) => (i === bi ? beat : b)));
  const newAction = (): Raw => (picked.length ? { do: 'draw', target: picked.length === 1 ? picked[0] : picked } : { do: 'wait' });

  return (
    <div className="beats-editor">
      {beats.map((beat, bi) => {
        const beatSelected = selection?.kind === 'beat' && selection.beat === bi;
        return (
          <div key={bi} className={beatSelected ? 'beat-card selected' : 'beat-card'}>
            <div className="beat-head" onClick={() => onSelect({ kind: 'beat', beat: bi })}>
              <span className="num">{bi + 1}</span>
              <span className="beat-title">{beat.auto ? '↳ ' : ''}{beat.title ?? `beat ${bi + 1}`}</span>
              <span className="tools" onClick={(e) => e.stopPropagation()}>
                <button title="Move earlier" onClick={() => onChange(moveItem(beats, bi, bi - 1))}>↑</button>
                <button title="Move later" onClick={() => onChange(moveItem(beats, bi, bi + 1))}>↓</button>
                <button title="Delete beat" onClick={() => { onChange(beats.filter((_, i) => i !== bi)); onSelect(null); }}>✕</button>
              </span>
            </div>
            <ol className="actions">
              {beat.actions.map((a, ai) => {
                const sel = selection?.kind === 'action' && selection.beat === bi && selection.action === ai;
                return (
                  <li key={ai} className={sel ? 'selected' : ''} onClick={() => onSelect({ kind: 'action', beat: bi, action: ai })}>
                    <span className="desc">{describe(a)}</span>
                    <span className="tools" onClick={(e) => e.stopPropagation()}>
                      <button title="Move up" onClick={() => setBeat(bi, { ...beat, actions: moveItem(beat.actions, ai, ai - 1) })}>↑</button>
                      <button title="Move down" onClick={() => setBeat(bi, { ...beat, actions: moveItem(beat.actions, ai, ai + 1) })}>↓</button>
                      <button title="Delete action" onClick={() => { setBeat(bi, { ...beat, actions: beat.actions.filter((_, i) => i !== ai) }); onSelect(null); }}>✕</button>
                    </span>
                  </li>
                );
              })}
            </ol>
            <button
              className="add"
              title={picked.length ? `Draw ${picked.join(', ')}` : 'Select elements on the board first to target them'}
              onClick={() => {
                setBeat(bi, { ...beat, actions: [...beat.actions, newAction()] });
                onSelect({ kind: 'action', beat: bi, action: beat.actions.length });
              }}
            >
              + action
            </button>
          </div>
        );
      })}
      <button
        className="add-beat"
        onClick={() => {
          onChange([...beats, { title: `beat ${beats.length + 1}`, actions: picked.length ? [newAction()] : [] }]);
          onSelect({ kind: 'beat', beat: beats.length });
        }}
      >
        + beat{picked.length ? ` (draw ${picked.length === 1 ? picked[0] : `${picked.length} elements`})` : ''}
      </button>
    </div>
  );
}
