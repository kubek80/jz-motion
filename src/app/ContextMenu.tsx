import { useEffect } from 'react';

// A right-click menu at the pointer: a heading, items (some greyed out, some red), separators. Closes on a
// click elsewhere, Esc, or when the window loses focus. Used by the scene list and the Timing timeline.

export type MenuItem =
  | { label: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: 'ai' | 'danger'; hint?: string }
  | 'separator';

export interface MenuAt { x: number; y: number }

/** Where to open a menu for this right-click, kept inside the window. */
export const menuAt = (e: React.MouseEvent, height = 300, width = 260): MenuAt => ({
  x: Math.min(e.clientX, window.innerWidth - width),
  y: Math.min(e.clientY, window.innerHeight - height),
});

export function ContextMenu({ at, title, items, onClose }: { at: MenuAt; title?: React.ReactNode; items: MenuItem[]; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('pointerdown', onClose);
    window.addEventListener('keydown', esc, true);
    window.addEventListener('blur', onClose);
    return () => { window.removeEventListener('pointerdown', onClose); window.removeEventListener('keydown', esc, true); window.removeEventListener('blur', onClose); };
  }, [onClose]);
  return (
    <div className="context-menu" style={{ left: at.x, top: at.y }} role="menu" onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      {title && <div className="menu-head muted">{title}</div>}
      {items.map((it, i) => it === 'separator' ? <hr key={i} /> : (
        <button key={i} role="menuitem" className={it.tone ?? ''} disabled={it.disabled} title={it.hint} onClick={() => { onClose(); it.onClick(); }}>
          {it.label}
        </button>
      ))}
    </div>
  );
}
