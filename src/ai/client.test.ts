import { describe, expect, it } from 'vitest';
import hardware from '../examples/hardware.json';
import { generate, type Fetch } from './client';
import { extractJson, SYSTEM_PROMPT } from './prompt';
import type { ModelProfile } from './profiles';

const profile: ModelProfile = { id: 'p', name: 'test', baseURL: 'https://openrouter.ai/api/v1', model: 'x/y', apiKey: 'k', enabled: true };

/** A fake model: answers with each reply in turn and records what it was sent. */
function fakeModel(replies: string[]) {
  const sent: { url: string; payload: { baseURL: string; apiKey: string; body: { messages: { role: string; content: string }[]; usage?: unknown } } }[] = [];
  const fetcher: Fetch = async (url, init) => {
    sent.push({ url, payload: JSON.parse(init.body as string) });
    const content = replies[sent.length - 1];
    return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.01 } }));
  };
  return { fetcher, sent };
}

const broken = structuredClone(hardware);
broken.scenes[0].elements[1].icon = 'nope';

describe('generate', () => {
  it('sends the format docs and returns a presentation that loads', async () => {
    const { fetcher, sent } = fakeModel([JSON.stringify(hardware)]);
    const r = await generate(profile, 'local AI hardware', 'new', undefined, { fetcher });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(1);
    expect(sent[0].url).toBe('/api/llm');
    expect(sent[0].payload.body.messages[0].content).toBe(SYSTEM_PROMPT);
    expect(SYSTEM_PROMPT).toContain('## Beats and actions');
    expect(SYSTEM_PROMPT).toContain('dgx-spark');
    expect(sent[0].payload.body.usage).toEqual({ include: true });
  });

  it('sends compile errors back and accepts the repaired version', async () => {
    const { fetcher, sent } = fakeModel([`Sure!\n\`\`\`json\n${JSON.stringify(broken)}\n\`\`\``, JSON.stringify(hardware)]);
    const r = await generate(profile, 'hardware', 'new', undefined, { fetcher });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(2);
    expect(r.usage).toEqual({ prompt: 200, completion: 100, cost: 0.02 });
    const repair = sent[1].payload.body.messages.at(-1)!;
    expect(repair.role).toBe('user');
    expect(repair.content, repair.content).toContain('unknown icon "nope"');
  });

  it('gives up after two repairs and returns the last errors', async () => {
    const { fetcher, sent } = fakeModel(['not json', 'still not', '{"version": 2}']);
    const r = await generate(profile, 'x', 'new', undefined, { fetcher });
    expect(r.ok).toBe(false);
    expect(sent).toHaveLength(3);
    expect(r.errors[0]).toMatch(/^version/);
  });

  it('includes the current presentation when editing', async () => {
    const { fetcher, sent } = fakeModel([JSON.stringify(hardware)]);
    await generate(profile, 'make the GPU pink', 'edit', '{"current": true}', { fetcher });
    expect(sent[0].payload.body.messages[1].content).toContain('{"current": true}');
    expect(sent[0].payload.body.messages[1].content).toContain('make the GPU pink');
  });

  it('reports request failures', async () => {
    const fetcher: Fetch = async () => new Response('{"error":"bad key"}', { status: 401 });
    const r = await generate(profile, 'x', 'new', undefined, { fetcher });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('401');
  });
});

describe('extractJson', () => {
  it('finds JSON in fences or prose', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here: {"a":{"b":2}} done')).toEqual({ a: { b: 2 } });
    expect(() => extractJson('nothing here')).toThrow();
  });
});
