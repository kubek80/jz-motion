import { useEffect, useState } from 'react';
import { anchorNames } from '../../engine/schema';
import { icons } from '../../engine/library';
import { isoModels } from '../../engine/iso';
import { palette } from '../../engine/palette';
import type { Raw } from './doc';

// A form generated from the JSON Schema of an element or action (z.toJSONSchema), so new fields in
// schema.ts show up here without extra work. A few keys get richer inputs: icons, models, references.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Prop = Record<string, any>;

/** How a field is shown: a friendlier name, a short explanation, and which group it belongs to. */
interface FieldInfo { label?: string; help?: string; group?: 'video' | 'advanced' }

const FIELD_INFO: Record<string, FieldInfo> = {
  visible: { label: 'visible at start', help: 'Shown before any beat plays. Usually decided for you: things a beat draws start hidden.', group: 'advanced' },
  inherit: { label: 'continue from previous scene', help: 'Start with the previous scene\'s board (what is still visible, and its view), to keep building the same drawing.' },
  camera: { label: 'start view', help: 'Where the view is when the scene starts. Empty: the whole board.' },
  layout: { label: 'layout', help: 'Where your camera recording appears while this plays (video export only).', group: 'video' },
  track: { label: 'recording', help: 'Which recording that layout shows: "me" is yours, others are recordings added to a take.', group: 'video' },
  cue: { label: 'starts at (s)', help: 'Seconds into the recording where this beat plays (presentations made from a recording).', group: 'advanced' },
  auto: { label: 'play automatically', help: 'Plays right after the previous beat instead of waiting for a click.' },
  notes: { label: 'speaker notes' },
  start: { label: 'starts', help: '"after": when the previous action ends; "with": together with it.' },
  stagger: { help: 'With several targets: seconds between each one starting.' },
  focus: { help: 'What the camera frames; "all" frames everything visible.' },
  padding: { help: 'Space around what the camera frames, in screen pixels.' },
  curve: { help: 'Bends the arrow: positive bends left, negative right (0.2 is gentle).' },
  values: { label: 'show values' },
};

interface Props {
  schema: { properties: Record<string, Prop>; required?: string[] };
  value: Raw;
  ids: string[];
  onChange: (key: string, value: unknown) => void;
  /** Keys not to show (shown elsewhere, or fixed). */
  hide?: string[];
  /** The editor's current view, for "use current view" on a scene's start view. */
  currentView?: () => { x: number; y: number; zoom: number };
  /** Extra fields for the Advanced group (e.g. the id). */
  advanced?: React.ReactNode;
}

export function Fields({ schema, value, ids, onChange, hide = [], currentView, advanced }: Props) {
  const entries = Object.entries(schema.properties).filter(([key, p]) => !hide.includes(key) && p.const === undefined);
  const row = ([key, p]: [string, Prop]) => {
    const info = FIELD_INFO[key] ?? {};
    return (
      <label key={key} className="field" title={info.help}>
        <span>{info.label ?? key}{info.help ? <i className="help">?</i> : null}</span>
        {key === 'camera' && p.type === 'object'
          ? <StartView value={value[key] as Raw | undefined} currentView={currentView} onChange={(v) => onChange(key, v)} />
          : key === 'track'
            ? <TrackField value={value[key] as string | undefined} onChange={(v) => onChange(key, v)} />
            : <Field name={key} prop={p} value={value[key]} ids={ids} onChange={(v) => onChange(key, v)} />}
      </label>
    );
  };
  const main = entries.filter(([k]) => !FIELD_INFO[k]?.group);
  const video = entries.filter(([k]) => FIELD_INFO[k]?.group === 'video');
  const adv = entries.filter(([k]) => FIELD_INFO[k]?.group === 'advanced');
  return (
    <div className="fields">
      {main.map(row)}
      {video.length > 0 && (
        <>
          <div className="field-group">Video export</div>
          {video.map(row)}
        </>
      )}
      {(adv.length > 0 || advanced) && (
        <details className="advanced">
          <summary>Advanced</summary>
          <div className="fields">
            {advanced}
            {adv.map(row)}
          </div>
        </details>
      )}
    </div>
  );
}

/** A scene's start view: the whole board, or a view picked on the board. */
function StartView({ value, currentView, onChange }: { value?: Raw; currentView?: () => { x: number; y: number; zoom: number }; onChange: (v: unknown) => void }) {
  return (
    <span className="start-view">
      <span className="muted">{value ? `zoom ×${Number(value.zoom).toFixed(2)} at ${Math.round(value.x)}, ${Math.round(value.y)}` : 'whole board'}</span>
      {currentView && (
        <button
          type="button"
          title="Start the scene with the view you see on the board now"
          onClick={() => {
            const c = currentView();
            onChange({ x: Math.round(c.x), y: Math.round(c.y), zoom: Math.round(c.zoom * 100) / 100 });
          }}
        >
          Use current view
        </button>
      )}
      {value && <button type="button" onClick={() => onChange(undefined)}>Whole board</button>}
    </span>
  );
}

const TRACKS = ['me', 'friend'];
/** Which recording a video layout shows. */
function TrackField({ value, onChange }: { value?: string; onChange: (v: unknown) => void }) {
  const options = value && !TRACKS.includes(value) ? [...TRACKS, value] : TRACKS;
  return (
    <span className="pair">
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value === '__other' ? prompt('Recording name (as added to the take)') || undefined : e.target.value || undefined)}>
        <option value="">(me)</option>
        {options.map((t) => <option key={t} value={t}>{t}</option>)}
        <option value="__other">other…</option>
      </select>
    </span>
  );
}

function Field({ name, prop, value, ids, onChange }: { name: string; prop: Prop; value: unknown; ids: string[]; onChange: (v: unknown) => void }) {
  const placeholder = prop.default !== undefined ? String(prop.default) : '';

  const pictures = CHOICE_ICONS[name];
  if (prop.enum && pictures && prop.enum.every((o: string) => o in pictures)) return <IconChoice value={value as string | undefined} options={prop.enum} fallback={prop.default} pictures={pictures} onChange={onChange} />;
  if (prop.enum && prop.enum.every((c: string) => c in palette)) return <Swatches value={value as string | undefined} colors={prop.enum} fallback={prop.default} onChange={onChange} />;
  if (name === 'icon') return <Select value={value} options={Object.keys(icons).sort()} onChange={onChange} />;
  if (name === 'model') return <Select value={value} options={Object.keys(isoModels)} empty="(custom parts)" onChange={onChange} />;
  if (name === 'from' || name === 'to') {
    if (typeof value === 'object' && value) return <Json value={value} onChange={onChange} />;
    if (prop.anyOf) return <RefField value={value as string | undefined} ids={ids} onChange={onChange} />;
  }
  if (name === 'target') return <IdList value={value} ids={ids} onChange={onChange} />;
  if (name === 'focus') return <IdList value={value} ids={ids} allowAll onChange={onChange} />;

  if (prop.enum) return <Select value={value} options={prop.enum} empty={placeholder ? `(${placeholder})` : '—'} onChange={onChange} />;
  if (prop.type === 'number') return <NumberField value={value as number | undefined} placeholder={placeholder} onChange={onChange} />;
  if (prop.type === 'boolean') {
    // Unset means the default; setting it back to the default removes it from the JSON.
    const checked = value === undefined ? prop.default === true : value === true;
    return <input type="checkbox" className="check-input" checked={checked} onChange={(e) => onChange(e.target.checked === (prop.default === true) ? undefined : e.target.checked)} />;
  }
  if (prop.type === 'string') return <TextField value={value as string | undefined} placeholder={placeholder} onChange={onChange} />;
  if (prop.type === 'object' && Object.keys(prop.properties ?? {}).join() === 'x,y') {
    const v = (value ?? {}) as { x?: number; y?: number };
    return (
      <span className="pair">
        <NumberField value={v.x} placeholder="x" onChange={(x) => onChange(x === undefined && v.y === undefined ? undefined : { x: x ?? 0, y: v.y ?? 0 })} />
        <NumberField value={v.y} placeholder="y" onChange={(y) => onChange(y === undefined && v.x === undefined ? undefined : { x: v.x ?? 0, y: y ?? 0 })} />
      </span>
    );
  }
  return <Json value={value} onChange={onChange} />;
}

function Select({ value, options, empty = '—', onChange }: { value: unknown; options: string[]; empty?: string; onChange: (v: unknown) => void }) {
  return (
    <select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">{empty}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

/** Commits on blur or Enter, so typing doesn't rebuild the board on every key. */
function TextField({ value, placeholder, onChange }: { value?: string; placeholder?: string; onChange: (v: unknown) => void }) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);
  const commit = () => draft !== (value ?? '') && onChange(draft === '' ? undefined : draft);
  return <input value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />;
}

function NumberField({ value, placeholder, onChange }: { value?: number; placeholder?: string; onChange: (v: number | undefined) => void }) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  useEffect(() => setDraft(value === undefined ? '' : String(value)), [value]);
  const commit = () => {
    const n = draft.trim() === '' ? undefined : Number(draft);
    if (n !== undefined && Number.isNaN(n)) return setDraft(value === undefined ? '' : String(value));
    if (n !== value) onChange(n);
  };
  return <input type="number" step="any" value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />;
}

function RefField({ value, ids, onChange }: { value?: string; ids: string[]; onChange: (v: unknown) => void }) {
  const [id, anchor] = (value ?? '').split('.');
  const set = (i: string, a: string) => onChange(i ? (a ? `${i}.${a}` : i) : undefined);
  return (
    <span className="pair">
      <select value={id} onChange={(e) => set(e.target.value, anchor ?? '')}>
        <option value="">—</option>
        {ids.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <select value={anchor ?? ''} onChange={(e) => set(id, e.target.value)}>
        <option value="">(facing side)</option>
        {anchorNames.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </span>
  );
}

/** One id or several, as removable chips plus a picker. */
function IdList({ value, ids, allowAll, onChange }: { value: unknown; ids: string[]; allowAll?: boolean; onChange: (v: unknown) => void }) {
  const list = value === undefined ? [] : [value as string | string[]].flat();
  const set = (next: string[]) => onChange(next.length === 0 ? undefined : next.length === 1 ? next[0] : next);
  return (
    <span className="chips">
      {list.map((t) => (
        <button key={t} type="button" className="chip" onClick={() => set(list.filter((x) => x !== t))} title="Remove">
          {t} ×
        </button>
      ))}
      <select value="" onChange={(e) => e.target.value && set(e.target.value === 'all' ? ['all'] : [...list.filter((x) => x !== 'all'), e.target.value])}>
        <option value="">+ add</option>
        {allowAll && <option value="all">all (everything visible)</option>}
        {ids.filter((i) => !list.includes(i)).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </span>
  );
}

function Json({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const text = value === undefined ? '' : JSON.stringify(value, null, 1);
  const [draft, setDraft] = useState(text);
  const [bad, setBad] = useState(false);
  useEffect(() => setDraft(text), [text]);
  const commit = () => {
    if (draft.trim() === '') return onChange(undefined);
    try {
      onChange(JSON.parse(draft));
      setBad(false);
    } catch {
      setBad(true);
    }
  };
  return <textarea className={bad ? 'json bad' : 'json'} rows={Math.min(8, draft.split('\n').length + 1)} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} />;
}

/** Marker colors as a tray of markers: the chosen one is lifted out and glows. */
function Swatches({ value, colors, fallback, onChange }: { value?: string; colors: string[]; fallback?: string; onChange: (v: unknown) => void }) {
  const current = value ?? fallback;
  return (
    <span className="marker-tray">
      {colors.map((c) => {
        const hex = palette[c as keyof typeof palette];
        return (
          <button
            key={c}
            type="button"
            title={c + (value === undefined && c === fallback ? ' (default)' : '')}
            className={c === current ? 'marker on' : 'marker'}
            style={{ '--ink': hex } as React.CSSProperties}
            onClick={() => onChange(c === fallback && value !== undefined ? undefined : c)}
          >
            <svg viewBox="0 0 20 46" width="25" height="58" aria-hidden>
              {/* chisel tip, collar, body with a colour band */}
              <path d="M7.5 1.5 L12.5 5 V12 H7.5 Z" fill={hex} />
              <rect x="5.5" y="12" width="9" height="5" rx="1" fill={hex} opacity="0.55" />
              <rect x="3" y="17" width="14" height="28" rx="3" fill="#232a31" stroke="#38424c" />
              <rect x="3" y="23" width="14" height="7" fill={hex} opacity="0.85" />
              <rect x="5" y="19" width="2" height="23" rx="1" fill="#ffffff" opacity="0.08" />
            </svg>
          </button>
        );
      })}
    </span>
  );
}

/** Small pictures for enum fields that are easier to pick by look than by name. */
const g = (body: React.ReactNode) => (
  <svg viewBox="0 0 32 22" width="32" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{body}</svg>
);
const frame = <rect x="1.5" y="1.5" width="29" height="19" rx="2" strokeWidth="1.2" opacity="0.6" />;
const CHOICE_ICONS: Record<string, Record<string, React.ReactNode>> = {
  kind: {
    bar: g(<><path d="M4 19H28" opacity="0.6" /><path d="M7 19V11H11V19M14 19V5H18V19M21 19V9H25V19" /></>),
    line: g(<><path d="M4 19H28" opacity="0.6" /><path d="M5 15L11 9L17 13L27 4" /><circle cx="11" cy="9" r="1.3" fill="currentColor" /><circle cx="17" cy="13" r="1.3" fill="currentColor" /></>),
    pie: g(<><path d="M16 3A8 8 0 1 1 8.1 12.4" /><path d="M16 3A8 8 0 0 0 8.1 12.4L16 11Z" /><circle cx="16" cy="11" r="3.5" /></>),
  },
  layout: {
    board: g(<>{frame}<path d="M7 14L12 8L17 12L24 6" /></>),
    pip: g(<>{frame}<path d="M6 10L10 6L14 9" /><rect x="18" y="12" width="10" height="6.5" rx="1" fill="currentColor" stroke="none" /></>),
    'pip-left': g(<>{frame}<path d="M18 10L22 6L26 9" /><rect x="4" y="12" width="10" height="6.5" rx="1" fill="currentColor" stroke="none" /></>),
    camera: g(<>{frame}<circle cx="13" cy="10" r="3" /><path d="M7 19C7 15 19 15 19 19" /><rect x="21" y="3.5" width="7.5" height="5" rx="1" strokeWidth="1.2" /></>),
    side: g(<>{frame}<path d="M16 2V20" opacity="0.6" /><circle cx="8.5" cy="9" r="2.4" /><path d="M4.5 18C4.5 14.5 12.5 14.5 12.5 18" /><circle cx="23.5" cy="9" r="2.4" /><path d="M19.5 18C19.5 14.5 27.5 14.5 27.5 18" /></>),
  },
  align: {
    start: g(<path d="M6 6H26M6 11H18M6 16H22" />),
    middle: g(<path d="M6 6H26M10 11H22M8 16H24" />),
    end: g(<path d="M6 6H26M14 11H26M10 16H26" />),
  },
  head: {
    end: g(<><path d="M5 11H27" /><path d="M22 6L27 11L22 16" /></>),
    start: g(<><path d="M5 11H27" /><path d="M10 6L5 11L10 16" /></>),
    both: g(<><path d="M5 11H27" /><path d="M22 6L27 11L22 16M10 6L5 11L10 16" /></>),
    none: g(<path d="M5 11H27" />),
  },
};

function IconChoice({ value, options, fallback, pictures, onChange }: { value?: string; options: string[]; fallback?: string; pictures: Record<string, React.ReactNode>; onChange: (v: unknown) => void }) {
  const current = value ?? fallback;
  return (
    <span className="icon-choice">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          title={o + (value === undefined && o === fallback ? ' (default)' : '')}
          className={o === current ? 'on' : ''}
          // Clicking the chosen one again (or the default) clears the field.
          onClick={() => onChange((o === fallback || o === value) && value !== undefined ? undefined : o)}
        >
          {pictures[o]}
        </button>
      ))}
    </span>
  );
}
