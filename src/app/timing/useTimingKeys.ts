// The Timing window's keyboard shortcuts. Listens in the capture phase so its keys win over the
// editor's own shortcuts, and reads the latest handlers through a ref so the listener, added
// once, never calls a stale closure.
import { useEffect, useRef } from 'react';

export interface TimingKeys {
  playing: boolean;
  tapping: boolean;
  tap: () => void;
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  now: () => number;
  onClose: () => void;
  recording: boolean;
  nextLine: () => void;
  previousLine: () => void;
  stopRecording: () => Promise<void>;
  togglePauseRecording: () => void;
  splitAtPlayhead: () => void;
}

export function useTimingKeys(handlers: TimingKeys) {
  const keys = useRef(handlers);
  keys.current = handlers;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      // A right-click menu is open: Esc closes it, not the Timing window.
      if (document.querySelector('.context-menu, .transcript-window')) return;
      // Esc with the beat drawer open closes the drawer (it handles that itself).
      if (e.key === 'Escape' && document.querySelector('.beat-drawer')) return;
      const k = keys.current;
      if (k.recording) {
        // Space during recording: hold the prompter/board still while the mic keeps capturing,
        // so I can finish a sentence. Press again to resume.
        if (e.key === ' ') k.togglePauseRecording();
        else if (['ArrowRight', 'ArrowDown', 'PageDown', 'Enter'].includes(e.key)) k.nextLine();
        else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) k.previousLine();
        else if (e.key === 'Escape') void k.stopRecording();
        else return;
      } else if (e.key === ' ') (k.playing ? k.pause() : k.play());
      else if (e.key.toLowerCase() === 't' && k.tapping) k.tap();
      else if (e.key.toLowerCase() === 's') k.splitAtPlayhead();
      else if (e.key === 'ArrowLeft') k.seek(k.now() - (e.shiftKey ? 10 : 2));
      else if (e.key === 'ArrowRight') k.seek(k.now() + (e.shiftKey ? 10 : 2));
      else if (e.key === 'Escape') k.onClose();
      else return;
      // Captured before the editor's own shortcuts, so Space doesn't also step the board.
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}
