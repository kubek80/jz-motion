/** A model to generate with: any OpenAI-compatible chat completions endpoint. */
export interface ModelProfile {
  id: string;
  name: string;
  baseURL: string;
  model: string;
  apiKey: string;
  /** Included in "Generate". */
  enabled: boolean;
}

export const PRESETS = [
  { label: 'Claude Code (my subscription)', baseURL: 'claude-code:', model: 'sonnet', hint: 'Uses the claude command on this computer with your own Claude login: no API key. Model: sonnet, opus or haiku (or a full model id). Works only where `npm run dev` runs, for you.' },
  { label: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', model: '', hint: 'Copy a model id (vendor/model) from openrouter.ai/models' },
  { label: 'RunPod (vLLM)', baseURL: 'https://api.runpod.ai/v2/ENDPOINT_ID/openai/v1', model: '', hint: 'Replace ENDPOINT_ID with your serverless endpoint id; the model is the one the endpoint serves' },
  { label: 'Local mock (no key)', baseURL: 'http://localhost:5199/v1', model: 'mock', hint: 'Run `npm run mock-llm` to try the flow without a key' },
  { label: 'Custom', baseURL: 'https://', model: '', hint: 'Any OpenAI-compatible /chat/completions endpoint' },
] as const;

const KEY = 'jzm.models';

export function loadProfiles(): ModelProfile[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveProfiles(list: ModelProfile[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable: profiles last for this page only.
  }
}
