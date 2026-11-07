import { describe, expect, it } from 'vitest';
import { describeChange } from './changes';

describe('what an AI answer changed', () => {
  const before = { title: 'T', scenes: [{ id: 'a', title: 'Intro', beats: [1] }, { id: 'b', title: 'Why' }] };
  it('names added and changed scenes, and where the new one is', () => {
    const after = { title: 'T', scenes: [{ id: 'a', title: 'Intro', beats: [2] }, { id: 'tools', title: 'No Photoshop needed' }, { id: 'b', title: 'Why' }] };
    const c = describeChange(before, after);
    expect(c.added).toEqual([1]);
    expect(c.text).toBe('Added scene 2 “No Photoshop needed” · changed scene 1');
  });
  it('says nothing when nothing changed', () => {
    expect(describeChange(before, structuredClone(before)).text).toBe('');
  });
});
