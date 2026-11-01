import { describe, expect, it } from 'vitest';
import intro from '../examples/intro.json';
import { compile, niceMax, type CompiledPresentation } from './compile';

const ok = (input: unknown): CompiledPresentation => {
  const r = compile(input);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.presentation;
};

const deck = (scene: object) => ({ version: 1, title: 't', scenes: [{ id: 's', ...scene }] });

describe('text styles', () => {
  it('sizes multi-line code by its longest line and its number of lines', async () => {
    const { shapeBox } = await import('./geometry');
    const el = { id: 'c', type: 'text', text: 'ab\nabcd', x: 100, y: 100, size: 40, align: 'middle', style: 'code', color: 'white' } as const;
    const b = shapeBox(el as never, () => undefined);
    expect(b.width).toBeCloseTo(4 * 40 * 0.6);
    expect(b.height).toBeCloseTo(40 + 40 * 1.25);
    expect(b.y).toBeCloseTo(100 - b.height / 2);
  });
});

describe('compile', () => {
  const shotDoc = (beats: unknown[]) => ({
    version: 1, title: 't',
    scenes: [{ id: 's', elements: [
      { id: 'shot', type: 'image', src: '/images/a.png', x: 960, y: 540, width: 1000, height: 600, frame: 'browser' },
      { id: 'part', type: 'area', x: 1200, y: 400, width: 200, height: 100, shape: 'ellipse' },
      { id: 'note', type: 'text', text: 'here', x: 1500, y: 400 },
    ], beats }],
  });

  it('spotlights an area, keeps what is drawn meanwhile above it, and turns off', () => {
    const r = compile(shotDoc([
      { actions: [{ do: 'draw', target: 'shot' }] },
      { actions: [{ do: 'spotlight', target: 'part', padding: 10 }, { do: 'draw', target: 'note' }] },
      { actions: [{ do: 'spotlight', on: false }] },
    ]));
    if (!r.ok) throw new Error(r.errors.join('; '));
    const s = r.presentation.scenes[0];
    const lights = s.ops.filter((o) => o.kind === 'spotlight');
    expect(lights).toHaveLength(2);
    expect(lights[0]).toMatchObject({ from: null, to: { x: 1090, y: 340, width: 220, height: 120, shape: 'ellipse', style: 'dark', amount: 0.7 } });
    expect(lights[1]).toMatchObject({ to: null });
    expect(s.above).toEqual(['note']);
  });

  it('asks for a target when a spotlight turns on', () => {
    const r = compile(shotDoc([{ actions: [{ do: 'spotlight' }] }]));
    expect(r.ok).toBe(false);
  });

  it('frames a framed screenshot including its browser bar', () => {
    const r = compile({ ...shotDoc([{ actions: [{ do: 'camera', focus: 'shot', padding: 0 }] }]) });
    if (!r.ok) throw new Error(r.errors.join('; '));
    const cam = (r.presentation.scenes[0].ops.find((o) => o.kind === 'camera') as { to: { y: number } }).to;
    // The picture and its browser bar together are centred on the element's position.
    expect(cam.y).toBeCloseTo(540, 0);
  });

  it('times each action from the start of its beat', () => {
    const r = compile({
      version: 1, title: 't',
      scenes: [{ id: 's', elements: [{ id: 'a', type: 'box', x: 0, y: 0, width: 10, height: 10 }, { id: 'b', type: 'box', x: 50, y: 0, width: 10, height: 10 }], beats: [
        { actions: [{ do: 'wait', duration: 2 }] },
        { actions: [{ do: 'draw', target: 'a', duration: 1 }, { do: 'draw', target: 'b', duration: 0.5, start: 'with' }, { do: 'wait', duration: 1, delay: 0.5 }] },
      ] }],
    });
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.presentation.scenes[0].beats[1].actions).toEqual([{ start: 0, end: 1 }, { start: 0, end: 0.5 }, { start: 1, end: 2 }]);
  });

  it('compiles the bundled example', () => {
    const p = ok(intro);
    expect(p.scenes.map((s) => s.id)).toEqual(['idea', 'how', 'next']);
  });

  it.each(Object.entries(import.meta.glob('../examples/*.json', { eager: true, import: 'default' })))('compiles %s', (_, data) => {
    ok(data);
  });

  it('sequences actions and beats', () => {
    const s = ok(deck({
      elements: [
        { id: 'a', type: 'text', text: 'a', x: 0, y: 0 },
        { id: 'b', type: 'text', text: 'b', x: 0, y: 0 },
      ],
      beats: [
        { actions: [
          { do: 'fade-in', target: 'a', duration: 1 },
          { do: 'fade-in', target: 'b', duration: 2 },
          { do: 'wait', start: 'with', duration: 0.5 },
        ] },
        { actions: [{ do: 'fade-out', target: ['a', 'b'], duration: 1, stagger: 0.5, delay: 1 }] },
      ],
    })).scenes[0];
    expect(s.ops.map((o) => o.t)).toEqual([0, 1, 4, 4.5]);
    expect(s.beats).toMatchObject([{ start: 0, end: 3 }, { start: 3, end: 5.5 }]);
    expect(s.duration).toBe(5.5);
  });

  it('hides elements that a beat reveals, unless told otherwise', () => {
    const s = ok(deck({
      elements: [
        { id: 'a', type: 'text', text: 'a', x: 0, y: 0 },
        { id: 'b', type: 'text', text: 'b', x: 0, y: 0 },
        { id: 'c', type: 'text', text: 'c', x: 0, y: 0, visible: true },
      ],
      beats: [{ actions: [{ do: 'draw', target: ['a', 'c'] }] }],
    })).scenes[0];
    expect(s.initial.a.visible).toBe(false);
    expect(s.initial.b.visible).toBe(true);
    expect(s.initial.c.visible).toBe(true);
  });

  it('frames elements with the camera', () => {
    const s = ok(deck({
      elements: [{ id: 'box', type: 'box', x: 500, y: 300, width: 400, height: 200 }],
      beats: [{ actions: [{ do: 'camera', focus: 'box', padding: 160 }] }],
    })).scenes[0];
    const cam = s.ops[0];
    expect(cam.kind).toBe('camera');
    if (cam.kind !== 'camera') return;
    expect(cam.from).toEqual({ x: 960, y: 540, zoom: 1 });
    expect(cam.to).toEqual({ x: 500, y: 300, zoom: (1080 - 320) / 200 });
  });

  it('carries visible elements, positions and camera into an inheriting scene', () => {
    const p = ok({
      version: 1,
      title: 't',
      scenes: [
        {
          id: 'one',
          elements: [
            { id: 'a', type: 'icon', icon: 'user', x: 100, y: 100 },
            { id: 'gone', type: 'text', text: 'x', x: 0, y: 0 },
          ],
          beats: [{ actions: [
            { do: 'move', target: 'a', to: { x: 300, y: 200 } },
            { do: 'fade-out', target: 'gone' },
            { do: 'camera', zoom: 2 },
          ] }],
        },
        { id: 'two', inherit: true, elements: [], beats: [] },
      ],
    });
    const two = p.scenes[1];
    expect(two.elements.map((e) => e.id)).toEqual(['a']);
    expect(two.initial.a).toMatchObject({ x: 300, y: 200, visible: true });
    expect(two.camera).toEqual({ x: 960, y: 540, zoom: 2 });
  });

  it('adds a ring element for circle', () => {
    const s = ok(deck({
      elements: [{ id: 'a', type: 'icon', icon: 'server', x: 0, y: 0 }],
      beats: [{ actions: [{ do: 'circle', target: 'a' }] }],
    })).scenes[0];
    expect(s.elements.at(-1)).toMatchObject({ type: 'ring', id: 'a-circle' });
    expect(s.initial['a-circle'].visible).toBe(false);
  });

  it('reports readable errors', () => {
    const r = compile(deck({
      elements: [
        { id: 'a', type: 'icon', icon: 'nope', x: 0, y: 0 },
        { id: 'arr', type: 'arrow', from: 'x', to: { x: 0, y: 0 } },
        { id: 't', type: 'text', text: 'hi', x: 0, y: 0 },
      ],
      beats: [{ actions: [{ do: 'draw', target: 'missing' }, { do: 'flow', target: 't' }] }],
    }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual([
      'scenes.0.elements.0: unknown icon "nope" (see docs/library.md)',
      'scenes.0.elements.1 (arr): unknown element "x"',
      'scenes.0.beats.0.actions.0: unknown element "missing"',
      'scenes.0.beats.0.actions.1: flow only works on arrows, "t" is a text',
    ]);
  });

  it('tracks iso rotation and explode, and checks targets', () => {
    const s = ok(deck({
      elements: [{ id: 'db', type: 'iso', model: 'database', x: 0, y: 0, rotate: 10 }],
      beats: [{ actions: [
        { do: 'rotate', target: 'db', by: 45 },
        { do: 'explode', target: 'db', amount: 1 },
        { do: 'spin', target: 'db', speed: 20 },
      ] }],
    })).scenes[0];
    expect(s.ops.map((o) => o.kind)).toEqual(['iso', 'iso', 'spin']);
    expect(s.final.db.iso).toEqual({ rotate: 55, explode: 1, spin: 20 });

    const bad = compile(deck({
      elements: [
        { id: 'a', type: 'iso', model: 'nope', x: 0, y: 0 },
        { id: 't', type: 'text', text: 'x', x: 0, y: 0 },
      ],
      beats: [{ actions: [{ do: 'spin', target: 't' }] }],
    }));
    expect(bad.ok ? [] : bad.errors).toEqual([
      'scenes.0.elements.0: unknown iso model "nope" (see docs/library.md)',
      'scenes.0.beats.0.actions.0: spin only works on iso elements, "t" is a text',
    ]);
  });

  it('reports an arrow to an invalid element instead of throwing later', () => {
    const r = compile(deck({
      elements: [
        { id: 'a', type: 'icon', icon: 'nope', x: 0, y: 0 },
        { id: 'b', type: 'icon', icon: 'user', x: 400, y: 0 },
        { id: 'ab', type: 'arrow', from: 'a', to: 'b' },
      ],
      beats: [{ actions: [{ do: 'camera', focus: 'all' }, { do: 'circle', target: 'b' }] }],
    }));
    expect(r.ok ? [] : r.errors).toEqual([
      'scenes.0.elements.0: unknown icon "nope" (see docs/library.md)',
      'scenes.0.elements.2 (ab): unknown element "a"',
    ]);
  });

  it('animates chart values and scales the axis to cover them', () => {
    const s = ok(deck({
      elements: [{ id: 'c', type: 'chart', x: 0, y: 0, data: [{ label: 'a', value: 10 }, { label: 'b', value: 20 }] }],
      beats: [{ actions: [{ do: 'draw', target: 'c' }, { do: 'set-values', target: 'c', values: [5, 47] }] }],
    })).scenes[0];
    expect(s.ops.at(-1)).toMatchObject({ kind: 'values', from: [10, 20], to: [5, 47] });
    expect(s.initial.c.chart).toEqual({ values: [10, 20], max: 50 });
    expect(s.final.c.chart).toEqual({ values: [5, 47], max: 50 });

    const bad = compile(deck({
      elements: [{ id: 'c', type: 'chart', x: 0, y: 0, data: [{ label: 'a', value: 1 }] }, { id: 't', type: 'text', text: 'x', x: 0, y: 0 }],
      beats: [{ actions: [{ do: 'set-values', target: 'c', values: [1, 2] }, { do: 'set-values', target: 't', values: [1] }] }],
    }));
    expect(bad.ok ? [] : bad.errors).toEqual([
      'scenes.0.beats.0.actions.0: "c" has 1 data items but got 2 values',
      'scenes.0.beats.0.actions.1: set-values only works on charts, "t" is a text',
    ]);
  });

  it('picks round axis maxima', () => {
    expect([0, 1, 9, 20, 47, 95, 120, 180].map(niceMax)).toEqual([1, 1.2, 10, 25, 50, 100, 150, 200]);
  });

  it('reports schema errors with paths', () => {
    const r = compile({ version: 1, title: 't', scenes: [{ id: 's', elements: [{ id: 'a', type: 'blob' }] }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/^scenes\.0\.elements\.0/);
  });
});

describe('docs/format.md', () => {
  it('has an example that compiles', async () => {
    const { readFileSync } = await import('node:fs');
    const md = readFileSync(new URL('../../docs/format.md', import.meta.url), 'utf8');
    const example = [...md.matchAll(/```json\n([\s\S]*?)```/g)].at(-1)![1];
    ok(JSON.parse(example));
  });
});
