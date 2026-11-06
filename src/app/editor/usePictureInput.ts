// Pictures from outside the app: paste a screenshot (Ctrl+V) or drop a picture file on the board to
// upload it and add it as an image element.
import { useEffect, useRef } from 'react';
import { imageFrom, uploadImage } from '../images';
import type { AddRequest } from './Library';

/** Listens for pasted pictures in edit mode; returns `addPicture` for the board's drop handler. */
export function usePictureInput(mode: 'edit' | 'play', add: (r: AddRequest) => void) {
  // Refs, so the window listener (set up once) always uses the current mode and `add`.
  const addRef = useRef(add);
  addRef.current = add;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const addPicture = (file: File | null) => {
    if (!file) return false;
    void uploadImage(file).then((image) => addRef.current({ kind: 'image', image }), (e) => alert(`Could not add the picture: ${(e as Error).message}`));
    return true;
  };
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (modeRef.current !== 'edit' || (e.target as HTMLElement).closest?.('textarea, input, [contenteditable], .cm-editor')) return;
      if (addPicture(imageFrom(e.clipboardData))) e.preventDefault();
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return addPicture;
}
