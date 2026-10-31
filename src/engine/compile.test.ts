import { describe, expect, it } from 'vitest';
import intro from '../examples/intro.json';
import { compile, type CompiledPresentation } from './compile';

const ok = (input: unknown): CompiledPresentation => {
  const r = compile(input);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.presentation;
};

const deck = (scene: object) => ({ version: 1, title: 't', scenes: [{ id: 's', ...scene }] });

describe('compile', () => {
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
