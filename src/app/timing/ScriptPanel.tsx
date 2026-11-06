// The script beside the board (large in prompter mode): the recording banner, the Now beat with
// its sentences, budget and live countdown, the Next beat, and editing either beat's notes. Above them,
// dimmed, the end of the beat before (what you just said), so you can pick up where you left off.
import { fmt } from './format';
import { ScriptLine } from './ScriptLine';
import type { NotesEditing } from './useNotesEditing';
import type { NowPlaying } from './useNowPlaying';

interface Props {
  width: number;
  recording: boolean;
  recPaused: boolean;
  time: number;
  np: NowPlaying;
  notes: NotesEditing;
}

export function ScriptPanel({ width, recording, recPaused, time, np, notes }: Props) {
  const { current, next, prev, prevLines, beatOf, sceneTitle, nowLines, nextLines, budget, anyClip, beatElapsed, playDur, activeLine, getBeatElapsed } = np;
  const { editingThis, startEditing, saveEditing, setEditingBeat, draftNotes, setDraftNotes } = notes;
  return (
    <aside className="timing-script" style={{ flexBasis: width + 'px' }}>
      {recording && (
        <div className={recPaused ? 'rec-banner paused' : 'rec-banner'}>
          <span className="dot" />
          {recPaused ? <>Paused {fmt(time)} · prompter held, mic still on · <b>Space</b> resume · <b>→</b> next · <b>Esc</b> stop</>
            : <>Recording {fmt(time)} · <b>→</b> next line · <b>Space</b> pause prompter · <b>←</b> back · <b>Esc</b> stop</>}
        </div>
      )}
      {prev && prevLines.length > 0 && !editingThis(prev) && (
        <div className="prev" onClick={() => startEditing(prev.scene, prev.beat, beatOf(prev)?.notes)} title="What you just said (click to edit)">
          <span className="muted">Before · {beatOf(prev)?.title ?? `Beat ${prev.beat + 1}`}</span>
          <p>{prevLines.length > 2 && <span className="muted">… </span>}{prevLines.slice(-2).map((l) => l.text).join(' ')}</p>
        </div>
      )}
      {prev && editingThis(prev) && (
        <div className="prev editing">
          <span className="muted">Before · {beatOf(prev)?.title ?? `Beat ${prev.beat + 1}`}</span>
          <textarea className="notes-edit" autoFocus value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} onBlur={saveEditing}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditingBeat(null); }
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEditing(); }
            }} />
        </div>
      )}
      <div className="now">
        <div className="now-head">
          <span className="muted">Now · {sceneTitle(current)}</span>
          {budget > 0 && !editingThis(current) && (
            <span className={['beat-budget', beatElapsed > budget + 0.2 ? 'over' : '', anyClip ? '' : 'estimated'].join(' ')} title={anyClip ? 'Seconds into this beat vs. the total length of its generated voice clips' : 'Seconds into this beat vs. an estimate from word count at ~150 wpm (generate voice for the real pace)'}>
              {beatElapsed.toFixed(1)}s / {anyClip ? '' : '~'}{budget.toFixed(1)}s
            </span>
          )}
          {current && (editingThis(current) ? (
            <span className="line-tools">
              <button className="small" onClick={saveEditing} title="Save (Ctrl+Enter)">Save</button>
              <button className="small" onClick={() => setEditingBeat(null)} title="Discard (Esc)">Cancel</button>
            </span>
          ) : (
            <button className="small edit-notes" onClick={() => startEditing(current.scene, current.beat, beatOf(current)?.notes)} title="Edit this beat's speaker notes">✎ Edit</button>
          ))}
        </div>
        <b>{beatOf(current)?.title ?? `Beat ${(current?.beat ?? 0) + 1}`}</b>
        {editingThis(current) ? (
          <textarea
            className="notes-edit"
            autoFocus
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
            onBlur={saveEditing}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditingBeat(null); }
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEditing(); }
            }}
            placeholder="What you say over this beat. End sentences with a period so the prompter can show one line each."
          />
        ) : nowLines.length ? (
          <ul
            className="lines clickable"
            onClick={() => current && startEditing(current.scene, current.beat, beatOf(current)?.notes)}
            title="Click to edit"
          >
            {nowLines.map((line, i) => <ScriptLine key={i} line={line} said={activeLine >= 0 && i < activeLine} active={i === activeLine} playDur={playDur(line)} startAt={nowLines.slice(0, i).reduce((s, l) => s + playDur(l), 0)} getBeatElapsed={getBeatElapsed} />)}
          </ul>
        ) : (
          <p className="clickable" onClick={() => current && startEditing(current.scene, current.beat, '')}><span className="muted">Click to add speaker notes</span></p>
        )}
      </div>
      {next && (
        <div className="next">
          <div className="now-head">
            <span className="muted">Next at {fmt(next.t)} · {sceneTitle(next)}</span>
            {!editingThis(next) && <button className="small edit-notes" onClick={() => startEditing(next.scene, next.beat, beatOf(next)?.notes)} title="Edit this beat's speaker notes">✎ Edit</button>}
          </div>
          <b>{beatOf(next)?.title ?? `Beat ${next.beat + 1}`}</b>
          {editingThis(next) ? (
            <textarea
              className="notes-edit"
              autoFocus
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              onBlur={saveEditing}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditingBeat(null); }
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEditing(); }
              }}
            />
          ) : nextLines.length ? (
            <ul
              className="lines clickable"
              onClick={() => startEditing(next.scene, next.beat, beatOf(next)?.notes)}
              title="Click to edit"
            >
              {nextLines.map((line, i) => <ScriptLine key={i} line={line} />)}
            </ul>
          ) : (
            <p className="clickable" onClick={() => startEditing(next.scene, next.beat, '')}><span className="muted">Click to add speaker notes</span></p>
          )}
        </div>
      )}
    </aside>
  );
}
