import { describe, expect, it } from 'vitest';
import intro from '../examples/intro.json';
import hardware from '../examples/hardware.json';
import { checkScene, insertScene } from './assistant';

describe('insertScene', () => {
  it('goes after the scenes that continue from the current one, with a unique id', () => {
    // intro: idea, how, next (next continues from how)
    const { doc, index } = insertScene(intro, { id: 'how', title: 'new' }, 1);
    expect(index).toBe(3);
    expect(doc.scenes.map((s) => s.id)).toEqual(['idea', 'how', 'next', 'how-2']);
    expect(insertScene(intro, { id: 'x' }, 0).index).toBe(1);
  });

  it('accepts a scene that loads where it is inserted, and names the new scene in errors', () => {
    const text = JSON.stringify(intro);
    expect(checkScene(text, 1)(hardware.scenes[0]).ok).toBe(true);
    const bad = checkScene(text, 0)({ id: 'x', elements: [], beats: [{ actions: [{ do: 'draw', target: 'ghost' }] }] });
    expect(bad.ok ? [] : bad.errors).toEqual(['the new scene.beats.0.actions.0: unknown element "ghost"']);
  });
});
