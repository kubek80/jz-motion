// Keyboard shortcuts of the editor window: undo/redo everywhere; Delete, Escape, Enter/F2, Ctrl+D and
// 0/Home on the board in edit mode; stepping through beats and F (full screen) in play mode.
import { useEffect, useRef } from 'react';
import type { Stage } from '../../engine';
import { log } from '../debug';
import type { Selection } from './types';

interface EditorKeys {
  mode: 'edit' | 'play';
  picked: string[];
  deletePicked: (list: string[]) => void;
  history: { undo: () => void; redo: () => void };
  duplicate: (id: string) => void;
  startInline: (id: string) => void;
  resetView: (fit?: boolean) => void;
  togglePresent: () => Promise<void>;
}

interface Setters {
  stage: React.RefObject<Stage | null>;
  setPicked: (ids: string[]) => void;
  setSelection: (s: Selection) => void;
  setArrowFrom: (from: string | null | undefined) => void;
}

/**
 * One window listener for the editor's lifetime; it reads the current state through a ref (`current`
 * is refreshed on every render) so it never acts on a stale selection or mode.
 */
export function useEditorKeys(current: EditorKeys, { stage, setPicked, setSelection, setArrowFrom }: Setters) {
  const keyState = useRef(current);
  keyState.current = current;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keyState.current;
      const typing = (e.target as HTMLElement).closest('textarea, input, select');
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !typing) {
        if (e.shiftKey) { log('redo:ctrlShiftZ'); k.history.redo(); }
        else { log('undo:ctrlZ'); k.history.undo(); }
      } else if (mod && e.key.toLowerCase() === 'y' && !typing) {
        log('redo:ctrlY');
        k.history.redo();
      } else if (typing) {
        return;
      } else if (k.mode === 'edit') {
        if (e.key === 'Delete' || e.key === 'Backspace') k.deletePicked(k.picked);
        else if (e.key === 'Escape') { setPicked([]); setSelection(null); setArrowFrom(undefined); }
        else if ((e.key === 'Enter' || e.key === 'F2') && k.picked.length === 1) k.startInline(k.picked[0]);
        else if (mod && e.key.toLowerCase() === 'd' && k.picked.length === 1) k.duplicate(k.picked[0]);
        else if (e.key === '0' || e.key === 'Home') k.resetView(e.shiftKey);
        else return;
      } else {
        const s = stage.current;
        if (!s) return;
        if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) s.next();
        else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) s.prev();
        else if (e.key === 'f') void k.togglePresent();
        else return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
