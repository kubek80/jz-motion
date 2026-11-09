import { describe, expect, it } from 'vitest';
import { compile } from '../engine/compile';
import { cuePerformance } from './performance';
import { avatarFrame, planAvatar } from './avatarPlan';

// Two scenes timed to a voice-over: "a" in a corner (pip), "b" full frame (camera). a's avatar ends at 6 s, the
// scene at 10 s; b's starts at 10 s.
function setup(beatActionB?: unknown) {
  const doc = {
    version: 1, title: 't',
    scenes: [
      { id: 'a', layout: 'pip', elements: [{ id: 'x', type: 'text', text: 'A', x: 960, y: 540 }], beats: [{ cue: 0, actions: [{ do: 'draw', target: 'x' }] }] },
      { id: 'b', layout: 'camera', elements: [{ id: 'y', type: 'text', text: 'B', x: 960, y: 540 }], beats: [{ cue: 10, actions: [{ do: 'draw', target: 'y' }, ...(beatActionB ? [beatActionB] : [])] }] },
    ],
    voiceover: { clips: [
      { id: 'ca', upload: 'a.webm', sourceDuration: 6, offset: 0, lane: 0, trimStart: 0, trimEnd: 6, scene: 'a', avatar: { video: 'av-a.mp4', trimStart: 0, trimEnd: 6 } },
      { id: 'cb', upload: 'b.webm', sourceDuration: 8, offset: 10, lane: 0, trimStart: 0, trimEnd: 8, scene: 'b', avatar: { video: 'av-b.mp4', trimStart: 0, trimEnd: 8 } },
    ] },
  };
  const r = compile(doc);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  const perf = cuePerformance(r.presentation, 18);
  return planAvatar(r.presentation, doc as never, perf);
}

describe('your avatar in the video', () => {
  it('plays its clip in the corner', () => {
    const f = avatarFrame(setup(), 3);
    expect(f.video).toEqual({ file: 'av-a.mp4', time: 3 });
    expect(f.avatar.w).toBeCloseTo(0.26);
    expect(f.board).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('holds its last frame to the end of its scene, instead of going black', () => {
    const f = avatarFrame(setup(), 8);
    expect(f.video?.file).toBe('av-a.mp4');
    expect(f.video!.time).toBeGreaterThan(5.9);
    expect(f.opacity).toBe(1);
  });

  it('glides from the corner to full frame when the next scene shows it full frame', () => {
    const plan = setup();
    const mid = avatarFrame(plan, 10.4);
    expect(mid.video?.file).toBe('av-b.mp4');
    expect(mid.avatar.w).toBeGreaterThan(0.26);
    expect(mid.avatar.w).toBeLessThan(1);
    const end = avatarFrame(plan, 11.5);
    expect(end.avatar).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(end.board.w).toBeCloseTo(0.36);
  });

  it('moves where a beat\'s "avatar" action says, over its duration', () => {
    const plan = setup({ do: 'avatar', layout: 'side', duration: 1 });
    // The draw takes a moment, then the avatar goes beside the board.
    const later = avatarFrame(plan, 16);
    expect(later.avatar).toEqual({ x: 0, y: 0, w: 0.5, h: 1 });
    expect(later.board).toEqual({ x: 0.5, y: 0.25, w: 0.5, h: 0.5 });
  });

  it('fades out where the layout hides it', () => {
    const plan = setup({ do: 'avatar', layout: 'board', duration: 0.5 });
    expect(avatarFrame(plan, 16).opacity).toBe(0);
  });
});
