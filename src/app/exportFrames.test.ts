import { describe, expect, it } from 'vitest';
import { compile } from '../engine/compile';
import { clock, frameOf, notesText, timeOfFrame, whereAt } from './exportFrames';

describe('exported video frames', () => {
  it('counts frames and seeks inside them', () => {
    expect(frameOf(0, 30)).toBe(0);
    expect(frameOf(1, 30)).toBe(30);
    expect(frameOf(timeOfFrame(1234, 30), 30)).toBe(1234);
    expect(frameOf(timeOfFrame(77, 60), 60)).toBe(77);
    expect(clock(83.456)).toBe('1:23.46');
  });

  it('names the scene and beat a moment shows, from the timing the video was made with', () => {
    const r = compile({
      version: 1, title: 't',
      scenes: [
        { id: 'a', title: 'First', elements: [{ id: 'x', type: 'box', x: 0, y: 0, width: 10, height: 10 }], beats: [{ title: 'one', actions: [{ do: 'draw', target: 'x' }] }, { title: 'two', actions: [{ do: 'pulse', target: 'x' }] }] },
        { id: 'b', title: 'Second', elements: [{ id: 'y', type: 'box', x: 0, y: 0, width: 10, height: 10 }], beats: [{ title: 'three', actions: [{ do: 'draw', target: 'y' }] }] },
      ],
    });
    if (!r.ok) throw new Error(r.errors.join('\n'));
    const p = r.presentation;
    const [b0, b1] = p.scenes[0].beats;
    // Scene 1's first beat from 0, its second from 5 s, scene 2 from 10 s.
    const perf = { events: [{ t: 0, scene: 0, from: b0.start, until: b0.end }, { t: 5, scene: 0, from: b1.start, until: b1.end }, { t: 10, scene: 1, from: 0, until: p.scenes[1].beats[0].end }], duration: 15 };
    expect(whereAt(p, perf, 1)).toMatchObject({ scene: 0, sceneTitle: 'First', beat: 0, beatTitle: 'one' });
    expect(whereAt(p, perf, 6)).toMatchObject({ scene: 0, beat: 1, beatTitle: 'two' });
    expect(whereAt(p, perf, 12)).toMatchObject({ scene: 1, sceneTitle: 'Second', beatTitle: 'three' });
  });

  it('writes notes as lines to share, in frame order', () => {
    const text = notesText('v.mp4', 30, [
      { frame: 90, t: 3.0167, scene: 'Second', beat: 'three', text: 'pops too late' },
      { frame: 3, t: 0.1167, text: 'black first frame' },
    ]);
    expect(text).toBe('Notes on v.mp4 (30 fps, frames counted from 0):\n- 0:00.12 · frame 3: black first frame\n- 0:03.02 · frame 90 · Second › three: pops too late');
  });
});
