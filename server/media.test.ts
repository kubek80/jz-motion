import { describe, expect, it } from 'vitest';
import { bestLag } from './media';

describe('bestLag', () => {
  it('finds how far one loudness envelope is shifted against another', () => {
    // A recognisable pattern of "sound" bursts, and the same recording starting 2.3 s (230 steps) later.
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const a = Float32Array.from({ length: 3000 }, () => (rand() > 0.8 ? 1 : 0) - 0.2);
    const b = a.slice(230);
    expect(bestLag(a, b, 600).lag).toBe(230);
    expect(bestLag(b, a, 600).lag).toBe(-230);
  });
});
