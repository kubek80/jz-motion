import { useEffect, useState } from 'react';
import { ACTIONS, describeAction, GROUPS, kindOf, newAction } from './actionInfo';
import type { Raw } from './doc';
import { Fields } from './Fields';
import { actionSchemas } from './schemas';

// The selected action's properties: what it does in plain words, when it runs (after or with the previous
// action, a wait first, how long it takes) and, below, what it acts on and its own settings.

interface Props {
  action: Raw;
  beat: number;
  index: number;
  ids: string[];
  /** When it runs, from the compiled scene (seconds from its beat's click); missing while the JSON is invalid. */
  time?: { start: number; end: number };
  onChange: (next: Raw) => void;
}

/** The play kinds show only their own settings (Go to frame: which frame and the fade; Play to frame: where it stops). */
const PLAY_HIDES: Record<string, string[]> = {
  play: ['goto', 'until', 'fade'],
  'goto-frame': ['on', 'from', 'until', 'speed'],
  'play-to-frame': ['on', 'from', 'fade'],
};

const secs = (s: number) => `${Math.round(s * 100) / 100} s`;

export function ActionEditor({ action: a, beat, index, ids, time, onChange }: Props) {
  const v = describeAction(a);
  const set = (key: string, value: unknown) => {
    const next = { ...a, [key]: value };
    if (value === undefined) delete next[key];
    onChange(next);
  };
  const first = index === 0;
  const length = time ? time.end - time.start : undefined;

  return (
    <div className="inspector action-editor">
      <div className={`action-title fam-${v.family}`}>
        <i>{v.icon}</i>
        <div>
          <h3>{v.label} <span className="muted">· beat {beat + 1}, action {index + 1}</span></h3>
          <p>{v.does}</p>
        </div>
      </div>

      <label className="field" title="Turn it into another kind of action; who it acts on and its timing are kept where they still make sense">
        <span>change to</span>
        <select
          value={kindOf(a)}
          onChange={(e) => {
            const kind = e.target.value;
            const made = newAction(kind, []);
            // Keep what makes sense across kinds: who it targets and when it runs.
            const keep = Object.fromEntries(Object.entries(a).filter(([k]) => ['target', 'start', 'delay', 'duration'].includes(k) && k in actionSchemas[String(made.do)].properties));
            const { target: _t, ...defaults } = made;
            onChange({ ...defaults, ...keep });
          }}
        >
          {GROUPS.map((g) => (
            <optgroup key={g.title} label={g.title}>
              {g.kinds.map((k) => <option key={k} value={k}>{ACTIONS[k].label}</option>)}
            </optgroup>
          ))}
        </select>
      </label>

      <fieldset className="when">
        <legend>When</legend>
        <div className="seg" role="radiogroup" aria-label="Starts">
          <button role="radio" aria-checked={a.start !== 'with'} className={a.start !== 'with' ? 'on' : ''} onClick={() => set('start', undefined)}
            title={first ? 'Starts with the click that plays this beat' : 'Waits for the previous action to finish'}>
            {first ? 'On the click' : 'After the previous'}
          </button>
          <button role="radio" aria-checked={a.start === 'with'} className={a.start === 'with' ? 'on' : ''} onClick={() => set('start', 'with')}
            disabled={first} title={first ? 'The first action always starts on the click' : 'Starts at the same moment as the previous action'}>
            With the previous
          </button>
        </div>
        <div className="when-row">
          <label title="Seconds to wait before it starts">wait first <Seconds value={a.delay} placeholder="0" onCommit={(s) => set('delay', s || undefined)} /></label>
          <label title="How long it takes. Empty: a length that suits the action and the element">
            {a.do === 'wait' ? 'pause for' : 'takes'} <Seconds value={a.duration} placeholder={length !== undefined ? `auto, ${secs(length)}` : 'auto'} onCommit={(s) => set('duration', s)} />
          </label>
        </div>
        {time && <p className="muted runs">Runs {secs(time.start)} → {secs(time.end)} after the click.</p>}
        {time && length === 0 && (a.do === 'fade-out' || a.do === 'erase') && (
          <p className="note-text">Nothing to take away here: by this point it is already off the board (or hasn't been drawn yet).</p>
        )}
      </fieldset>

      <Fields schema={actionSchemas[a.do]} value={a} ids={ids} hide={['start', 'delay', 'duration', ...(PLAY_HIDES[kindOf(a)] ?? [])]} onChange={set} />
    </div>
  );
}

/** Seconds, committed on Enter or leaving the field; empty means "not set". */
function Seconds({ value, placeholder, onCommit }: { value: unknown; placeholder: string; onCommit: (s: number | undefined) => void }) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  useEffect(() => setDraft(value === undefined ? '' : String(value)), [value]);
  const commit = () => {
    const n = draft.trim() === '' ? undefined : Number(draft);
    if (n !== undefined && (!Number.isFinite(n) || n < 0)) return setDraft(value === undefined ? '' : String(value));
    if (n !== value) onCommit(n === 0 && placeholder !== '0' ? undefined : n);
  };
  return (
    <span className="secs">
      <input inputMode="decimal" value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
      <small>s</small>
    </span>
  );
}
