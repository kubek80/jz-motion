import { describe, expect, it } from 'vitest';
import { layoutScenes, sceneAt, splitHidden, type TimedDoc } from './sceneTimeline';

const doc = (): TimedDoc => ({
  scenes: [
    { id: 'a', beats: [{ cue: 0 }, { cue: 4 }] },
    { id: 'b', beats: [{ cue: 11 }, { cue: 15 }] },
    { id: 'c', beats: [{ cue: 22 }] },
  ],
  voiceover: { clips: [
    { id: 'ca', offset: 0, trimStart: 0, trimEnd: 10, scene: 'a' },
    { id: 'cb', offset: 11, trimStart: 0, trimEnd: 10, scene: 'b' },
    { id: 'cc', offset: 22, trimStart: 2, trimEnd: 8, scene: 'c' },
  ] },
});
const cues = (d: TimedDoc) => Object.fromEntries(d.scenes.map((s) => [s.id, s.beats!.map((b) => b.cue)]));
const offsets = (d: TimedDoc) => Object.fromEntries(d.voiceover!.clips.map((c) => [c.id, c.offset]));

describe('recordings that belong to scenes', () => {
  it('changes nothing when the scenes that play stay the same', () => {
    const d = doc();
    expect(layoutScenes(d, d)).toBe(d);
  });

  it('moves a scene with its recording and cues, keeping the pauses', () => {
    const prev = doc();
    const next = { ...prev, scenes: [prev.scenes[1], prev.scenes[0], prev.scenes[2]] };
    const out = layoutScenes(prev, next);
    expect(cues(out)).toEqual({ b: [0, 4], a: [11, 15], c: [22] });
    expect(offsets(out)).toEqual({ ca: 11, cb: 0, cc: 22 });
  });

  it('closes up around a scene left out, and puts it back where it was', () => {
    const prev = doc();
    const out = layoutScenes(prev, { ...prev, scenes: prev.scenes.map((s) => (s.id === 'b' ? { ...s, skip: true } : s)) });
    expect(cues(out).c).toEqual([11]);
    expect(splitHidden(out).hidden.map((c) => c.id)).toEqual(['cb']);
    const back = layoutScenes(out, { ...out, scenes: out.scenes.map((s) => (s.id === 'b' ? { ...s, skip: false } : s)) });
    // Back in its place, with a short pause after it.
    expect(cues(back)).toEqual({ a: [0, 4], b: [11, 15], c: [21.8] });
    expect(offsets(back)).toEqual({ ca: 0, cb: 11, cc: 21.8 });
  });

  it('makes room for a new scene without a recording, by its animation', () => {
    const prev = doc();
    const out = layoutScenes(prev, { ...prev, scenes: [prev.scenes[0], { id: 'new', beats: [{}] }, ...prev.scenes.slice(1)] }, (id) => (id === 'new' ? 5 : 0));
    expect(cues(out).b).toEqual([16.8, 20.8]);
  });

  it('knows which scene a moment belongs to', () => {
    expect([sceneAt(doc(), 3), sceneAt(doc(), 12), sceneAt(doc(), 30)]).toEqual(['a', 'b', 'c']);
  });
});
