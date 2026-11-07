import { icons } from '../../engine/library';
import { isoModels } from '../../engine/iso';
import { palette } from '../../engine/palette';
import type { Raw } from './doc';
import { GeoField } from './fields/GeoField';
import { IdList, Json, NumberField, ProseField, RefField, Select, TextAreaField, TextField } from './fields/inputs';
import { CHOICE_ICONS, IconChoice, Swatches } from './fields/pickers';

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
  target: { label: 'acts on', help: 'What it acts on. With several, they take turns (see "one after another").' },
  stagger: { label: 'one after another', help: 'With several targets: seconds between each one starting (0: all at once).' },
  times: { label: 'how many times' },
  speed: { help: 'Play: 1 is normal speed, 2 twice as fast. Spin: degrees per second. Flow: how fast the dots travel.' },
  from: { label: 'jump to (s)', help: 'Play: the second of the recording to start from.' },
  zoom: { help: '1 shows the whole board, 2 is twice as close.' },
  focus: { help: 'What the camera frames; "all" frames everything visible.' },
  padding: { help: 'Space around what the camera frames, in screen pixels.' },
  curve: { help: 'Bends the arrow: positive bends left, negative right (0.2 is gentle).' },
  values: { label: 'show values' },
  line: { label: 'line', help: 'Solid, dashed or dotted.' },
  weight: { label: 'thickness' },
  head: { label: 'arrowhead' },
  loop: { label: 'loop', help: 'Animated pictures and videos (APNG, GIF, animated WebP, WebM, MP4): start again at the end instead of stopping on the last frame.' },
  pinned: { label: 'fixed on screen', help: 'Stays in the same place and size on screen while the camera moves: for titles, notes and explanations next to something you zoom into. Turning it on keeps it where it looks now.' },
  frame: { label: 'frame', help: 'Draw a browser window around the picture, in the element\'s colour.' },
  url: { label: 'address bar', help: 'Text in the browser frame\'s address bar.' },
  src: { label: 'picture file', group: 'advanced' },
  shape: { help: 'Shape of the area (and of a spotlight on it).' },
  style: { label: 'style', help: 'Text: handwritten marker, bold outlined capitals, or code (several lines allowed). Spotlight: what happens outside it, darker or faded.' },
  amount: { label: 'strength', help: 'How much darker or fainter, from 0 to 1.' },
  on: { help: 'Off turns it off.' },
};

/** Position and size fields, shown together as a compact grid with drawing-program style labels. */
const GEOMETRY = ['x', 'y', 'width', 'height', 'size', 'scale', 'rotate', 'radius'];
/** Keys never shown (replaced by others). */
const ALWAYS_HIDDEN = ['dashed'];

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
  const entries = Object.entries(schema.properties).filter(([key, p]) => !hide.includes(key) && !ALWAYS_HIDDEN.includes(key) && p.const === undefined);
  const geometry = entries.filter(([k, p]) => GEOMETRY.includes(k) && p.type === 'number');
  const row = ([key, p]: [string, Prop]) => {
    const info = FIELD_INFO[key] ?? {};
    return (
      <label key={key} className="field" title={info.help}>
        <span>{info.label ?? key}{info.help ? <i className="help">?</i> : null}</span>
        {key === 'camera' && p.type === 'object'
          ? <StartView value={value[key] as Raw | undefined} currentView={currentView} onChange={(v) => onChange(key, v)} />
          : key === 'text' && value.type === 'text' && (value.style === 'code' || String(value.text ?? '').includes('\n'))
            ? <TextAreaField value={value[key] as string | undefined} onChange={(v) => onChange(key, v)} />
          : key === 'notes'
            ? <ProseField value={value[key] as string | undefined} placeholder="What you say over this beat. Each sentence gets its own prompter line; your line breaks are kept." onChange={(v) => onChange(key, v)} />
          : key === 'track'
            ? <TrackField value={value[key] as string | undefined} onChange={(v) => onChange(key, v)} />
            : <Field name={key} prop={p} value={key === 'line' ? value.line ?? (value.dashed ? 'dashed' : undefined) : value[key]} ids={ids} onChange={(v) => onChange(key, v)} />}
      </label>
    );
  };
  const main = entries.filter(([k]) => !FIELD_INFO[k]?.group && !geometry.some(([g]) => g === k));
  const video = entries.filter(([k]) => FIELD_INFO[k]?.group === 'video');
  const adv = entries.filter(([k]) => FIELD_INFO[k]?.group === 'advanced');
  return (
    <div className="fields">
      {geometry.length > 0 && (
        <div className="geo-grid">
          {geometry.map(([k, p]) => (
            <GeoField key={k} name={k} value={value[k] as number | undefined} placeholder={p.default !== undefined ? String(p.default) : ''} onChange={(v) => onChange(k, v)} />
          ))}
        </div>
      )}
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
  if (prop.enum && pictures && prop.enum.every((o: string) => o in pictures)) return <IconChoice value={value as string | undefined} options={prop.enum} fallback={prop.default ?? (name === 'line' ? 'solid' : undefined)} pictures={pictures} onChange={onChange} />;
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
