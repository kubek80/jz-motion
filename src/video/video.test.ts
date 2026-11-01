import { describe, expect, it } from 'vitest';
import { compile, type CompiledPresentation } from '../engine/compile';
import { buildFfmpegArgs, resolveLayout } from './ffmpeg';
import { autoPerformance, cueClicks, cuePerformance, layoutAt, layoutSegments, stateAt, type Performance } from './performance';

const presentation = (): CompiledPresentation => {
  const r = compile({
    version: 1,
    title: 't',
    scenes: [
      {
        id: 'a',
        layout: 'pip',
        elements: [{ id: 'x', type: 'text', text: 'x', x: 0, y: 0 }, { id: 'y', type: 'text', text: 'y', x: 0, y: 0 }],
        beats: [
          { actions: [{ do: 'fade-in', target: 'x', duration: 1 }] },
          { auto: true, actions: [{ do: 'fade-in', target: 'y', duration: 2 }] },
          { layout: 'camera', track: 'friend', actions: [{ do: 'fade-out', target: 'x', duration: 1 }] },
        ],
      },
      { id: 'b', elements: [], beats: [] },
    ],
  });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.presentation;
};

describe('performance', () => {
  it('plays beats with pauses, chaining auto beats', () => {
    const perf = autoPerformance(presentation(), { lead: 1, gap: 2, tail: 3 });
    expect(perf.events).toEqual([
      { t: 0, scene: 0, from: 0, until: 0 },
      { t: 1, scene: 0, from: 0, until: 3 },
      { t: 6, scene: 0, from: 3, until: 4 },
      { t: 10, scene: 1, from: 0, until: 0 },
    ]);
    expect(perf.duration).toBe(14);
  });

  it('plays beats at their cues, and beats without one right after', () => {
    const r = compile({
      version: 1, title: 't',
      scenes: [
        { id: 'a', elements: [{ id: 'x', type: 'text', text: 'x', x: 0, y: 0 }], beats: [
          { cue: 2, actions: [{ do: 'fade-in', target: 'x', duration: 1 }] },
          { actions: [{ do: 'pulse', target: 'x', duration: 1 }] },
        ] },
        { id: 'b', elements: [{ id: 'y', type: 'text', text: 'y', x: 0, y: 0 }], beats: [
          { cue: 1, actions: [{ do: 'fade-in', target: 'y', duration: 1 }] },
          { cue: 20, actions: [{ do: 'pulse', target: 'y', duration: 1 }] },
        ] },
      ],
    });
    if (!r.ok) throw new Error(r.errors.join());
    const perf = cuePerformance(r.presentation, 30, { lead: 1, gap: 2, tail: 3 });
    expect(perf.events).toEqual([
      { t: 0, scene: 0, from: 0, until: 0 },
      { t: 2, scene: 0, from: 0, until: 1 },
      { t: 5, scene: 0, from: 1, until: 2 },
      // cue 1 is earlier than where we are (6s): treated as missing
      { t: 8, scene: 1, from: 0, until: 1 },
      { t: 20, scene: 1, from: 1, until: 2 },
    ]);
    expect(perf.duration).toBe(30);
    // The Timing window's view of the same: which clicks sit on their cue, and which cue came too early.
    expect(cueClicks(r.presentation, { lead: 1, gap: 2, tail: 3 }).map((c) => [c.scene, c.beat, c.t, c.cued, c.late])).toEqual([
      [0, 0, 2, true, false],
      [0, 1, 5, false, false],
      [1, 0, 8, false, true],
      [1, 1, 20, true, false],
    ]);
  });

  it('finds the scene and timeline position at any moment', () => {
    const perf: Performance = { events: [{ t: 0, scene: 0, from: 0, until: 0 }, { t: 2, scene: 0, from: 0, until: 3 }, { t: 3, scene: 0, from: 3, until: 3 }], duration: 6 };
    expect(stateAt(perf, 1)).toEqual({ scene: 0, time: 0 });
    expect(stateAt(perf, 2.5)).toEqual({ scene: 0, time: 0.5 });
    // Clicked "next" at 3s while the beat was still running: it jumps to the end.
    expect(stateAt(perf, 4)).toEqual({ scene: 0, time: 3 });
  });

  it('takes the layout from the beat that is playing, else the scene, else pip', () => {
    const p = presentation();
    expect(layoutAt(p, 0, 0)).toEqual({ layout: 'pip', track: 'me' });
    expect(layoutAt(p, 0, 3.5)).toEqual({ layout: 'camera', track: 'friend' });
    expect(layoutAt(p, 1, 0)).toEqual({ layout: 'pip', track: 'me' });
    const segs = layoutSegments(p, autoPerformance(p, { lead: 1, gap: 2, tail: 3 }), 10);
    expect(segs.map((s) => [s.layout, s.start, s.end])).toEqual([['pip', 0, 6.1], ['camera', 6.1, 10], ['pip', 10, 14]]);
  });
});

describe('ffmpeg', () => {
  it('falls back to what the recorded tracks allow', () => {
    expect(resolveLayout({ layout: 'camera', track: 'friend' }, [])).toEqual({ layout: 'board', track: '' });
    expect(resolveLayout({ layout: 'camera', track: 'friend' }, ['me'])).toEqual({ layout: 'camera', track: 'me' });
    expect(resolveLayout({ layout: 'side', track: 'me' }, ['me'])).toEqual({ layout: 'pip', track: 'me' });
    expect(resolveLayout({ layout: 'side', track: 'me' }, ['me', 'friend'])).toEqual({ layout: 'side', track: 'me', second: 'friend' });
  });

  it('overlays camera layouts over time and mixes audio', () => {
    const args = buildFfmpegArgs({
      width: 1920, height: 1080, fps: 30, duration: 10, out: 'out.mp4',
      tracks: [
        { name: 'me', path: 'me.webm', offset: 0, hasVideo: true, hasAudio: true },
        { name: 'friend', path: 'friend.mp4', offset: -1.5, hasVideo: true, hasAudio: true },
      ],
      segments: [
        { layout: 'pip', track: 'me', start: 0, end: 4 },
        { layout: 'side', track: 'me', start: 4, end: 7 },
        { layout: 'camera', track: 'friend', start: 7, end: 10 },
      ],
    });
    expect(args.slice(args.indexOf('-i', 12) - 2, args.indexOf('-i', 12) + 2)).toEqual(['-itsoffset', '0.000', '-i', 'me.webm']);
    expect(args).toContain('friend.mp4');
    expect(args[args.indexOf('friend.mp4') - 3]).toBe('-ss');
    const graph = args[args.indexOf('-filter_complex') + 1];
    expect(graph).toContain("overlay=x=0:y=0:eof_action=pass:enable='between(t,0.000,4.000)'");
    expect(graph).toContain('amix=inputs=2');
    expect(graph).toContain('[1:v]fps=30,format=yuv420p,split=2[left_me_in][pip_me_in]');
    expect(args.slice(-1)).toEqual(['out.mp4']);
  });

  it('makes a board-only video without tracks', () => {
    const args = buildFfmpegArgs({ width: 1280, height: 720, fps: 30, duration: 5, out: 'o.mp4', tracks: [], segments: [{ layout: 'pip', track: 'me', start: 0, end: 5 }] });
    const graph = args[args.indexOf('-filter_complex') + 1];
    expect(graph).not.toContain('amix');
    expect(args).not.toContain('-c:a');
    expect(graph.match(/overlay/g)).toHaveLength(1);
  });
});
