import { describe, expect, it } from 'vitest';
import { advanceClip, drift, isVideoSrc, posterOf, seekTime, stillOf } from './videoClock';

describe('video clock', () => {
  it('recognises video files', () => {
    expect(isVideoSrc('/media/ab12.webm')).toBe(true);
    expect(isVideoSrc('/images/x.MP4?v=2')).toBe(true);
    expect(isVideoSrc('clip.mov')).toBe(true);
    expect(isVideoSrc('data:video/webm;base64,AAA')).toBe(true);
    expect(isVideoSrc('/media/ab12.webm.poster.webp')).toBe(false);
    expect(isVideoSrc('/images/x.apng')).toBe(false);
  });

  it('finds the poster of library recordings only', () => {
    expect(posterOf('/media/ab12.webm')).toBe('/media/ab12.webm.poster.webp');
    expect(posterOf('/images/x.webm')).toBeUndefined();
    expect(stillOf('/media/ab12.webm')).toBe('/media/ab12.webm.poster.webp');
    expect(stillOf('/images/x.png')).toBe('/images/x.png');
  });

  it('advances, holds at the end, or loops', () => {
    expect(advanceClip(1, 0.1, 2, 3, false)).toBeCloseTo(1.2);
    expect(advanceClip(1, 0.1, 0, 3, false)).toBe(1);
    expect(advanceClip(2.95, 0.1, 1, 3, false)).toBe(3);
    expect(advanceClip(2.95, 0.1, 1, 3, true)).toBeCloseTo(0.05);
    expect(advanceClip(5, 1, 1, Infinity, true)).toBe(6);
  });

  it('measures drift the short way round when looping', () => {
    expect(drift(1, 1.2, 3, false)).toBeCloseTo(0.2);
    expect(drift(0.05, 2.95, 3, true)).toBeCloseTo(0.1);
    expect(drift(0.05, 2.95, 3, false)).toBeCloseTo(2.9);
  });

  it('seeks a hair past the clip time, never past the end', () => {
    expect(seekTime(1, 3)).toBeCloseTo(1.001);
    expect(seekTime(3, 3)).toBe(3);
  });
});
