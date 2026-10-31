import { describe, expect, it } from 'vitest';
import { isoModels, projectIso } from './iso';

describe('projectIso', () => {
  it('shows three faces of a box', () => {
    const { faces } = projectIso([{ shape: 'box', size: [1, 1, 1], at: [0, 0, 0] }], { rotate: 0, explode: 0 }, 100);
    expect(faces).toHaveLength(3);
  });

  it('paints parts that sit on a plate after the plate, whatever their depth', () => {
    const parts = isoModels['gpu-cluster'].parts;
    for (const rotate of [0, 30, 90, 200]) {
      const { faces } = projectIso(parts, { rotate, explode: 0.5 }, 100);
      const firstCube = faces.findIndex((f) => f.part !== 0);
      const lastPlate = faces.map((f) => f.part).lastIndexOf(0);
      expect(lastPlate).toBeLessThan(firstCube);
    }
  });

  it('paints a stack bottom to top', () => {
    const { faces } = projectIso(isoModels['server-stack'].parts, { rotate: 0, explode: 0 }, 100);
    const order = [...new Set(faces.map((f) => f.part))];
    expect(order).toEqual([0, 1, 2, 3]);
  });
});
