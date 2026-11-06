import { useEffect, useState } from 'react';

// Position and size fields like a drawing program: a letter or small picture inside each field, and a
// label you can drag sideways to change the number.

/** Labels for the position and size grid: letters like drawing programs, pictures for the rest. */
const GEO_LABEL: Record<string, { mark: React.ReactNode; title: string; step: number }> = {
  x: { mark: 'X', title: 'X: horizontal position of the middle', step: 1 },
  y: { mark: 'Y', title: 'Y: vertical position of the middle', step: 1 },
  width: { mark: 'W', title: 'Width', step: 1 },
  height: { mark: 'H', title: 'Height', step: 1 },
  size: {
    mark: <svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 12L12 2M7.5 2H12V6.5M2 7.5V12H6.5" /></svg>,
    title: 'Size', step: 1,
  },
  scale: {
    mark: <svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 12L12 2M7.5 2H12V6.5M2 7.5V12H6.5" /></svg>,
    title: 'Scale (size of the 3D model)', step: 0.5,
  },
  rotate: {
    mark: <svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M11.5 7A4.5 4.5 0 1 1 9.2 3.1" /><path d="M9 1V3.4H11.4" /></svg>,
    title: 'Rotation (degrees)', step: 1,
  },
  radius: {
    mark: <svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 12V7A5 5 0 0 1 7 2H12" /></svg>,
    title: 'Corner radius', step: 1,
  },
};

/** A number with a label you can drag sideways to change it (Shift: ×10), like in drawing programs. */
export function GeoField({ name, value, placeholder, onChange }: { name: string; value?: number; placeholder: string; onChange: (v: number | undefined) => void }) {
  const info = GEO_LABEL[name] ?? { mark: name, title: name, step: 1 };
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  const [scrubbing, setScrubbing] = useState(false);
  useEffect(() => setDraft(value === undefined ? '' : String(value)), [value]);
  const commit = (text: string) => {
    const n = text.trim() === '' ? undefined : Number(text);
    if (n !== undefined && Number.isNaN(n)) return setDraft(value === undefined ? '' : String(value));
    if (n !== value) onChange(n);
  };
  const scrub = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const start = value ?? (Number(placeholder) || 0);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    setScrubbing(true);
    let latest = String(start);
    const move = (ev: PointerEvent) => {
      const step = info.step * (ev.shiftKey ? 10 : 1);
      const next = Math.round((start + Math.round((ev.clientX - startX) / 2) * step) * 100) / 100;
      latest = String(next);
      setDraft(latest);
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      setScrubbing(false);
      // One change when the drag ends, so a drag is one undo step.
      commit(latest);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };
  return (
    <label className={scrubbing ? 'geo scrubbing' : 'geo'} title={`${info.title}. Drag the label to change it.`}>
      <span className="geo-mark" onPointerDown={scrub}>{info.mark}</span>
      <input
        type="number" step="any" value={draft} placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)} onBlur={() => commit(draft)} onKeyDown={(e) => e.key === 'Enter' && commit(draft)}
      />
    </label>
  );
}

