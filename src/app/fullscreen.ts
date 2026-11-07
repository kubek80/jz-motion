import { useEffect, useState } from 'react';

// Two kinds of full screen: the whole app (the top bar's ⛶ button), and the board alone while presenting
// (Present, or F in Play mode), which can sit on top of the first; leaving it returns to the app full screen.

/** Whether the board alone is full screen (presenting), not the whole app. */
export const boardFullscreen = () => !!document.fullscreenElement && document.fullscreenElement !== document.documentElement;

/** The whole app full screen, or back. */
export async function toggleAppFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen();
}

/** Whether anything is full screen, kept up to date. */
export function useFullscreen() {
  const [on, setOn] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const change = () => setOn(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, []);
  return on;
}
