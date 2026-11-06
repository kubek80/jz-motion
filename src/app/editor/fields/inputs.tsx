import { useEffect, useState } from 'react';
import { anchorNames } from '../../../engine/schema';

// The plain inputs property forms are made of: text, several lines, numbers, references to elements,
// lists of ids, and raw JSON. Each commits on blur or Enter, so typing doesn't rebuild the board on every key.

export function Select({ value, options, empty = '—', onChange }: { value: unknown; options: string[]; empty?: string; onChange: (v: unknown) => void }) {
  return (
    <select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">{empty}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

/** Commits on blur or Enter, so typing doesn't rebuild the board on every key. */
export function TextField({ value, placeholder, onChange }: { value?: string; placeholder?: string; onChange: (v: unknown) => void }) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);
  const commit = () => draft !== (value ?? '') && onChange(draft === '' ? undefined : draft);
  return <input value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />;
}

/** Several lines (code): commits when focus leaves, or with Ctrl+Enter. */
export function TextAreaField({ value, onChange }: { value?: string; onChange: (v: unknown) => void }) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);
  const commit = () => draft !== (value ?? '') && onChange(draft === '' ? undefined : draft);
  return (
    <textarea
      className="code-input" rows={Math.min(12, Math.max(3, draft.split('\n').length + 1))} value={draft} spellCheck={false}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit();
        // Tab indents instead of leaving the field.
        if (e.key === 'Tab') {
          e.preventDefault();
          const t = e.currentTarget;
          const at = t.selectionStart;
          setDraft(draft.slice(0, at) + '  ' + draft.slice(t.selectionEnd));
          requestAnimationFrame(() => t.setSelectionRange(at + 2, at + 2));
        }
      }}
    />
  );
}

export function NumberField({ value, placeholder, onChange }: { value?: number; placeholder?: string; onChange: (v: number | undefined) => void }) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  useEffect(() => setDraft(value === undefined ? '' : String(value)), [value]);
  const commit = () => {
    const n = draft.trim() === '' ? undefined : Number(draft);
    if (n !== undefined && Number.isNaN(n)) return setDraft(value === undefined ? '' : String(value));
    if (n !== value) onChange(n);
  };
  return <input type="number" step="any" value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />;
}

export function RefField({ value, ids, onChange }: { value?: string; ids: string[]; onChange: (v: unknown) => void }) {
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
export function IdList({ value, ids, allowAll, onChange }: { value: unknown; ids: string[]; allowAll?: boolean; onChange: (v: unknown) => void }) {
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

export function Json({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
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

