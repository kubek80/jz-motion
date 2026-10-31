import { describe, expect, it } from 'vitest';
import { compile } from '../../engine/compile';
import { addElement, deleteElement, deleteScene, renameElement, uniqueId, updateElement, type RawDoc } from './doc';

const doc = (): RawDoc => ({
  version: 1,
  title: 't',
  scenes: [
    {
      id: 'one',
      elements: [
        { id: 'user', type: 'icon', icon: 'user', x: 100, y: 100 },
        { id: 'api', type: 'box', x: 500, y: 100, width: 200, height: 100 },
        { id: 'req', type: 'arrow', from: 'user.right', to: 'api' },
      ],
      beats: [
        { actions: [{ do: 'draw', target: ['user', 'req', 'api'] }, { do: 'camera', focus: 'user' }] },
      ],
    },
    {
      id: 'two',
      inherit: true,
      elements: [{ id: 'db', type: 'icon', icon: 'database', x: 900, y: 100 }],
      beats: [{ actions: [{ do: 'pulse', target: 'user' }, { do: 'draw', target: 'db' }] }],
    },
  ],
});

describe('doc edits', () => {
  it('renames an element and every reference, including inheriting scenes', () => {
    const d = renameElement(doc(), 0, 'user', 'person');
    expect(d.scenes[0].elements![0].id).toBe('person');
    expect(d.scenes[0].elements![2].from).toBe('person.right');
    expect(d.scenes[0].beats![0].actions[0].target).toEqual(['person', 'req', 'api']);
    expect(d.scenes[0].beats![0].actions[1].focus).toBe('person');
    expect(d.scenes[1].beats![0].actions[0].target).toBe('person');
    expect(compile(d).ok).toBe(true);
  });

  it('deletes an element with its arrows and drops actions that lose all targets', () => {
    const d = deleteElement(doc(), 0, 'user');
    expect(d.scenes[0].elements!.map((e) => e.id)).toEqual(['api']);
    expect(d.scenes[0].beats![0].actions).toEqual([{ do: 'draw', target: ['api'] }]);
    expect(d.scenes[1].beats![0].actions).toEqual([{ do: 'draw', target: 'db' }]);
    expect(compile(d).ok).toBe(true);
  });

  it('makes ids unique across the inherit chain', () => {
    expect(uniqueId(doc(), 1, 'user')).toBe('user-2');
    expect(uniqueId(doc(), 0, 'db')).toBe('db-2');
    expect(uniqueId(doc(), 0, '3d box')).toBe('d-box');
  });

  it('updates and removes fields without touching the input', () => {
    const before = doc();
    const d = updateElement(addElement(before, 0, { id: 'note', type: 'text', text: 'hi', x: 0, y: 0, size: 40 }), 0, 'note', { size: undefined, color: 'pink' });
    expect(d.scenes[0].elements!.at(-1)).toEqual({ id: 'note', type: 'text', text: 'hi', x: 0, y: 0, color: 'pink' });
    expect(before.scenes[0].elements).toHaveLength(3);
  });

  it('keeps at least one scene and fixes inheritance of a new first scene', () => {
    const d = deleteScene(doc(), 0);
    expect(d.scenes).toHaveLength(1);
    expect(d.scenes[0].inherit).toBeUndefined();
    expect(deleteScene(d, 0).scenes).toHaveLength(1);
  });
});
