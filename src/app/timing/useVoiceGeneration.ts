// Generated voice (text to speech): one clip per sentence of each beat's notes, kept in the
// presentation's sidecar, so the prompter knows how long each line should take.
import { useEffect, useMemo, useState } from 'react';
import type { CompiledPresentation } from '../../engine/compile';
import { loadVoicer } from '../settingsStore';
import { entryFor, loadSidecar, requestTts, splitSentences, type TtsSidecar } from '../tts';

export function useVoiceGeneration(presentation: CompiledPresentation, presentationId: string, setError: (e: string | null) => void) {
  // ---------------------------------------------------------------- generated voice: a clip per sentence of each beat's notes
  const voicer = useMemo(() => loadVoicer(), []);
  const [tts, setTts] = useState<TtsSidecar>({});
  const [generating, setGenerating] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => {
    void loadSidecar(presentationId).then(setTts).catch(() => undefined);
  }, [presentationId]);
  /** Every sentence that has no clip yet in the current voice/model, deduplicated. */
  const missingSentences = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const scene of presentation.scenes) for (const beat of scene.beats) for (const text of splitSentences(beat.notes)) {
      if (seen.has(text)) continue;
      seen.add(text);
      if (!entryFor(tts, voicer, text)) out.push(text);
    }
    return out;
  }, [presentation, tts, voicer]);
  const generateVoice = async () => {
    if (!missingSentences.length) return;
    setError(null);
    setGenerating({ done: 0, total: missingSentences.length });
    let current = { ...tts };
    try {
      for (let i = 0; i < missingSentences.length; i++) {
        const r = await requestTts(presentationId, missingSentences[i], voicer);
        current = { ...current, [r.hash]: { text: r.text, audio: r.audio, duration: r.duration, voice: r.voice, model: r.model } };
        setTts(current);
        setGenerating({ done: i + 1, total: missingSentences.length });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(null);
    }
  };

  return { voicer, tts, generating, missingSentences, generateVoice };
}
