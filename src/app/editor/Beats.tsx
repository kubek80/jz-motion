import { useEffect, useRef, useState } from 'react';
import { moveItem, type Raw, type RawBeat } from './doc';
import type { Selection } from './types';

interface Props {
  beats: RawBeat[];
  selection: Selection;
  /** Elements selected on the board, used as targets for new actions. */
  picked: string[];
  /** When each action runs (seconds from its beat's start), from the compiled scene; missing while the JSON is invalid. */
  timing?: { start: number; end: number }[][];
  /** Marker colour of each element in the scene, for the target chips. */
  colors: Record<string, string>;
  onSelect: (s: Selection) => void;
  onChange: (beats: RawBeat[]) => void;
}

/** How each kind of action looks in the strip: a symbol, a plain verb and a family (sets its colour). */
const VERBS: Record<string, { icon: string; label: string; family: 'reveal' | 'hide' | 'attention' | 'motion' | 'camera' | 'data' | 'wait' }> = {
  draw: { icon: '✎', label: 'Draw', family: 'reveal' },
  'fade-in': { icon: '◐', label: 'Fade in', family: 'reveal' },
  pop: { icon: '✦', label: 'Pop in', family: 'reveal' },
  'fade-out': { icon: '◑', label: 'Fade out', family: 'hide' },
  erase: { icon: '⌫', label: 'Erase', family: 'hide' },
  pulse: { icon: '◉', label: 'Pulse', family: 'attention' },
  circle: { icon: '○', label: 'Circle', family: 'attention' },
  recolor: { icon: '●', label: 'Recolour', family: 'attention' },
  move: { icon: '➜', label: 'Move', family: 'motion' },
  flow: { icon: '⇢', label: 'Flow', family: 'motion' },
  rotate: { icon: '↻', label: 'Rotate', family: 'motion' },
  spin: { icon: '⟳', label: 'Spin', family: 'motion' },
  explode: { icon: '✺', label: 'Explode', family: 'motion' },
  camera: { icon: '⌖', label: 'Camera', family: 'camera' },
  'set-values': { icon: '▤', label: 'New values', family: 'data' },
  wait: { icon: '⋯', label: 'Pause', family: 'wait' },
};
const verb = (d: string) => VERBS[d] ?? { icon: '•', label: d, family: 'wait' as const };

/** Actions offered by "+ action", most used first. Those needing targets use the elements selected on the board. */
const QUICK: { do: string; needs: boolean; hint: string }[] = [
  { do: 'draw', needs: true, hint: 'Draw it stroke by stroke' },
  { do: 'fade-in', needs: true, hint: 'Fade it in' },
  { do: 'pop', needs: true, hint: 'Scale it in with a bounce' },
  { do: 'pulse', needs: true, hint: 'Grow and shrink to draw attention' },
  { do: 'circle', needs: true, hint: 'Draw a loop around it' },
  { do: 'camera', needs: false, hint: 'Frame the selected elements (or everything)' },
  { do: 'move', needs: true, hint: 'Move it somewhere else' },
  { do: 'flow', needs: true, hint: 'Dots travel along an arrow' },
  { do: 'erase', needs: true, hint: 'Wipe it off the board' },
  { do: 'wait', needs: false, hint: 'Pause before the next action' },
];

function newAction(kind: string, picked: string[]): Raw {
  const target = picked.length === 1 ? picked[0] : picked;
  switch (kind) {
    case 'camera': return { do: 'camera', focus: picked.length ? target : 'all' };
    case 'move': return { do: 'move', target, to: { x: 960, y: 540 } };
    case 'wait': return { do: 'wait', duration: 1 };
    default: return { do: kind, target };
  }
}

const GREY = { '--c': '#9aa4ad' } as React.CSSProperties;
const secs = (s: number) => (s < 10 ? s.toFixed(1) : Math.round(s).toString()) + 's';

/** The scene's beats as a storyboard: one card per click, each with its actions on a small timeline. */
export function Beats({ beats, selection, picked, timing, colors, onSelect, onChange }: Props) {
  const setBeat = (bi: number, beat: RawBeat) => onChange(beats.map((b, i) => (i === bi ? beat : b)));
  const [menu, setMenu] = useState<number | null>(null);
  /** An action being dragged to another place or beat. */
  const dragging = useRef<{ beat: number; action: number } | null>(null);
  const [dropAt, setDropAt] = useState<string | null>(null);

  const addAction = (bi: number, kind: string) => {
    const beat = beats[bi];
    setBeat(bi, { ...beat, actions: [...beat.actions, newAction(kind, picked)] });
    onSelect({ kind: 'action', beat: bi, action: beat.actions.length });
    setMenu(null);
  };

  const moveAction = (from: { beat: number; action: number }, toBeat: number, toIndex: number) => {
    const next = beats.map((b) => ({ ...b, actions: [...b.actions] }));
    const [a] = next[from.beat].actions.splice(from.action, 1);
    // Removing it first shifts the later actions of the same beat up by one.
    const at = from.beat === toBeat && from.action < toIndex ? toIndex - 1 : toIndex;
    next[toBeat].actions.splice(at, 0, a);
    onChange(next);
    onSelect({ kind: 'action', beat: toBeat, action: at });
  };

  const chips = (a: Raw) => {
    const who = a.target ?? a.focus;
    if (who === undefined) {
      if (a.do === 'camera') return <span className="tchip" style={GREY}>{a.zoom !== undefined ? `zoom ${a.zoom}` : 'move'}</span>;
      if (a.do === 'wait') return <span className="tchip" style={GREY}>{a.duration ?? 1}s</span>;
      return null;
    }
    const list = [who].flat() as string[];
    // Two names fit; the rest are counted (all of them are in the tooltip and the properties).
    const shown = list.length > 3 ? list.slice(0, 2) : list;
    return [
      ...shown.map((id) => (
        <span key={id} className="tchip" style={id === 'all' ? GREY : ({ '--c': colors[id] ?? '#9aa4ad' } as React.CSSProperties)}>{id === 'all' ? 'everything' : id}</span>
      )),
      list.length > shown.length && <span key="more" className="tchip more" style={GREY} title={list.join(', ')}>+{list.length - shown.length}</span>,
    ];
  };

  return (
    <div className="storyboard">
      {beats.map((beat, bi) => {
        const beatSelected = selection?.kind === 'beat' && selection.beat === bi;
        const times = timing?.[bi] ?? [];
        const total = Math.max(0.001, ...times.map((t) => t.end));
        return (
          <div key={bi} className="beat-col">
            <div className={`beat-trigger ${beat.auto ? 'auto' : ''}`} title={beat.auto ? 'Plays straight after the previous beat' : 'Plays when you click (or press →)'}>
              {beat.auto ? '↳ auto' : '▶ on click'}
            </div>
            <div className={beatSelected ? 'beat-card selected' : 'beat-card'}>
              <div className="beat-head" onClick={() => onSelect({ kind: 'beat', beat: bi })} title="Click to edit this beat (title, notes, auto-play)">
                <span className="num">{bi + 1}</span>
                <span className="beat-title">{beat.title ?? `Beat ${bi + 1}`}</span>
                {times.length > 0 && <span className="beat-len">{secs(total)}</span>}
                <span className="tools" onClick={(e) => e.stopPropagation()}>
                  <button title="Move earlier" disabled={bi === 0} onClick={() => onChange(moveItem(beats, bi, bi - 1))}>←</button>
                  <button title="Move later" disabled={bi === beats.length - 1} onClick={() => onChange(moveItem(beats, bi, bi + 1))}>→</button>
                  <button title="Delete beat" onClick={() => { onChange(beats.filter((_, i) => i !== bi)); onSelect(null); }}>✕</button>
                </span>
              </div>
              {beat.notes && <div className="beat-notes" title={beat.notes}>“{beat.notes}”</div>}
              <ol
                className="actions"
                onDragOver={(e) => { if (dragging.current) { e.preventDefault(); if (e.target === e.currentTarget) setDropAt(`${bi}:${beat.actions.length}`); } }}
                onDrop={(e) => { e.preventDefault(); if (dragging.current && dropAt?.startsWith(`${bi}:`)) moveAction(dragging.current, bi, Number(dropAt.split(':')[1])); setDropAt(null); }}
              >
                {beat.actions.length === 0 && <li className="empty muted">No actions yet</li>}
                {beat.actions.map((a, ai) => {
                  const sel = selection?.kind === 'action' && selection.beat === bi && selection.action === ai;
                  const v = verb(a.do);
                  const t = times[ai];
                  return (
                    <li
                      key={ai}
                      draggable
                      onDragStart={(e) => { dragging.current = { beat: bi, action: ai }; e.dataTransfer.effectAllowed = 'move'; }}
                      onDragEnd={() => { dragging.current = null; setDropAt(null); }}
                      onDragOver={(e) => {
                        if (!dragging.current) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        setDropAt(`${bi}:${e.clientY < r.top + r.height / 2 ? ai : ai + 1}`);
                      }}
                      className={[
                        'action', `fam-${v.family}`, sel ? 'selected' : '', a.start === 'with' ? 'with' : '',
                        dropAt === `${bi}:${ai}` ? 'drop-before' : '', dropAt === `${bi}:${ai + 1}` && ai === beat.actions.length - 1 ? 'drop-after' : '',
                      ].join(' ')}
                      onClick={() => onSelect({ kind: 'action', beat: bi, action: ai })}
                      title={`${v.label}${a.start === 'with' ? ', together with the previous action' : ''}${t ? ` · ${secs(t.start)} → ${secs(t.end)}` : ''}. Drag to reorder or move to another beat.`}
                    >
                      <div className="action-line">
                        {a.start === 'with' && <span className="with-mark" title="Starts together with the previous action">⇉</span>}
                        <span className="verb"><i>{v.icon}</i>{v.label}</span>
                        <span className="targets">{chips(a)}</span>
                        <span className="tools" onClick={(e) => e.stopPropagation()}>
                          <button title="Delete action" onClick={() => { setBeat(bi, { ...beat, actions: beat.actions.filter((_, i) => i !== ai) }); onSelect(null); }}>✕</button>
                        </span>
                      </div>
                      {t && (
                        <div className="timebar">
                          <span style={{ left: `${(t.start / total) * 100}%`, width: `max(3px, ${((t.end - t.start) / total) * 100}%)` }} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              <AddAction
                open={menu === bi}
                picked={picked}
                onToggle={() => setMenu(menu === bi ? null : bi)}
                onClose={() => setMenu(null)}
                onPick={(kind) => addAction(bi, kind)}
              />
            </div>
          </div>
        );
      })}
      <button
        className="add-beat"
        onClick={() => {
          onChange([...beats, { title: `Beat ${beats.length + 1}`, actions: picked.length ? [newAction('draw', picked)] : [] }]);
          onSelect({ kind: 'beat', beat: beats.length });
        }}
        title="A beat is one click while presenting"
      >
        <b>+ beat</b>
        <span className="muted">{picked.length ? `draws ${picked.length === 1 ? picked[0] : `${picked.length} elements`}` : 'one more click'}</span>
      </button>
    </div>
  );
}

function AddAction({ open, picked, onToggle, onClose, onPick }: { open: boolean; picked: string[]; onToggle: () => void; onClose: () => void; onPick: (kind: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; bottom: number } | null>(null);
  useEffect(() => {
    // The strip scrolls sideways and would clip the menu, so it floats above the button in the page.
    const r = ref.current?.getBoundingClientRect();
    setAt(open && r ? { left: Math.min(r.left, window.innerWidth - 230), bottom: window.innerHeight - r.top + 4 } : null);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [open, onClose]);
  return (
    <div className="add-action" ref={ref}>
      <button className="add" onClick={onToggle}>+ action</button>
      {open && at && (
        <div className="action-menu" style={at}>
          <div className="menu-note muted">{picked.length ? <>For <b>{picked.join(', ')}</b></> : 'Select elements on the board to target them'}</div>
          {QUICK.map((q) => {
            const v = verb(q.do);
            return (
              <button key={q.do} className={`fam-${v.family}`} disabled={q.needs && !picked.length} title={q.hint} onClick={() => onPick(q.do)}>
                <i>{v.icon}</i>{v.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
