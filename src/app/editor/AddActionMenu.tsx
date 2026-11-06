import { useEffect, useRef, useState } from 'react';
import { actionInfo, cannotAdd, GROUPS } from './actionInfo';

// "+ action" under a beat: every action, grouped by what it is for, each with a line on what it does.
// Actions that can't be used on what is selected are greyed out with the reason.

interface Props {
  open: boolean;
  picked: string[];
  /** Element type by id, to tell which actions fit what is selected. */
  types: Record<string, string>;
  onToggle: () => void;
  onClose: () => void;
  onPick: (kind: string) => void;
}

export function AddActionMenu({ open, picked, types, onToggle, onClose, onPick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; bottom: number; maxHeight: number } | null>(null);
  useEffect(() => {
    // The strip scrolls sideways and would clip the menu, so it floats above the button in the page.
    const r = ref.current?.getBoundingClientRect();
    setAt(open && r ? { left: Math.max(8, Math.min(r.left, window.innerWidth - 470)), bottom: window.innerHeight - r.top + 4, maxHeight: r.top - 16 } : null);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc); };
  }, [open, onClose]);
  return (
    <div className="add-action" ref={ref}>
      <button className="add" onClick={onToggle}>+ action</button>
      {open && at && (
        <div className="action-menu" style={at} role="menu">
          <div className="menu-note">
            {picked.length ? <>For <b>{picked.join(', ')}</b></> : <span className="muted">Select elements on the board first to bring them in, point at them or move them.</span>}
          </div>
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h4>{g.title}</h4>
              {g.kinds.map((kind) => {
                const v = actionInfo(kind);
                const why = cannotAdd(kind, picked, types);
                return (
                  <button key={kind} role="menuitem" className={`fam-${v.family}`} disabled={!!why} title={why ?? v.does} onClick={() => onPick(kind)}>
                    <i>{v.icon}</i>
                    <span className="what"><b>{v.label}</b><small>{why ?? v.does}</small></span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
