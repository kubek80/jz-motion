import { describe, expect, it } from 'vitest';
import type { Clip } from '../../engine/schema';
import { chainOf, removeSpan } from './clipChain';

const clip = (id: string, upload: string, offset: number, trimStart: number, trimEnd: number, lane: 0 | 1 = 0): Clip => ({ id, upload, sourceDuration: 100, offset, lane, trimStart, trimEnd });

describe('one recording, cut into pieces', () => {
  const clips = [clip('a', 'r.webm', 0, 0, 10), clip('o', 'x.webm', 5, 0, 10, 1), clip('n', 'y.webm', 20, 0, 5)];
  const clicks = [{ scene: 0, beat: 0, t: 0, cued: true }, { scene: 0, beat: 1, t: 4, cued: true }, { scene: 0, beat: 2, t: 7, cued: true }, { scene: 1, beat: 0, t: 20, cued: true }];

  it('closes the gap: what follows moves earlier', () => {
    const r = removeSpan(clips, chainOf(clips, 0), 3, 5, true, clicks);
    expect(r.clips.map((c) => [c.id, c.offset, c.trimStart, c.trimEnd])).toEqual([['a', 0, 0, 3], ['a-5000', 3, 5, 10], ['o', 3, 0, 10], ['n', 18, 0, 5]]);
    expect(r.cues).toEqual([{ scene: 0, beat: 1, cue: 3 }, { scene: 0, beat: 2, cue: 5 }, { scene: 1, beat: 0, cue: 18 }]);
    // Both pieces are still one recording.
    const chain = chainOf(r.clips, 0);
    expect([chain.indices.length, chain.start, chain.end]).toEqual([2, 0, 8]);
  });

  it('keeps the timing: the part becomes silence', () => {
    const r = removeSpan(clips, chainOf(clips, 0), 3, 5, false, clicks);
    expect(r.clips.map((c) => [c.id, c.offset, c.trimStart, c.trimEnd])).toEqual([['a', 0, 0, 3], ['a-5000', 5, 5, 10], ['o', 5, 0, 10], ['n', 20, 0, 5]]);
    expect(r.cues).toEqual([]);
    expect(chainOf(r.clips, 1).indices.length).toBe(2);
  });

  it('removes across pieces cut earlier', () => {
    const once = removeSpan(clips, chainOf(clips, 0), 3, 5, true, clicks).clips;
    const twice = removeSpan(once, chainOf(once, 0), 2, 4, true, []).clips.filter((c) => c.upload === 'r.webm');
    expect(twice.map((c) => [c.offset, c.trimStart, c.trimEnd])).toEqual([[0, 0, 2], [2, 6, 10]]);
  });
});
