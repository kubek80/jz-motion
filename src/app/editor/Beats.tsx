import { useEffect, useRef, useState } from 'react';
import { actionInfo as verb, newAction } from './actionInfo';
import { AddActionMenu } from './AddActionMenu';
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
  /** Element type of each element in the scene, to offer only the actions that fit. */
  types: Record<string, string>;
  /** A chart's current values, to start "New values" from. */
  chartData?: (id: string) => number[] | undefined;
  /** In Play mode: where the scene is (seconds) and when each beat starts, to light up what is running. */
  live?: { time: number; beatStarts: number[]; beatEnds: number[] };
  /** In Play mode: go to the start of a beat. */
  onJump?: (beat: number) => void;
  onSelect: (s: Selection) => void;
  onChange: (beats: RawBeat[]) => void;
}

const GREY = { '--c': '#9aa4ad' } as React.CSSProperties;
const secs = (s: number) => (s < 10 ? s.toFixed(1) : Math.round(s).toString()) + 's';

/** The scene's beats as a storyboard: one card per click, each with its actions on a small timeline. */
export function Beats({ beats, selection, picked, timing, colors, types, chartData, live, onJump, onSelect, onChange }: Props) {
  const setBeat = (bi: number, beat: RawBeat) => onChange(beats.map((b, i) => (i === bi ? beat : b)));
  const [menu, setMenu] = useState<number | null>(null);
  /** An action being dragged to another place or beat. */
  const dragging = useRef<{ beat: number; action: number } | null>(null);
  const [dropAt, setDropAt] = useState<string | null>(null);
  const strip = useRef<HTMLDivElement>(null);

  /** Play mode: which beat is running (or comes next), and how far along it is. */
  const liveBeat = live ? Math.max(0, live.beatEnds.findIndex((end) => live.time < end - 1e-6)) : -1;
  const allDone = !!live && live.beatEnds.length > 0 && live.time >= live.beatEnds[live.beatEnds.length - 1] - 1e-6;
  useEffect(() => {
    // Keep the running beat in view.
    if (!live) return;
    strip.current?.querySelector('.beat-col.live-now')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [liveBeat, !!live]);

  const addAction = (bi: number, kind: string) => {
    const beat = beats[bi];
    setBeat(bi, { ...beat, actions: [...beat.actions, newAction(kind, picked, chartData)] });
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
      if (a.do === 'spotlight') return <span className="tchip" style={GREY}>off</span>;
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
    <div className={`storyboard ${live ? 'live' : ''}`} ref={strip}>
      {beats.map((beat, bi) => {
        const beatSelected = selection?.kind === 'beat' && selection.beat === bi;
        const times = timing?.[bi] ?? [];
        const total = Math.max(0.001, ...times.map((t) => t.end));
        // Play mode: seconds into this beat (negative before it starts).
        const into = live ? live.time - (live.beatStarts[bi] ?? 0) : null;
        const beatState = !live ? '' : allDone || bi < liveBeat ? 'live-done' : bi === liveBeat ? 'live-now' : 'live-later';
        return (
          <div key={bi} className={`beat-col ${beatState}`}>
            <div className={`beat-trigger ${beat.auto ? 'auto' : ''}`} title={beat.auto ? 'Plays straight after the previous beat' : 'Plays when you click (or press →)'}>
              {beat.auto ? '↳ auto' : '▶ on click'}
            </div>
            <div className={beatSelected ? 'beat-card selected' : 'beat-card'}>
              <div className="beat-head" onClick={() => onSelect({ kind: 'beat', beat: bi })} title="Click to edit this beat (title, notes, auto-play)">
                {onJump && <button className="jump" title="Play from here: go to just before this beat" onClick={(e) => { e.stopPropagation(); onJump(bi); }}>⏮</button>}
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
                  const run = into === null || !t ? '' : into >= t.end - 1e-6 ? 'run-done' : into >= t.start - 1e-6 ? 'running' : '';
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
                        'action', `fam-${v.family}`, sel ? 'selected' : '', run, a.start === 'with' ? 'with' : '',
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
                          {beatState === 'live-now' && into !== null && into >= 0 && <b className="playhead" style={{ left: `${Math.min(1, into / total) * 100}%` }} />}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              <AddActionMenu
                open={menu === bi}
                picked={picked}
                types={types}
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
