import { describe, expect, it } from 'vitest';
import { advanceClip, clipAtTime, drift, isVideoSrc, posterOf, seekTime, stillOf, type PlannedPlay } from './videoClock';

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

  it('works out the clip for export from the plays alone, whatever frames were drawn before', () => {
    const start: PlannedPlay = { t: 0, clip: 0, speed: 0, stopAt: -1, arrive: 0, holding: false };
    // At 2 s it plays at normal speed; at 5 s it jumps to 10 s and plays on to stop at 12 s within 1 s.
    const play: PlannedPlay = { t: 2, clip: 0, speed: 1, stopAt: -1, arrive: 0, holding: false };
    const toStop: PlannedPlay = { t: 5, clip: 10, speed: 1, stopAt: 12, arrive: 1, holding: true };
    const plays = [start, play, toStop];
    expect(clipAtTime(plays, 1, 30, false)).toBe(0);
    expect(clipAtTime(plays, 2, 30, false)).toBe(0);
    expect(clipAtTime(plays, 2.1, 30, false)).toBeCloseTo(0.1);
    expect(clipAtTime(plays, 4.5, 30, false)).toBeCloseTo(2.5);
    // Standing exactly on the jump, nothing has changed yet.
    expect(clipAtTime(plays, 5, 30, false)).toBeCloseTo(3);
    expect(clipAtTime(plays, 5.5, 30, false)).toBeCloseTo(11);
    expect(clipAtTime(plays, 9, 30, false)).toBe(12);
    // Played past its end: held at the end, or round again when it loops.
    expect(clipAtTime([start, { ...play, speed: 2 }], 20, 30, false)).toBe(30);
    expect(clipAtTime([start, { ...play, speed: 2 }], 20, 30, true)).toBeCloseTo(6);
  });
});
