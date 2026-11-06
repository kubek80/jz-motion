import { useCallback, useEffect, useState, type CSSProperties } from 'react';

/**
 * A draggable divider between two panels. The parent reads `value` and applies it (as a width,
 * height, or any CSS length) to the element whose size it controls. Dragging updates `value` via
 * `onChange`. Double-click calls `onReset` to go back to the default.
 *
 * Orientation:
 *  - `horizontal`: a horizontal bar; dragging it up/down changes a height (wraps `.resizer-h`).
 *  - `vertical`:   a vertical bar; dragging it left/right changes a width (wraps `.resizer-v`).
 *
 * `reverse`: when true, dragging the opposite way grows the value. Use when the controlled element
 * lives on the far side of the handle (e.g. a timeline below the handle: dragging the handle UP
 * should GROW the timeline's height, so delta is inverted).
 */
export function Resizer({
  orientation,
  value,
  onChange,
  onReset,
  reverse = false,
  min = 60,
  max = 5000,
  style,
}: {
  orientation: 'horizontal' | 'vertical';
  value: number;
  onChange: (v: number) => void;
  onReset: () => void;
  reverse?: boolean;
  min?: number;
  max?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      className={orientation === 'horizontal' ? 'resizer resizer-h' : 'resizer resizer-v'}
      role="separator"
      title="Drag to resize · double-click to reset"
      style={style}
      onDoubleClick={onReset}
      onPointerDown={(e) => {
        e.preventDefault();
        const target = e.currentTarget as HTMLElement;
        target.setPointerCapture(e.pointerId);
        target.classList.add('dragging');
        const axis: 'x' | 'y' = orientation === 'horizontal' ? 'y' : 'x';
        const startPos = axis === 'y' ? e.clientY : e.clientX;
        const startValue = value;
        const sign = reverse ? -1 : 1;
        const move = (ev: PointerEvent) => {
          const cur = axis === 'y' ? ev.clientY : ev.clientX;
          const next = Math.max(min, Math.min(max, startValue + sign * (cur - startPos)));
          onChange(next);
        };
        const up = () => {
          target.removeEventListener('pointermove', move);
          target.removeEventListener('pointerup', up);
          target.releasePointerCapture?.(e.pointerId);
          target.classList.remove('dragging');
        };
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', up);
      }}
    />
  );
}

/**
 * Persistent numeric size, kept in localStorage under `jzm.layout.<key>`. `reset()` clears the
 * stored value and returns to `defaultValue`. Setter clamps to [min, max].
 */
export function useResizable(key: string, defaultValue: number, min: number, max: number) {
  const storageKey = `jzm.layout.${key}`;
  const [value, setRaw] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(storageKey));
      return Number.isFinite(v) && v >= min && v <= max ? v : defaultValue;
    } catch { return defaultValue; }
  });
  const setValue = useCallback((v: number) => {
    const clamped = Math.max(min, Math.min(max, v));
    setRaw(clamped);
    try { localStorage.setItem(storageKey, String(clamped)); } catch { /* ignore */ }
  }, [min, max, storageKey]);
  const reset = useCallback(() => {
    setRaw(defaultValue);
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
  }, [defaultValue, storageKey]);
  // Keep in sync across browser tabs editing the same app.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      const v = Number(e.newValue);
      setRaw(Number.isFinite(v) && v >= min && v <= max ? v : defaultValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageKey, defaultValue, min, max]);
  return { value, setValue, reset };
}
