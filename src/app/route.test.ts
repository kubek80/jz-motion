import { describe, expect, it } from 'vitest';
import { formatRoute, parseRoute } from './route';

describe('where you are, in the address', () => {
  it('reads the presentation alone, as before', () => {
    expect(parseRoute('#/p/9df1df97')).toEqual({ id: '9df1df97', views: [] });
    expect(parseRoute('')).toEqual({ id: null, views: [] });
  });

  it('reads and writes the windows, the scene, the tab, the playhead and the Script beat', () => {
    const r = parseRoute('#/p/abc/timing/script?scene=3&tab=video&t=45.25&at=3.2');
    expect(r).toEqual({ id: 'abc', views: ['timing', 'script'], scene: 2, tab: 'video', t: 45.25, at: { scene: 2, beat: 1 } });
    expect(formatRoute(r)).toBe('#/p/abc/timing/script?scene=3&tab=video&t=45.3&at=3.2');
  });

  it('leaves out what is at its default', () => {
    expect(formatRoute({ id: 'abc', views: [], scene: 0, tab: 'props' })).toBe('#/p/abc');
    expect(formatRoute({ id: 'abc', views: ['settings'], scene: 4 })).toBe('#/p/abc/settings?scene=5');
  });

  it('ignores what it does not know', () => {
    expect(parseRoute('#/p/abc/nonsense/timing?scene=x&tab=other&t=-3')).toEqual({ id: 'abc', views: ['timing'] });
  });
});
