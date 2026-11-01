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

interface Props {
  schema: { properties: Record<string, Prop>; required?: string[] };
  value: Raw;
  ids: string[];
  onChange: (key: string, value: unknown) => void;
  /** Keys not to show (shown elsewhere, or fixed). */
  hide?: string[];
}

export function Fields({ schema, value, ids, onChange, hide = [] }: Props) {
  return (
    <div className="fields">
      {Object.entries(schema.properties)
        .filter(([key, p]) => !hide.includes(key) && p.const === undefined)
        .map(([key, p]) => (
          <label key={key} className="field">
            <span>{key}{schema.required?.includes(key) ? '' : ''}</span>
            <Field name={key} prop={p} value={value[key]} ids={ids} onChange={(v) => onChange(key, v)} />
          </label>
        ))}
    </div>
  );
}

function Field({ name, prop, value, ids, onChange }: { name: string; prop: Prop; value: unknown; ids: string[]; onChange: (v: unknown) => void }) {
  const placeholder = prop.default !== undefined ? String(prop.default) : '';

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
    return (
      <select value={value === undefined ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === 'true')}>
        <option value="">{placeholder ? `(${placeholder})` : '—'}</option>
        <option value="true">yes</option>
        <option value="false">no</option>
      </select>
    );
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
