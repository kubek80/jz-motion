import { describe, expect, it } from 'vitest';
import { splitSubpaths } from './pathSplit';

describe('splitSubpaths', () => {
  it('keeps a single path as it is', () => {
    expect(splitSubpaths('M1 2L3 4')).toEqual(['M1 2L3 4']);
  });

  it('splits absolute moves', () => {
    expect(splitSubpaths('M0 0L10 0ZM20 20H30')).toEqual(['M0 0L10 0Z', 'M20 20H30']);
  });

  it('makes a relative move absolute, from where the last piece ended', () => {
    // After "l10 5" the pen is at (11, 6); "m4 4" moves to (15, 10).
    expect(splitSubpaths('M1 1l10 5m4 4l1 1')).toEqual(['M1 1l10 5', 'M15 10l1 1']);
  });

  it('starts a relative move after Z from the subpath start', () => {
    expect(splitSubpaths('m5 5h10v10zm2 2h1')).toEqual(['M5 5h10v10Z', 'M7 7h1']);
  });

  it('treats extra pairs after a move as lines and follows curves and arcs', () => {
    expect(splitSubpaths('M0 0 10 0 10 10M20 0c1 1 2 2 3 3a5 5 0 0 1 10 0m1-1l2 2')).toEqual([
      'M0 0L10 0L10 10', 'M20 0c1 1 2 2 3 3a5 5 0 0 1 10 0', 'M34 2l2 2',
    ]);
  });
});
