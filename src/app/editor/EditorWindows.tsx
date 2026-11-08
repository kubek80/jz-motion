// The windows that open over the editor: Settings, Timing, Script, the Library and the Creator
// (new library item or new scene with AI), wired to the open presentation.
import { splitHidden, type TimedDoc } from '../../video/sceneTimeline';
import type { CompileResult } from '../../engine';
import { insertScene } from '../../ai/assistant';
import { Creator, type CreateRequest } from '../Creator';
import { cuedBeatCount, log, voiceoverSummary } from '../debug';
import { LibraryManager } from '../LibraryManager';
import { updateBeats, updateScene } from './doc';
import { Script } from '../Script';
import { Settings } from '../Settings';
import { Timing } from '../Timing';
import type { RawDoc } from './doc';
import type { AddRequest } from './Library';

/** The document with these cues set (or, with `clearOthers`, only these). */
function withCues(doc: RawDoc, changes: { scene: number; beat: number; cue: number | undefined }[], clearOthers = false): RawDoc {
  return {
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
  };
}

/** The voice-over Timing works on: without the narration of scenes left out of the video (it comes back with them). */
function shownVoiceover(doc: RawDoc): RawDoc['voiceover'] {
  if (!doc.voiceover?.clips) return doc.voiceover;
  const { shown, hidden } = splitHidden(doc as unknown as TimedDoc);
  return hidden.length ? { ...doc.voiceover, clips: shown as never } : doc.voiceover;
}

/** The document with Timing's voice-over, keeping the narration of scenes left out. */
function withVoiceover(doc: RawDoc, v: RawDoc['voiceover'] | undefined): RawDoc {
  const { hidden } = doc.voiceover?.clips ? splitHidden(doc as unknown as TimedDoc) : { hidden: [] };
  const next = { ...doc };
  if (!hidden.length) {
    if (v) next.voiceover = v; else delete next.voiceover;
    return next;
  }
  next.voiceover = { ...(v ?? {}), clips: [...((v as { clips?: unknown[] } | undefined)?.clips ?? []), ...hidden] } as RawDoc['voiceover'];
  return next;
}

interface Props {
  id: string;
  text: string;
  doc: RawDoc | null;
  result: CompileResult | { ok: false; errors: string[] };
  sceneIndex: number;
  update: (next: RawDoc) => void;
  /** The presentation with every edit so far, even ones made a moment ago (two edits in a row build on each other). */
  latest: () => RawDoc;
  add: (r: AddRequest) => void;
  /** A new scene from the Creator was inserted at this index: open it and clear the selection. */
  onSceneAdded: (index: number) => void;
  /** Undo the last change (the clip window's Undo). */
  onUndo: () => void;
  /** From Timing: close it and edit this beat. */
  onEditBeat: (scene: number, beat: number) => void;
  /** Timing closed with this scene at its playhead: show it. */
  onTimingClosed: (scene: number) => void;
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
  id, text, doc, result, sceneIndex, update, latest, add, onSceneAdded, onEditBeat, onUndo, onTimingClosed,
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
          voiceover={shownVoiceover(doc)}
          onVoiceover={(v) => {
            const doc = latest();
            log('onVoiceover', { before: voiceoverSummary(doc.voiceover), after: voiceoverSummary(v) });
            update(withVoiceover(doc, v));
          }}
          onCues={(changes, clearOthers) => {
            const doc = latest();
            log('onCues', { count: changes.length, clearOthers: !!clearOthers, changes, cuedBefore: cuedBeatCount(doc) });
            return update(withCues(doc, changes, clearOthers));
          }}
          onTimeline={(v, changes) => {
            // Clips and cues in one change, so one undo takes back both.
            const doc = withCues(latest(), changes);
            log('onTimeline', { before: voiceoverSummary(doc.voiceover), after: voiceoverSummary(v), cues: changes.length });
            update(withVoiceover(doc, v));
          }}
          onUndo={onUndo}
          onNotes={(scene, beat, notes) => update({
            ...latest(),
            scenes: latest().scenes.map((s, si) => si !== scene ? s : ({
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
          onBeat={(si, bi, next) => update(updateBeats(latest(), si, (beats) => beats.map((b, i) => (i === bi ? next : b))))}
          onSceneLayout={(si, layout, beatsToo) => {
            const d = updateScene(latest(), si, { layout });
            update(beatsToo ? updateBeats(d, si, (beats) => beats.map((b) => { const { layout: _l, ...rest } = b as typeof b & { layout?: string }; return rest; })) : d);
          }}
          startScene={sceneIndex}
          onClose={(scene) => { setTimingOpen(false); onTimingClosed(scene); }}
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
