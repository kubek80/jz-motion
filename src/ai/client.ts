import { compile } from '../engine/compile';
import { extractJson, repairPrompt, SYSTEM_PROMPT, userPrompt, type GenerateMode } from './prompt';
import type { ModelProfile } from './profiles';

export interface Usage { prompt: number; completion: number; cost?: number }

export interface GenerateResult {
  ok: boolean;
  /** The presentation as returned (when it parsed as JSON), even if it has errors. */
  presentation?: unknown;
  errors: string[];
  /** Requests made, including repairs. */
  attempts: number;
  ms: number;
  usage: Usage;
}

interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

const MAX_REPAIRS = 2;

/** One chat completion through the dev server's proxy (which adds the key and avoids browser CORS limits). */
async function chat(profile: ModelProfile, messages: ChatMessage[], fetcher: Fetch, signal?: AbortSignal) {
  const body: Record<string, unknown> = { model: profile.model, messages, temperature: 0.4 };
  if (/openrouter\.ai/.test(profile.baseURL)) body.usage = { include: true };
  const res = await fetcher('/api/llm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ baseURL: profile.baseURL, apiKey: profile.apiKey, body }),
    signal,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  const content: string | undefined = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error(`no message in the reply: ${text.slice(0, 200)}`);
  return {
    content,
    usage: {
      prompt: data.usage?.prompt_tokens ?? 0,
      completion: data.usage?.completion_tokens ?? 0,
      cost: typeof data.usage?.cost === 'number' ? data.usage.cost : undefined,
    },
  };
}

/** Asks a model for a presentation and sends the compiler's errors back until it loads (or repairs run out). */
export async function generate(
  profile: ModelProfile,
  request: string,
  mode: GenerateMode,
  current: string | undefined,
  opts: { fetcher?: Fetch; signal?: AbortSignal } = {},
): Promise<GenerateResult> {
  const fetcher = opts.fetcher ?? ((url, init) => fetch(url, init));
  const started = Date.now();
  const usage: Usage = { prompt: 0, completion: 0 };
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt(request, mode, current) },
  ];
  let presentation: unknown;
  let errors: string[] = [];

  for (let attempt = 1; attempt <= MAX_REPAIRS + 1; attempt++) {
    let reply;
    try {
      reply = await chat(profile, messages, fetcher, opts.signal);
    } catch (e) {
      return { ok: false, presentation, errors: [`request failed: ${(e as Error).message}`], attempts: attempt, ms: Date.now() - started, usage };
    }
    usage.prompt += reply.usage.prompt;
    usage.completion += reply.usage.completion;
    if (reply.usage.cost !== undefined) usage.cost = (usage.cost ?? 0) + reply.usage.cost;
    messages.push({ role: 'assistant', content: reply.content });

    try {
      presentation = extractJson(reply.content);
      const result = compile(presentation);
      if (result.ok) return { ok: true, presentation, errors: [], attempts: attempt, ms: Date.now() - started, usage };
      errors = result.errors;
    } catch (e) {
      errors = [`the reply is not valid JSON: ${(e as Error).message}`];
    }
    messages.push({ role: 'user', content: repairPrompt(errors.slice(0, 30)) });
  }
  return { ok: false, presentation, errors, attempts: MAX_REPAIRS + 1, ms: Date.now() - started, usage };
}
