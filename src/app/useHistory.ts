import { useCallback, useMemo, useRef, useState } from 'react';

const LIMIT = 200;
/** Typing within this many ms of the last change counts as one undo step. */
const MERGE_MS = 800;

/** A value with undo and redo. */
export function useHistory(initial: string) {
  const [state, setState] = useState({ past: [] as string[], value: initial, future: [] as string[] });
  const lastMerge = useRef(0);

  const set = useCallback((value: string, opts: { merge?: boolean } = {}) => {
    const now = Date.now();
    const merge = opts.merge && now - lastMerge.current < MERGE_MS;
    lastMerge.current = opts.merge ? now : 0;
    setState((s) => {
      if (value === s.value) return s;
      return { past: merge ? s.past : [...s.past, s.value].slice(-LIMIT), value, future: [] };
    });
  }, []);

  const undo = useCallback(() => setState((s) => (s.past.length ? { past: s.past.slice(0, -1), value: s.past.at(-1)!, future: [s.value, ...s.future] } : s)), []);
  const redo = useCallback(() => setState((s) => (s.future.length ? { past: [...s.past, s.value], value: s.future[0], future: s.future.slice(1) } : s)), []);

  return useMemo(
    () => ({ value: state.value, set, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0 }),
    [state, set, undo, redo],
  );
}
