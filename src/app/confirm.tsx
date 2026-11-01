import { useEffect, useState } from 'react';

// An in-app replacement for window.confirm: `await confirmDialog({...})` resolves true or false.
// <ConfirmHost /> is mounted once at the root and shows whichever question is waiting.

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Label of the confirming button, e.g. "Delete". */
  confirm?: string;
  /** Red confirming button, for things that remove work. */
  danger?: boolean;
}

interface Pending extends ConfirmOptions { resolve: (ok: boolean) => void }

let show: ((p: Pending) => void) | null = null;

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // Without a host (tests, or before the app mounted) fall back to the browser's dialog.
    if (!show) return resolve(window.confirm(options.message ? `${options.title}\n\n${options.message}` : options.title));
    show({ ...options, resolve });
  });
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => {
    show = setPending;
    return () => { show = null; };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    // Capture, so the editor's own shortcuts (Delete, Enter, Esc) don't also run.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!pending) return null;
  function close(ok: boolean) {
    pending!.resolve(ok);
    setPending(null);
  }
  return (
    <div className="modal-back confirm-back" onClick={() => close(false)}>
      <div className="modal confirm" role="alertdialog" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title">{pending.title}</h2>
        {pending.message && <p className="muted">{pending.message}</p>}
        <div className="row end">
          <button onClick={() => close(false)}>Cancel</button>
          <button className={pending.danger ? 'danger solid' : 'primary'} autoFocus onClick={() => close(true)}>{pending.confirm ?? 'OK'}</button>
        </div>
      </div>
    </div>
  );
}
