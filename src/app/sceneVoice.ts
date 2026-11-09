import { clones, type Voicer } from './settingsStore';

// A scene's narration generated (again) in the voice in use and put on the timeline, from the Script page or Timing:
// the server (server/sceneVoice.ts) returns the presentation with the scene's clip in place and what follows moved.

export interface SceneVoiceResult { presentation: unknown; note: string; avatar: boolean }

export async function generateSceneVoice(doc: unknown, presentationId: string, sceneId: string, voicer: Voicer): Promise<SceneVoiceResult> {
  if (!voicer.apiKey) throw new Error(`No key for ${voicer.baseURL}: add it in Settings → Voice generation.`);
  const res = await fetch('/api/voice/scene', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ presentation: doc, presentationId, scene: sceneId, fresh: true, voice: voicer.voice, model: voicer.model, baseURL: voicer.baseURL, apiKey: voicer.apiKey, instructions: voicer.instructions, sample: clones(voicer) ? voicer.sample : undefined }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? res.statusText);
  return j as SceneVoiceResult;
}

/** What to tell after generating: the note, and that the avatar said the old words when it did. */
export const sceneVoiceNote = (r: SceneVoiceResult) => (r.avatar ? `${r.note}. Its avatar said the old words: make it again (right-click the clip in Timing).` : r.note);
