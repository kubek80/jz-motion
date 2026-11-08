import { describe, expect, it } from 'vitest';
import { freeLane, makeRoom, type TimelineClip } from './makeRoom';

const clip = (id: string, offset: number, len: number, lane: 0 | 1 = 0): TimelineClip => ({ id, upload: `${id}.webm`, sourceDuration: 100, offset, lane, trimStart: 10, trimEnd: 10 + len });

describe('making room on the timeline', () => {
  it('moves later clips and cues, keeps earlier ones, splits a clip across the cut', () => {
    const doc = {
      scenes: [{ beats: [{ cue: 1 }, { cue: 9.5 }] }, { beats: [{ cue: 12 }, {}] }],
      voiceover: { clips: [clip('a', 0, 5), clip('b', 8, 4, 1), clip('c', 11, 3)] },
    };
    makeRoom(doc, 10, 20, 'new');
    expect(doc.scenes.map((s) => s.beats.map((b) => b.cue))).toEqual([[1, 9.5], [32, undefined]]);
    expect(doc.voiceover.clips.map((c) => [c.id, c.offset, c.trimStart, c.trimEnd])).toEqual([
      ['a', 0, 10, 15],
      ['b', 8, 10, 12],
      ['b-after-new', 30, 12, 14],
      ['c', 31, 10, 13],
    ]);
  });

  it('finds a free lane', () => {
    const clips = [clip('a', 0, 10, 0), clip('b', 5, 10, 1)];
    expect(freeLane(clips, 10, 20)).toBe(0);
    expect(freeLane(clips, 6, 9)).toBe(null);
    expect(freeLane(clips, 15, 30)).toBe(0);
  });
});
