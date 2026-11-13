import { describe, expect, it } from 'vitest';
import { arrowPath } from './arrowPath';
import { compile } from './compile';
import { arrowEnds } from './geometry';
import type { ArrowElement, Element } from './schema';

describe("an arrow's line", () => {
  it('without knots is the bent line it always was', () => {
    const p = arrowPath({ x: 0, y: 0 }, { x: 100, y: 0 }, { curve: 0.2 });
    expect(p.d).toBe('M0 0Q50 -20 100 0');
    expect(p.endFrom).toEqual({ x: 50, y: -20 });
  });

  it('goes smoothly through every knot, the heads aiming along it', () => {
    const p = arrowPath({ x: 0, y: 0 }, { x: 200, y: 0 }, { via: [{ x: 100, y: 100 }] });
    expect(p.d.match(/C/g)).toHaveLength(2);
    expect(p.d).toContain(' 100 100C');
    // The end's head comes from below-left, as the curve does.
    expect(p.endFrom.x).toBeLessThan(200);
    expect(p.endFrom.y).toBeGreaterThan(0);
    // Halfway is near the knot, going right.
    expect(p.mid.x).toBeCloseTo(100, 0);
    expect(p.mid.y).toBeGreaterThan(80);
    expect(p.dir.x).toBeGreaterThan(0.9);
  });

  it('with corners: straight lines, rounded at each knot, the head aiming from the last knot', () => {
    const p = arrowPath({ x: 0, y: 0 }, { x: 200, y: 100 }, { via: [{ x: 200, y: 0 }], bends: 'corners' });
    expect(p.d).toBe('M0 0L172 0Q200 0 200 28L200 100');
    expect(p.endFrom).toEqual({ x: 200, y: 0 });
  });
});

describe('where an arrow meets what it connects', () => {
  const els: Element[] = [
    { id: 'a', type: 'box', x: 200, y: 500, width: 200, height: 100, radius: 16, shape: 'rect', weight: 'normal', color: 'white' } as Element,
    { id: 'b', type: 'box', x: 800, y: 200, width: 200, height: 100, radius: 16, shape: 'rect', weight: 'normal', color: 'white' } as Element,
  ];
  const lookup = (id: string) => els.find((e) => e.id === id);
  const arrow = (extra: Partial<ArrowElement>) => ({ id: 'x', type: 'arrow', from: 'a', to: 'b', curve: 0, head: 'end', weight: 'normal', dashed: false, bends: 'smooth', color: 'white', ...extra }) as ArrowElement;

  it('without knots, each end faces the other', () => {
    const { start, end } = arrowEnds(arrow({}), lookup);
    expect(start.x).toBeGreaterThan(300);
    expect(end.x).toBeLessThan(700);
  });

  it('with knots, each end faces its nearest knot (leaves from the top, arrives at the bottom)', () => {
    const { start, end } = arrowEnds(arrow({ via: [{ x: 200, y: 350 }, { x: 800, y: 350 }] }), lookup);
    expect(start).toMatchObject({ x: 200 });
    expect(start.y).toBeLessThan(450);
    expect(end).toMatchObject({ x: 800 });
    expect(end.y).toBeGreaterThan(250);
  });

  it('is part of the format', () => {
    const r = compile({ version: 1, title: 't', scenes: [{ id: 's', elements: [...els, { id: 'x', type: 'arrow', from: 'a.top', to: 'b.bottom', via: [{ x: 200, y: 350 }, { x: 800, y: 350 }], bends: 'corners' }], beats: [] }] });
    expect(r.ok ? '' : r.errors.join()).toBe('');
  });
});
