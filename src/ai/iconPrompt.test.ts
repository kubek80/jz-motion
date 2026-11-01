import { describe, expect, it } from 'vitest';
import { drawingMessages, refineMessages } from './iconPrompt';

describe('refineMessages', () => {
  it('replays each version the follow-ups refer to, then the change', () => {
    const first = drawingMessages('icon', 'a cat');
    const m = refineMessages(first, [{ previous: { paths: ['M1 1'] }, change: 'bigger ears' }, { previous: { paths: ['M2 2'] }, change: 'add a tail' }]);
    expect(m.slice(0, 2)).toEqual(first);
    expect(m.map((x) => x.role)).toEqual(['system', 'user', 'assistant', 'user', 'assistant', 'user']);
    expect(JSON.parse(m[4].content)).toEqual({ paths: ['M2 2'] });
    expect(m[5].content).toMatch(/^Change it: add a tail/);
  });
});
