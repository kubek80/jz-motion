import { describe, expect, it } from 'vitest';
import { compile } from '../engine/compile';
import { cuePerformance } from './performance';
import { avatarFrame, planAvatar } from './avatarPlan';
import { shotPieces, shotsOf, shotsPrice, studioStretches } from './studioShots';

// A podcast of two: Jakub (0–4 s) then Anna (4–8 s), each with their own avatar video. Beat 1 (0–8 s) two of them
// side by side, beat 2 (from 8 s) the studio wide shot, with a studio shot made from 8 s for 6 s.
function setup(withShot = true) {
  const doc = {
    version: 1, title: 't',
    cast: [{ id: 'jakub', name: 'Jakub', avatar: 'a1' }, { id: 'anna', name: 'Anna', avatar: 'a2' }],
    scenes: [{
      id: 's', layout: 'pair', elements: [{ id: 'x', type: 'text', text: 'A', x: 960, y: 540 }],
      beats: [{ cue: 0, actions: [{ do: 'draw', target: 'x' }] }, { cue: 8, layout: 'studio', speaker: 'anna', actions: [{ do: 'wait', duration: 5 }] }],
    }],
    voiceover: {
      clips: [
        { id: 'c1', upload: 'j.webm', sourceDuration: 4, offset: 0, lane: 0, trimStart: 0, trimEnd: 4, scene: 's', speaker: 'jakub', avatar: { video: 'av-j.mp4', trimStart: 0, trimEnd: 4 } },
        { id: 'c2', upload: 'a.webm', sourceDuration: 10, offset: 4, lane: 1, trimStart: 0, trimEnd: 10, scene: 's', speaker: 'anna', avatar: { video: 'av-a.mp4', trimStart: 0, trimEnd: 10 } },
      ],
      ...(withShot ? { studio: [{ video: 'studio-1.mp4', offset: 8, length: 6, scene: 's' }] } : {}),
    },
  };
  const r = compile(doc);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return { plan: planAvatar(r.presentation, doc as never, cuePerformance(r.presentation, 14)), doc };
}

describe('two people side by side (pair)', () => {
  it('shows the first in the cast on the left and the second on the right, the one listening holding still', () => {
    const f = avatarFrame(setup().plan, 2);
    expect(f.video).toEqual({ file: 'av-j.mp4', time: 2 });
    expect(f.avatar).toEqual({ x: 0, y: 0, w: 0.5, h: 1 });
    expect(f.second?.video).toMatchObject({ file: 'av-a.mp4', time: 0, still: true });
    expect(f.second?.rect).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 });
  });

  it('when the second speaks, the first holds their last frame', () => {
    const f = avatarFrame(setup().plan, 6);
    expect(f.video).toMatchObject({ file: 'av-j.mp4', still: true });
    expect(f.second?.video).toEqual({ file: 'av-a.mp4', time: 2 });
  });
});

describe('the studio wide shot', () => {
  it('shows the studio shot full frame, the second slot fading away', () => {
    const f = avatarFrame(setup().plan, 10);
    expect(f.video).toEqual({ file: 'studio-1.mp4', time: 2 });
    expect(f.avatar).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(f.second).toBeUndefined();
  });

  it('without a shot made yet, shows whoever is talking', () => {
    expect(avatarFrame(setup(false).plan, 10).video).toEqual({ file: 'av-a.mp4', time: 6 });
  });

  it('finds where the studio shows, and cuts it into shots of at most 9.6 s', () => {
    const { plan } = setup();
    const [s] = studioStretches(plan);
    expect(s.scene).toBe('s');
    expect(s.at).toBeCloseTo(8, 1);
    expect(s.at + s.length).toBeCloseTo(plan.perf.duration, 1);
    const long = shotsOf({ at: 0, length: 20 });
    expect(long).toHaveLength(3);
    expect(long[1].at).toBeCloseTo(20 / 3);
    expect(shotsOf({ at: 0, length: 9 })).toHaveLength(1);
  });

  it('gives each person their own lines in a shot, by their place in the cast', () => {
    const { doc } = setup();
    const { pieces } = shotPieces(doc.voiceover.clips, ['jakub', 'anna'], 2, 4);
    expect(pieces).toEqual([
      { upload: 'j.webm', trimStart: 2, trimEnd: 4, at: 0, person: 0 },
      { upload: 'a.webm', trimStart: 0, trimEnd: 2, at: 2, person: 1 },
    ]);
    // A third person can't be in the shot: named, so the app can say so.
    expect(shotPieces(doc.voiceover.clips, ['marek', 'jakub', 'anna'], 2, 4).others).toEqual(['anna']);
  });

  it('prices shots as fal.ai does', () => {
    expect(shotsPrice([{ at: 0, length: 6.44 }])).toBeCloseTo(1.61, 2);
    expect(shotsPrice([{ at: 0, length: 3 }], '720p')).toBeCloseTo(1.2, 2);
  });
});
