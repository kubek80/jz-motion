import { describe, expect, it } from 'vitest';
import type { Clip } from '../../engine/schema';
import { cutClips, sceneGap } from './closeGap';

const clip = (id: string, offset: number, trimStart: number, trimEnd: number): Clip => ({ id, upload: `${id}.webm`, sourceDuration: 60, offset, lane: 0, trimStart, trimEnd });
const click = (scene: number, t: number, cued = true) => ({ scene, beat: 0, last: 0, from: 0, until: 1, t, cued, late: false });

describe('closing the gap a deleted scene leaves', () => {
  it('is the time from the scene\'s first beat to the next scene, only when later beats have cues', () => {
    expect(sceneGap([click(0, 0), click(1, 10), click(1, 14), click(2, 20)], 1)).toEqual({ start: 10, end: 20 });
    expect(sceneGap([click(0, 0), click(1, 10), click(2, 20, false)], 1)).toBeUndefined();
    expect(sceneGap([click(0, 0), click(1, 10)], 1)).toBeUndefined();
  });
  it('cuts the narration in the gap out of the clips and moves later ones earlier', () => {
    const out = cutClips([clip('a', 0, 0, 8), clip('b', 8, 0, 20), clip('c', 12, 2, 6), clip('d', 25, 0, 5)], { start: 10, end: 20 });
    expect(out).toEqual([
      clip('a', 0, 0, 8),
      // b spans the gap: split, the part after it starts where the gap began
      clip('b', 8, 0, 2), { ...clip('b', 10, 12, 20), id: 'b-after' },
      // c lies inside the gap: gone; d comes after: 10 s earlier
      clip('d', 15, 0, 5),
    ]);
  });
});
