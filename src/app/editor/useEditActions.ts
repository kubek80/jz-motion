// What the editor does to the open scene's elements and to the scene list: add (from the palette or a
// pasted picture), duplicate, rename and delete elements; delete a scene after asking.
import type { Stage } from '../../engine';
import type { Camera } from '../../engine/schema';
import { compile } from '../../engine';
import { cueClicks } from '../../video/performance';
import { confirmDialog } from '../confirm';
import { closeGap, sceneGap } from './closeGap';
import { addElement, addSceneAt, deleteElement, deleteScene, renameElement, sceneSlot, uniqueId, type Raw, type RawDoc } from './doc';
import { newElement } from './elements';
import type { AddRequest } from './Library';
import type { Selection } from './types';

interface EditActionsOptions {
  doc: RawDoc | null;
  /** The latest document, for an action that finishes after a confirmation. */
  docRef: React.RefObject<RawDoc | null>;
  sceneIndex: number;
  picked: string[];
  pickedEl: Raw | undefined;
  stage: React.RefObject<Stage | null>;
  editCams: React.RefObject<Map<number, Camera>>;
  /** A scene to switch to when the presentation next reloads. */
  openScene: React.RefObject<number | null>;
  update: (next: RawDoc) => void;
  setPicked: (ids: string[]) => void;
  setSelection: (s: Selection) => void;
  setArrowFrom: (from: string | null | undefined) => void;
}

/** The actions are made fresh each render, so each sees the current document and selection. */
export function useEditActions({ doc, docRef, sceneIndex, picked, pickedEl, stage, editCams, openScene, update, setPicked, setSelection, setArrowFrom }: EditActionsOptions) {
  /** An empty scene before or after scene `i`, opened straight away. */
  const newScene = (i: number, where: 'before' | 'after') => {
    if (!doc) return;
    const added = addSceneAt(doc, sceneSlot(doc, i, where));
    openScene.current = added.index;
    setPicked([]);
    setSelection(null);
    update(added.doc);
  };

  const removeScene = async (i: number) => {
    if (!doc) return;
    const s = doc.scenes[i];
    // A timed presentation: take the scene's time out too, so later beats and the narration close up.
    const gapOf = (d: RawDoc) => {
      const r = compile(d);
      return r.ok ? sceneGap(cueClicks(r.presentation), i) : undefined;
    };
    const gap = gapOf(doc);
    const ok = await confirmDialog({
      title: `Delete scene ${i + 1}, “${s.title ?? s.id}”?`,
      message: `${s.elements?.length ?? 0} elements and ${s.beats?.length ?? 0} beats go with it.${gap
        ? ` Its ${(gap.end - gap.start).toFixed(1)} s on the timeline go too: later beats move earlier and the narration recorded over it is cut out, so nothing is left with a hole.`
        : ''} Undo (Ctrl+Z) brings it back.`,
      confirm: 'Delete scene', danger: true,
    });
    const now = docRef.current;
    if (!ok || !now || now.scenes[i] !== s) return;
    const gapNow = gapOf(now);
    // Stay on the same scene, or the one before it if it was the open one or came earlier.
    editCams.current.clear(); // its views are kept by scene number, which shift
    openScene.current = i <= sceneIndex ? Math.max(0, sceneIndex - 1) : sceneIndex;
    setPicked([]);
    setSelection(null);
    update(deleteScene(gapNow ? closeGap(now, i, gapNow) : now, i));
  };

  const deletePicked = (list: string[]) => {
    if (!doc || !list.length) return;
    update(list.reduce((d, id) => deleteElement(d, sceneIndex, id), doc));
    setPicked([]);
  };

  const add = (r: AddRequest) => {
    if (!doc) return;
    if (r.kind === 'arrow' && picked.length !== 2) {
      // Start the arrow tool; a single selected element is where the arrow starts.
      setArrowFrom(picked.length === 1 ? picked[0] : null);
      return;
    }
    const el = newElement(r, doc, sceneIndex, stage.current?.camera ?? { x: 960, y: 540, zoom: 1 }, pickedEl, picked);
    update(addElement(doc, sceneIndex, el));
    setPicked([el.id]);
    setSelection(null);
  };

  const duplicate = (id: string) => {
    if (!doc) return;
    const el = doc.scenes[sceneIndex].elements?.find((e) => e.id === id);
    if (!el) return;
    const copy: Raw = { ...structuredClone(el), id: uniqueId(doc, sceneIndex, id) };
    if (typeof copy.x === 'number') { copy.x += 60; copy.y += 60; }
    update(addElement(doc, sceneIndex, copy));
    setPicked([copy.id]);
  };

  const rename = (from: string, to: string): string | null => {
    if (!doc) return 'no document';
    if (!/^[A-Za-z][\w-]*$/.test(to)) return 'Start with a letter; use letters, digits, - or _';
    if (uniqueId(doc, sceneIndex, to) !== to) return `"${to}" is already used`;
    update(renameElement(doc, sceneIndex, from, to));
    setPicked([to]);
    return null;
  };

  return { newScene, removeScene, deletePicked, add, duplicate, rename };
}
