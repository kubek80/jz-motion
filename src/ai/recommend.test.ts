import { describe, expect, it } from 'vitest';
import type { ModelProfile } from './profiles';
import { advice, pickFor, rate, sizeOf } from './recommend';

const m = (id: string, model: string, extra: Partial<ModelProfile> = {}): ModelProfile => ({ id, name: id, baseURL: 'claude-code:', model, apiKey: '', enabled: true, ...extra });
const opus = m('Opus', 'opus');
const sonnet = m('Sonnet', 'sonnet');
const haiku = m('Haiku', 'haiku');
const all = [opus, sonnet, haiku];

describe('model recommendations', () => {
  it('guesses sizes from names, and a size set in Settings wins', () => {
    expect([opus, sonnet, haiku].map(sizeOf)).toEqual(['large', 'medium', 'small']);
    expect(sizeOf(m('x', 'openai/gpt-4.1-mini'))).toBe('small');
    expect(sizeOf(m('x', 'google/gemini-2.5-pro'))).toBe('large');
    expect(sizeOf(m('x', 'my-finetune'))).toBeUndefined();
    expect(sizeOf(m('x', 'my-finetune', { size: 'medium' }))).toBe('medium');
  });

  it('recommends the smallest model that is enough for the job', () => {
    expect(rate('icon', all).best).toBe(haiku);
    expect(rate('clipart', all).best).toBe(sonnet);
    expect(rate('from-script', all).best).toBe(opus);
    expect(rate('from-script', all).fits.get('Haiku')).toBe('too-small');
    const fits = rate('clipart', all).fits;
    expect([fits.get('Opus'), fits.get('Sonnet'), fits.get('Haiku')]).toEqual(['more-than-needed', 'recommended', 'smaller']);
  });

  it('falls back to the biggest model there is, and says so', () => {
    expect(rate('from-recording', [sonnet, haiku]).best).toBe(sonnet);
    expect(advice('from-recording', [sonnet, haiku])).toMatch(/None of your models is that size; Sonnet is the closest/);
    expect(advice('icon', all)).toMatch(/small, fast model is enough.*Suggested: Haiku/);
  });

  it('keeps a choice made for the job', () => {
    expect(pickFor('icon', all, 'Opus')).toBe(opus);
    expect(pickFor('icon', all, 'gone')).toBe(haiku);
  });
});
