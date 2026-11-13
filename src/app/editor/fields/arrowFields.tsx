import { NumberField } from './inputs';

// An arrow's knots and a free end in the side panel: the numbers the board's handles change, shown and editable
// here too (the board is where they are usually moved: see useArrowDrag.ts).

type P = { x: number; y: number };

/** The knots, one row each (x, y, remove), in the order the arrow passes them. */
export function KnotsField({ value, onChange }: { value?: P[]; onChange: (v: unknown) => void }) {
  const knots = value ?? [];
  const set = (next: P[]) => onChange(next.length ? next : undefined);
  if (!knots.length) return <span className="muted hint">none: drag a ＋ on the selected arrow to add one</span>;
  return (
    <span className="knots">
      {knots.map((k, i) => (
        <span key={i} className="pair knot-row">
          <span className="muted">{i + 1}</span>
          <NumberField value={k.x} placeholder="x" onChange={(x) => set(knots.map((p, j) => (j === i ? { ...p, x: x ?? 0 } : p)))} />
          <NumberField value={k.y} placeholder="y" onChange={(y) => set(knots.map((p, j) => (j === i ? { ...p, y: y ?? 0 } : p)))} />
          <button type="button" className="small" title="Remove this knot" onClick={() => set(knots.filter((_, j) => j !== i))}>✕</button>
        </span>
      ))}
      <button type="button" className="small" onClick={() => set([])} title="A plain arrow again (its bend is the curve)">Remove all</button>
    </span>
  );
}

/** An end at a point on the board: where it is, or attach it to a drawing instead. */
export function PointEnd({ value, ids, onChange }: { value: P; ids: string[]; onChange: (v: unknown) => void }) {
  return (
    <span className="pair">
      <NumberField value={value.x} placeholder="x" onChange={(x) => onChange({ x: x ?? 0, y: value.y })} />
      <NumberField value={value.y} placeholder="y" onChange={(y) => onChange({ x: value.x, y: y ?? 0 })} />
      <select value="" onChange={(e) => e.target.value && onChange(e.target.value)} title="Attach this end to a drawing (its facing side)">
        <option value="">attach to…</option>
        {ids.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </span>
  );
}
