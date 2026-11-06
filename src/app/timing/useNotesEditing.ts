// Editing a beat's speaker notes right from the prompter: which beat is open, its draft text,
// and saving it back to the presentation.
import { useState } from 'react';
import type { Click } from '../../video/performance';

export function useNotesEditing(pause: () => void, onNotes: (scene: number, beat: number, notes: string) => void) {
  // ---------------------------------------------------------------- editing a beat's notes right from the prompter
  const [editingBeat, setEditingBeat] = useState<{ scene: number; beat: number } | null>(null);
  const [draftNotes, setDraftNotes] = useState('');
  const startEditing = (scene: number, beat: number, notes: string | undefined) => {
    pause();
    setDraftNotes(notes ?? '');
    setEditingBeat({ scene, beat });
  };
  const saveEditing = () => {
    if (editingBeat) onNotes(editingBeat.scene, editingBeat.beat, draftNotes);
    setEditingBeat(null);
  };
  const editingThis = (c?: Click) => !!editingBeat && !!c && editingBeat.scene === c.scene && editingBeat.beat === c.beat;

  return { setEditingBeat, draftNotes, setDraftNotes, startEditing, saveEditing, editingThis };
}

export type NotesEditing = ReturnType<typeof useNotesEditing>;
