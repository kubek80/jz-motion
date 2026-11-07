// The windows that open over the editor: Settings, Timing, Script, the Library and the Creator
// (new library item or new scene with AI), wired to the open presentation.
import type { CompileResult } from '../../engine';
import { insertScene } from '../../ai/assistant';
import { Creator, type CreateRequest } from '../Creator';
import { cuedBeatCount, log, voiceoverSummary } from '../debug';
import { LibraryManager } from '../LibraryManager';
import { updateBeats } from './doc';
import { Script } from '../Script';
import { Settings } from '../Settings';
import { Timing } from '../Timing';
import type { RawDoc } from './doc';
import type { AddRequest } from './Library';

interface Props {
  id: string;
  text: string;
  doc: RawDoc | null;
  result: CompileResult | { ok: false; errors: string[] };
  sceneIndex: number;
  update: (next: RawDoc) => void;
  add: (r: AddRequest) => void;
  /** A new scene from the Creator was inserted at this index: open it and clear the selection. */
  onSceneAdded: (index: number) => void;
  /** From Timing: close it and edit this beat. */
  onEditBeat: (scene: number, beat: number) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  timingOpen: boolean;
  setTimingOpen: (open: boolean) => void;
  scriptOpen: boolean;
  setScriptOpen: (open: boolean) => void;
  libraryOpen: boolean;
  setLibraryOpen: (open: boolean) => void;
  creating: CreateRequest | null;
  setCreating: (r: CreateRequest | null) => void;
  libraryVersion: number;
  setLibraryVersion: React.Dispatch<React.SetStateAction<number>>;
  /** A take was made in the Timing window. */
  onTake: (takeId: string) => void;
}

export function EditorWindows({
  id, text, doc, result, sceneIndex, update, add, onSceneAdded, onEditBeat,
  settingsOpen, setSettingsOpen, timingOpen, setTimingOpen, scriptOpen, setScriptOpen, libraryOpen, setLibraryOpen,
  creating, setCreating, libraryVersion, setLibraryVersion, onTake,
}: Props) {
  return (
    <>
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      {timingOpen && doc && result.ok && (
        <Timing
          presentation={result.presentation}
          text={text}
          presentationId={id}
          voiceover={doc.voiceover}
          onVoiceover={(v) => {
            log('onVoiceover', { before: voiceoverSummary(doc.voiceover), after: voiceoverSummary(v) });
            const next = { ...doc };
            if (v) next.voiceover = v; else delete next.voiceover;
            update(next);
          }}
          onCues={(changes, clearOthers) => {
            log('onCues', { count: changes.length, clearOthers: !!clearOthers, changes, cuedBefore: cuedBeatCount(doc) });
            return update({
            ...doc,
            scenes: doc.scenes.map((s, si) => ({
              ...s,
              beats: s.beats?.map((b, bi) => {
                const change = changes.find((c) => c.scene === si && c.beat === bi);
                const { cue, ...rest } = b;
                const next = change ? change.cue : clearOthers ? undefined : cue;
                return next === undefined ? rest : { ...rest, cue: next };
              }),
            })),
          });
          }}
          onNotes={(scene, beat, notes) => update({
            ...doc,
            scenes: doc.scenes.map((s, si) => si !== scene ? s : ({
              ...s,
              beats: s.beats?.map((b, bi) => {
                if (bi !== beat) return b;
                const { notes: _n, ...rest } = b;
                return notes.trim() ? { ...rest, notes } : rest;
              }),
            })),
          })}
          onTake={onTake}
          onEditBeat={onEditBeat}
          doc={doc}
          onBeat={(si, bi, next) => update(updateBeats(doc, si, (beats) => beats.map((b, i) => (i === bi ? next : b))))}
          onClose={() => setTimingOpen(false)}
        />
      )}
      {scriptOpen && doc && result.ok && (
        <Script
          presentation={result.presentation}
          presentationId={id}
          onNotes={(scene, beat, notes) => update({
            ...doc,
            scenes: doc.scenes.map((s, si) => si !== scene ? s : ({
              ...s,
              beats: s.beats?.map((b, bi) => {
                if (bi !== beat) return b;
                const { notes: _n, ...rest } = b;
                return notes.trim() ? { ...rest, notes } : rest;
              }),
            })),
          })}
          onClose={() => setScriptOpen(false)}
        />
      )}
      {libraryOpen && (
        <LibraryManager
          onClose={() => setLibraryOpen(false)}
          onAdd={(it) => add(it)}
          onCreate={(kind, start) => setCreating({ kind, start })}
          onChanged={() => setLibraryVersion((v) => v + 1)}
          version={libraryVersion}
        />
      )}
      {creating && doc && (
        <Creator
          initialKind={creating.kind}
          start={creating.start}
          presentation={text}
          scene={creating.after ?? sceneIndex}
          onClose={() => setCreating(null)}
          onSaved={(kind, name) => {
            setCreating(null);
            setLibraryVersion((v) => v + 1);
            // From the library window, the new item just shows up there; otherwise it goes on the board.
            if (!libraryOpen) add(kind === '3d' ? { kind: 'iso', name } : { kind: 'icon', name });
          }}
          onAddScene={(scene) => {
            setCreating(null);
            const { doc: next, index } = insertScene(doc, scene, creating.after ?? sceneIndex);
            onSceneAdded(index);
            update(next as RawDoc);
          }}
        />
      )}
    </>
  );
}
