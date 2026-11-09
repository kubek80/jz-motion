import { useState } from 'react';
import { generateSceneVoice, sceneVoiceNote } from '../sceneVoice';
import type { Voicer } from '../settingsStore';

// Timing's "✨ Generate this scene" (beside Record, and on a clip's or beat's right-click menu): the scene's notes said
// in the voice in use as one clip in place of its own (or where it plays, when it has none); what follows moves.

export function useSceneVoice(o: { doc: { scenes: { id: string }[] }; presentationId: string; voicer: Voicer; onDoc: (next: unknown) => void; setError: (e: string | null) => void }) {
  const [generating, setGenerating] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const generate = async (scene: number) => {
    const id = o.doc.scenes[scene]?.id;
    if (!id || generating !== null) return;
    setGenerating(scene);
    setNote(null);
    o.setError(null);
    try {
      const r = await generateSceneVoice(o.doc, o.presentationId, id, o.voicer);
      o.onDoc(r.presentation);
      setNote(sceneVoiceNote(r));
    } catch (e) {
      o.setError((e as Error).message);
    } finally {
      setGenerating(null);
    }
  };
  return { generating, note, generate };
}
