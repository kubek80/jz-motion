import { describe, expect, it } from 'vitest';
import type { Clip } from '../../engine/schema';
import type { Click } from '../../video/performance';
import { beatsIn, replaceTake } from './useRerecord';

const clip = (id: string, offset: number, len: number, lane: 0 | 1 = 0): Clip => ({ id, upload: `${id}.webm`, sourceDuration: len, offset, lane, trimStart: 0, trimEnd: len });
const click = (scene: number, beat: number, t: number, cued = true): Click => ({ scene, beat, last: beat, from: 0, until: 1, t, cued, late: false });

describe('recording a clip again', () => {
  const clips = [clip('a', 0, 10), clip('b', 10, 10), clip('c', 20, 5, 1)];
  const clicks = [click(0, 0, 0), click(0, 1, 4), click(1, 0, 10), click(1, 1, 15), click(2, 0, 20)];

  it('finds the beats inside a clip', () => {
    expect(beatsIn(clips[1], clicks).map((c) => c.t)).toEqual([10, 15]);
  });

  it('moves what follows by the difference and spreads the beats inside', () => {
    const r = replaceTake(clips, 1, 'new.webm', 14, [], clicks);
    expect(r.delta).toBe(4);
    expect(r.clips.map((c) => [c.upload, c.offset, c.trimEnd])).toEqual([['a.webm', 0, 10], ['new.webm', 10, 14], ['c.webm', 24, 5]]);
    expect(r.cues).toEqual([{ scene: 1, beat: 0, cue: 10 }, { scene: 1, beat: 1, cue: 17 }, { scene: 2, beat: 0, cue: 24 }]);
  });

  it('keeps the beats in order when only some were marked', () => {
    const many = [click(0, 0, 0), click(0, 1, 2), click(0, 2, 6), click(0, 3, 8), click(1, 0, 10)];
    const r = replaceTake([clip('a', 0, 10), clip('b', 10, 5)], 0, 'new.webm', 4, [3], many);
    const inside = r.cues.filter((c) => c.scene === 0).map((c) => c.cue);
    expect(inside).toEqual([0, 3, 3.5, 3.75]);
    expect(r.cues.find((c) => c.scene === 1)?.cue).toBe(4);
  });

  it('puts the beats inside where → was pressed, and closes up when shorter', () => {
    const r = replaceTake(clips, 1, 'new.webm', 8, [3.5], clicks);
    expect(r.cues).toEqual([{ scene: 1, beat: 0, cue: 10 }, { scene: 1, beat: 1, cue: 13.5 }, { scene: 2, beat: 0, cue: 18 }]);
    expect(r.clips[2].offset).toBe(18);
  });
});
