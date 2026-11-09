import { useEffect, useState } from 'react';
import { loadProfiles } from '../ai/profiles';
// Settings kept in this browser: the speech-to-text service, the voice generator, and which model each kind of request uses.

export interface Transcriber { baseURL: string; model: string; apiKey: string }

export const TRANSCRIBERS = [
  { label: 'OpenAI (whisper-1)', baseURL: 'https://api.openai.com/v1', model: 'whisper-1' },
  { label: 'Groq (whisper-large-v3)', baseURL: 'https://api.groq.com/openai/v1', model: 'whisper-large-v3' },
  { label: 'OpenRouter (whisper-1)', baseURL: 'https://openrouter.ai/api/v1', model: 'openai/whisper-1' },
  { label: 'Local mock (no key)', baseURL: 'http://localhost:5199/v1', model: 'mock' },
  { label: 'Custom', baseURL: 'https://', model: '' },
];

/** A part of one of your recordings that a cloning model copies the voice of. */
export interface VoiceSample { upload: string; start: number; end: number; name?: string; /** What is said in it (a sample read from a given text). */ text?: string }

/** Voice generation (text to speech). Any OpenAI-compatible /audio/speech endpoint. */
export interface Voicer {
  baseURL: string; model: string; voice: string; apiKey: string;
  /** How to speak ("calm, clear narrator"), for models that take a style. */
  instructions?: string;
  /** Your voice, for models that clone (sent instead of a voice name). */
  sample?: VoiceSample;
}

const OR = 'https://openrouter.ai/api/v1';
export const VOICERS: { label: string; baseURL: string; model: string; voice?: string; clones?: boolean; styled?: boolean }[] = [
  { label: 'OpenRouter · my voice (Fish Audio S2.1 Pro, clones; ~1.5¢ per 1,000 characters)', baseURL: OR, model: 'fish-audio/s2.1-pro', clones: true, styled: true },
  { label: 'OpenRouter · my voice (HeyGen Voice 1, clones; ~1.5¢)', baseURL: OR, model: 'heygen/heygen-voice-1', clones: true },
  { label: 'OpenRouter · ElevenLabs v4 (most natural; ~8¢)', baseURL: OR, model: 'elevenlabs/eleven-v4', voice: 'george' },
  { label: 'OpenRouter · Microsoft MAI-Voice 2.1 (~2.2¢)', baseURL: OR, model: 'microsoft/mai-voice-2.1', voice: 'en-US-Grant:MAI-Voice-2.1' },
  { label: 'OpenRouter · Gemini 3.8 Flash TTS (follows a style; very cheap)', baseURL: OR, model: 'google/gemini-3.8-flash-tts', voice: 'Charon', styled: true },
  { label: 'OpenRouter · MiniMax Speech 2.8 HD (~10¢)', baseURL: OR, model: 'minimax/speech-2.8-hd', voice: 'English_expressive_narrator' },
  { label: 'OpenRouter · Voxtral (~1.6¢)', baseURL: OR, model: 'mistralai/voxtral-mini-tts-2603', voice: 'en_paul_neutral' },
  { label: 'OpenAI (gpt-4o-mini-tts, cheapest)', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini-tts', styled: true },
  { label: 'OpenAI (tts-1)', baseURL: 'https://api.openai.com/v1', model: 'tts-1' },
  { label: 'OpenAI (tts-1-hd)', baseURL: 'https://api.openai.com/v1', model: 'tts-1-hd' },
  { label: 'Custom', baseURL: 'https://', model: '' },
];

/** Whether the chosen model copies a voice from a sample (then the sample is sent, not a voice name). */
export const clones = (v: { baseURL: string; model: string }) => !!VOICERS.find((p) => p.baseURL === v.baseURL && p.model === v.model)?.clones;

/** Common voices (OpenAI's, and Voxtral's on OpenRouter); you can type any name a provider supports. */
export const VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'en_paul_neutral'];

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: settings last for this page.
  }
};

/** Accents your cloned voice can speak in: a speaking style sent to the cloning model (Fish Audio follows it). */
export const ACCENTS: { label: string; instructions?: string }[] = [
  { label: 'As in my sample' },
  { label: 'Lighter accent', instructions: 'Speak clear, natural English with a lighter accent: smoother vowels and softer consonants, but still clearly the same person.' },
  { label: 'Neutral British', instructions: 'Speak in a neutral, standard British English accent, clear and calm, as a native speaker would, keeping the same voice.' },
  { label: 'Neutral American', instructions: 'Speak in a neutral, standard American English accent, clear and calm, as a native speaker would, keeping the same voice.' },
];

/** Your fal.ai key, for your avatar's talking-head videos (Settings → My avatar). */
export const loadFalKey = () => read<string>('jzm.falKey', '');
export const saveFalKey = (key: string) => write('jzm.falKey', key);
export const loadTranscriber = () => read<Transcriber>('jzm.transcriber', { baseURL: TRANSCRIBERS[0].baseURL, model: TRANSCRIBERS[0].model, apiKey: '' });
export const saveTranscriber = (t: Transcriber) => write('jzm.transcriber', t);

export const loadVoicer = () => read<Voicer>('jzm.voicer', { baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini-tts', voice: VOICES[0], apiKey: '' });
/** Saves the voice settings and tells open windows (Timing, Script), so they use the new voice straight away. */
export const saveVoicer = (v: Voicer) => { write('jzm.voicer', v); window.dispatchEvent(new Event('jzm-voicer-changed')); };

/** What you start a presentation from on the home screen. */
export type StartMode = 'topic' | 'script' | 'recording';

/** The model chosen for each start mode (profile ids). */
export const loadModeModels = () => read<Partial<Record<StartMode, string>>>('jzm.modeModels', {});
export const saveModeModel = (mode: StartMode, id: string) => write('jzm.modeModels', { ...loadModeModels(), [mode]: id });

const host = (url: string) => { try { return new URL(url).host; } catch { return ''; } };
/** A model under Models with a key for the same service (OpenRouter, OpenAI…), for a voice with no key of its own. */
export const sharedKey = (v: Pick<Voicer, 'baseURL'>) => loadProfiles().find((p) => p.apiKey && host(p.baseURL) === host(v.baseURL))?.apiKey;
/** The voice settings with a key: their own, or the same service's key from Models. */
export const withKey = (v: Voicer): Voicer => (v.apiKey ? v : { ...v, apiKey: sharedKey(v) ?? '' });

/** The voice settings (with a key, see withKey), kept up to date when they change (Settings, or My voice). */
export function useVoicer(): Voicer {
  const [v, setV] = useState(() => withKey(loadVoicer()));
  useEffect(() => {
    const changed = () => setV(withKey(loadVoicer()));
    window.addEventListener('jzm-voicer-changed', changed);
    return () => window.removeEventListener('jzm-voicer-changed', changed);
  }, []);
  return v;
}

/**
 * Keeps your voice with the project (voice/my-voice.json and the sample in uploads/voice-sample-*, both in git):
 * so it works on another computer, and for an assistant working in the repository. Never the key.
 */
export async function keepVoiceInProject(v: Voicer): Promise<Voicer> {
  if (!v.sample || !clones(v)) return v;
  const res = await fetch('/api/my-voice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baseURL: v.baseURL, model: v.model, instructions: v.instructions, sample: v.sample }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  const saved = (await res.json()) as { sample: VoiceSample };
  const next = { ...v, sample: saved.sample };
  saveVoicer(next);
  return next;
}

/** The project's voice (voice/my-voice.json), if any. */
export async function projectVoice(): Promise<{ baseURL: string; model: string; instructions?: string; sample: VoiceSample } | null> {
  try { const r = await fetch('/api/my-voice'); const v = await r.json(); return v?.sample ? v : null; } catch { return null; }
}

/**
 * The project's voice (the avatar in use, voice/my-voice.json) is the one to speak in: a browser follows it when the
 * app starts, its sample, model and speaking style, so a sample remembered from another computer, or replaced since,
 * is never used. A browser with a sample of its own from a recording (not a voice sample) keeps it.
 */
export async function adoptProjectVoice() {
  const here = loadVoicer();
  if (here.sample && !here.sample.upload.startsWith('voice-sample-')) return;
  const v = await projectVoice();
  if (!v) return;
  const next: Voicer = { ...here, baseURL: v.baseURL, model: v.model, instructions: v.instructions, sample: v.sample };
  if (JSON.stringify(next) !== JSON.stringify(here)) saveVoicer(next);
}
