import { compile } from '../engine/compile';
import { extractJson, repairPrompt, systemPrompt, userPrompt, type GenerateMode } from './prompt';
import type { ModelProfile } from './profiles';

export interface Usage { prompt: number; completion: number; cost?: number }

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/** What a check says about a reply: the value to keep, or the problems to send back. */
export type Check<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** One step of a request, for showing what was sent and what came back. */
export interface TraceStep { kind: 'sent' | 'received' | 'checked' | 'failed'; text: string; detail?: string; ms: number }

export interface AskResult<T> {
  ok: boolean;
  value?: T;
  /** The reply parsed as JSON (when it was), even if it failed the check. */
  raw?: unknown;
  errors: string[];
  /** Requests made, including repairs. */
  attempts: number;
  ms: number;
  usage: Usage;
  /** What happened, step by step. */
  trace?: TraceStep[];
}

const MAX_REPAIRS = 2;

/** One chat completion through the dev server's proxy (which adds the key and avoids browser CORS limits). */
export async function chat(profile: ModelProfile, messages: ChatMessage[], fetcher: Fetch = (u, i) => fetch(u, i), signal?: AbortSignal) {
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

/**
 * Asks for a JSON reply and checks it; on problems, sends them back to the model to fix
 * (up to two times). Every LLM feature goes through this.
 */
export async function askJson<T>(
  profile: ModelProfile,
  messages: ChatMessage[],
  check: (value: unknown) => Check<T>,
  opts: { fetcher?: Fetch; signal?: AbortSignal; onStep?: (s: TraceStep) => void } = {},
): Promise<AskResult<T>> {
  const started = Date.now();
  const usage: Usage = { prompt: 0, completion: 0 };
  const convo = [...messages];
  const trace: TraceStep[] = [];
  const step = (s: Omit<TraceStep, 'ms'>) => {
    const t = { ...s, ms: Date.now() - started };
    trace.push(t);
    opts.onStep?.(t);
  };
  let raw: unknown;
  let errors: string[] = [];

  for (let attempt = 1; attempt <= MAX_REPAIRS + 1; attempt++) {
    const sent = attempt === 1 ? convo : convo.slice(-1);
    step({
      kind: 'sent',
      text: attempt === 1 ? `Asked ${profile.name} (${chars(convo)} of instructions and context)` : `Sent the problems back to ${profile.name} to fix (try ${attempt})`,
      detail: sent.map((m) => `── ${m.role} ──\n${m.content}`).join('\n\n'),
    });
    let reply;
    try {
      reply = await chat(profile, convo, opts.fetcher, opts.signal);
    } catch (e) {
      step({ kind: 'failed', text: `The request failed: ${(e as Error).message}` });
      return { ok: false, raw, errors: [`request failed: ${(e as Error).message}`], attempts: attempt, ms: Date.now() - started, usage, trace };
    }
    usage.prompt += reply.usage.prompt;
    usage.completion += reply.usage.completion;
    if (reply.usage.cost !== undefined) usage.cost = (usage.cost ?? 0) + reply.usage.cost;
    convo.push({ role: 'assistant', content: reply.content });
    step({ kind: 'received', text: `Got a reply (${chars([{ role: 'assistant', content: reply.content }])})`, detail: reply.content });

    try {
      raw = extractJson(reply.content);
      const result = check(raw);
      if (result.ok) {
        step({ kind: 'checked', text: 'Checked: it follows the rules' });
        return { ok: true, value: result.value, raw, errors: [], attempts: attempt, ms: Date.now() - started, usage, trace };
      }
      errors = result.errors;
    } catch (e) {
      errors = [`the reply is not valid JSON: ${(e as Error).message}`];
    }
    step({ kind: 'failed', text: `Checked: ${errors.length} problem${errors.length === 1 ? '' : 's'}`, detail: errors.join('\n') });
    convo.push({ role: 'user', content: repairPrompt(errors.slice(0, 30)) });
  }
  return { ok: false, raw, errors, attempts: MAX_REPAIRS + 1, ms: Date.now() - started, usage, trace };
}

const chars = (ms: ChatMessage[]) => {
  const n = ms.reduce((a, m) => a + m.content.length, 0);
  return n > 1500 ? `${Math.round(n / 1000)}k characters` : `${n} characters`;
};

/** Checks that a value is a presentation that loads. */
export function checkPresentation(value: unknown): Check<unknown> {
  const r = compile(value);
  return r.ok ? { ok: true, value } : { ok: false, errors: r.errors };
}

export interface GenerateResult extends AskResult<unknown> {
  /** The presentation as returned (when it parsed as JSON), even if it has errors. */
  presentation?: unknown;
}

/** Asks a model for a presentation (or a changed version of the current one) that loads. */
export async function generate(
  profile: ModelProfile,
  request: string,
  mode: GenerateMode,
  current: string | undefined,
  opts: { fetcher?: Fetch; signal?: AbortSignal } = {},
): Promise<GenerateResult> {
  const r = await askJson(profile, [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: userPrompt(request, mode, current) },
  ], checkPresentation, opts);
  return { ...r, presentation: r.raw };
}
