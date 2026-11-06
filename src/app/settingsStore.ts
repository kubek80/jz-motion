// Settings kept in this browser: the speech-to-text service, the voice generator, and which model each kind of request uses.

export interface Transcriber { baseURL: string; model: string; apiKey: string }

export const TRANSCRIBERS = [
  { label: 'OpenAI (whisper-1)', baseURL: 'https://api.openai.com/v1', model: 'whisper-1' },
  { label: 'Groq (whisper-large-v3)', baseURL: 'https://api.groq.com/openai/v1', model: 'whisper-large-v3' },
  { label: 'OpenRouter (whisper-1)', baseURL: 'https://openrouter.ai/api/v1', model: 'openai/whisper-1' },
  { label: 'Local mock (no key)', baseURL: 'http://localhost:5199/v1', model: 'mock' },
  { label: 'Custom', baseURL: 'https://', model: '' },
];

/** Voice generation (text to speech). Any OpenAI-compatible /audio/speech endpoint. */
export interface Voicer { baseURL: string; model: string; voice: string; apiKey: string }

export const VOICERS = [
  { label: 'OpenAI (gpt-4o-mini-tts, cheapest)', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini-tts' },
  { label: 'OpenAI (tts-1)', baseURL: 'https://api.openai.com/v1', model: 'tts-1' },
  { label: 'OpenAI (tts-1-hd)', baseURL: 'https://api.openai.com/v1', model: 'tts-1-hd' },
  { label: 'Custom', baseURL: 'https://', model: '' },
];

/** Common OpenAI voices; a Custom input lets you type any name a provider supports. */
export const VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];

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

export const loadVoicer = () => read<Voicer>('jzm.voicer', { baseURL: VOICERS[0].baseURL, model: VOICERS[0].model, voice: VOICES[0], apiKey: '' });
export const saveVoicer = (v: Voicer) => write('jzm.voicer', v);

/** What you start a presentation from on the home screen. */
export type StartMode = 'topic' | 'script' | 'recording';

/** The model chosen for each start mode (profile ids). */
export const loadModeModels = () => read<Partial<Record<StartMode, string>>>('jzm.modeModels', {});
export const saveModeModel = (mode: StartMode, id: string) => write('jzm.modeModels', { ...loadModeModels(), [mode]: id });
