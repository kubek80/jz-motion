import { useEffect, useState } from 'react';
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

/** The voice settings, kept up to date when they change (Settings, or "Use as my voice" on a clip). */
export function useVoicer(): Voicer {
  const [v, setV] = useState(loadVoicer);
  useEffect(() => {
    const changed = () => setV(loadVoicer());
    window.addEventListener('jzm-voicer-changed', changed);
    return () => window.removeEventListener('jzm-voicer-changed', changed);
  }, []);
  return v;
}
