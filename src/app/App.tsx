// The editor for one open presentation: owns its state (text and undo history, mode, selection, open
// windows) and lays out the board, panels and controls. The parts live in ./editor/.
import { adoptProjectVoice } from './settingsStore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compile, Stage, type StagePosition } from '../engine';
import type { Camera } from '../engine/schema';
import type { CreateRequest } from './Creator';
import type { ChatMessageView } from './Chat';
import { boardFullscreen } from './fullscreen';
import { imageFrom } from './images';
import { Resizer, useResizable } from './Resizer';
import { useRecorder } from './useRecorder';
import { cuedBeatCount, log, voiceoverSummary } from './debug';
import { Beats } from './editor/Beats';
import { idsInScope, sceneSlot, updateBeats, type RawDoc } from './editor/doc';
import { pinPatch, RESIZABLE } from './editor/elements';
import { EditorWindows } from './editor/EditorWindows';
import { FrameStepper, isRecording } from './editor/FrameStepper';
import { InlineTextEditor, useInlineText } from './editor/InlineTextEditor';
import { ModeSwitch } from './editor/ModeSwitch';
import { Library } from './editor/Library';
import { PlayControls } from './editor/PlayControls';
import { RightPanel, type Panel } from './editor/RightPanel';
import { SceneAsk } from './editor/SceneAsk';
import { SceneList } from './editor/SceneList';
import { TopBar } from './editor/TopBar';
import type { Selection } from './editor/types';
import { useBoardPointer } from './editor/useBoardPointer';
import { useEditActions } from './editor/useEditActions';
import { useEditorKeys } from './editor/useEditorKeys';
import { useElementInfo } from './editor/useElementInfo';
import { useLiveOutline } from './editor/useLiveOutline';
import { usePictureInput } from './editor/usePictureInput';
import { useHistory } from './useHistory';

type Mode = 'edit' | 'play';

interface EditorProps {
  id: string;
  initial: string;
  /** Called (debounced) with the presentation text after changes. */
  onSave: (text: string) => void;
  onHome: () => void;
}

/** One open presentation: board, editor panels, play mode, recording. */
export function Editor({ id, initial, onSave, onHome }: EditorProps) {
  const history = useHistory(initial);
  const text = history.value;
  const [mode, setMode] = useState<Mode>('edit');
  // Panel sizes the user can drag; persisted per-key in localStorage, double-click resets.
  const leftW = useResizable('left-w', 230, 180, 520);
  // Default height = whatever the stylesheet's `calc(100vh - 260px)` evaluates to for this viewport.
  // Captured at mount so dragging has an absolute starting point; a window resize before any drag
  // doesn't retroactively change the stored default.
  const playbackDefault = useMemo(() => Math.max(240, (typeof window !== 'undefined' ? window.innerHeight : 1000) - 260), []);
  const playbackH = useResizable('playback-h', playbackDefault, 240, 2000);
  const [panel, setPanel] = useState<Panel>('props');
  const [pos, setPos] = useState<StagePosition>({ scene: 0, beat: 0, time: 0, duration: 0, playing: false });
  const [picked, setPicked] = useState<string[]>([]);
  /** Arrow tool: click the start element, then the end element. */
  const [arrowFrom, setArrowFrom] = useState<string | null | undefined>(undefined);
  /** A scene to switch to when the presentation next reloads (just added). */
  const openScene = useRef<number | null>(null);
  const arrowTool = arrowFrom !== undefined;
  const [selection, setSelection] = useState<Selection>(null);
  const stageHost = useRef<HTMLDivElement>(null);
  const stageFrame = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  /** The editor's own camera per scene, so edits don't reset the view. */
  const editCams = useRef(new Map<number, Camera>());
  const posRef = useRef(pos);
  posRef.current = pos;
  const [withCamera, setWithCamera] = useState(true);
  /** The AI chat for this presentation, kept while it is open. */
  const [chatLog, setChatLog] = useState<ChatMessageView[]>([]);
  const [creating, setCreating] = useState<CreateRequest | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [timingOpen, setTimingOpen] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  /** A take made in the Timing window, shown in the Video tab. */
  const [madeTake, setMadeTake] = useState<string | undefined>();
  /** Bumped when the library gains an item, so the palette shows it. */
  const [libraryVersion, setLibraryVersion] = useState(0);
  const docRef = useRef<RawDoc | null>(null);
  const recorder = useRecorder(stage, () => JSON.parse(history.value), () => docRef.current?.title ?? 'take', id);
  const preview = useRef<HTMLVideoElement>(null);
  const recording = recorder.state.status === 'recording';

  // Save shortly after edits stop, and on the way out.
  const saved = useRef(initial);
  const latest = useRef(text);
  latest.current = text;
  // A computer whose browser has no voice of yours yet uses the one kept with the project.
  useEffect(() => { void adoptProjectVoice(); }, []);
  useEffect(() => {
    if (text === saved.current) return;
    const timer = window.setTimeout(() => { saved.current = text; onSave(text); }, 500);
    return () => clearTimeout(timer);
  }, [text, onSave]);
  useEffect(() => () => { if (latest.current !== saved.current) onSave(latest.current); }, [onSave]);

  const doc = useMemo<RawDoc | null>(() => {
    try {
      const d = JSON.parse(text);
      return d && Array.isArray(d.scenes) && d.scenes.length ? d : null;
    } catch {
      return null;
    }
  }, [text]);

  docRef.current = doc;
  // The board can still be on a scene that was just deleted; keep to the scenes that exist.
  const sceneIndex = doc ? Math.min(pos.scene, doc.scenes.length - 1) : pos.scene;
  useEffect(() => {
    if (preview.current) preview.current.srcObject = recorder.state.stream ?? null;
  }, [recorder.state.stream]);

  const result = useMemo(() => {
    try {
      return compile(JSON.parse(text));
    } catch (e) {
      return { ok: false as const, errors: [`JSON: ${(e as Error).message}`] };
    }
  }, [text]);

  const scene = doc?.scenes[sceneIndex];
  const editable = useMemo(() => new Set((scene?.elements ?? []).map((e) => e.id)), [scene]);
  const ids = useMemo(() => (doc ? [...idsInScope(doc, sceneIndex)] : []), [doc, sceneIndex]);

  const update = useCallback((next: RawDoc) => {
    // Known straight away, so a second edit in the same moment builds on this one.
    docRef.current = next;
    log('update', { voiceover: voiceoverSummary(next.voiceover), cuedBeats: cuedBeatCount(next), scenes: next.scenes.length });
    history.set(JSON.stringify(next, null, 2));
  }, [history]);

  // ---------------------------------------------------------------- stage

  useEffect(() => {
    const s = new Stage(stageHost.current!);
    stage.current = s;
    // For poking at the board from the console and from browser tests.
    if (import.meta.env.DEV) (window as unknown as { jzmStage: Stage }).jzmStage = s;
    const off = s.onChange(setPos);
    return () => {
      off();
      s.destroy();
      stage.current = null;
    };
  }, []);

  const pickedEl = picked.length === 1 ? scene?.elements?.find((e) => e.id === picked[0]) : undefined;
  const canResize = !!pickedEl && RESIZABLE.has(pickedEl.type);
  const highlight = useCallback(() => {
    const s = stage.current;
    if (!s || mode !== 'edit') return;
    let secondary: string[] = [];
    if (selection?.kind === 'action') {
      const a = scene?.beats?.[selection.beat]?.actions[selection.action];
      secondary = a ? [a.target ?? a.focus ?? []].flat() : [];
    }
    s.setSelection(picked, secondary, { handles: canResize });
  }, [mode, picked, selection, scene, canResize]);

  // Rebuild the board when the presentation or mode changes.
  useEffect(() => {
    const s = stage.current;
    if (!s || !result.ok) return;
    const { beat } = posRef.current;
    // After adding a scene, open it once the presentation has it.
    const si = openScene.current ?? posRef.current.scene;
    openScene.current = null;
    const at = Math.min(si, result.presentation.scenes.length - 1);
    void s.load(result.presentation, { scene: at, beat: mode === 'edit' ? 0 : beat }).then(() => {
      // The stage may have been replaced while fonts loaded (React dev mode mounts twice).
      if (stage.current !== s) return;
      if (mode === 'edit') {
        s.showLayout(at, new Set((doc?.scenes[at]?.elements ?? []).map((e) => e.id)), editCams.current.get(at));
        editCams.current.set(at, s.camera);
        highlight();
      }
    });
    // highlight and doc are read at load time only; they have their own effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, mode]);

  useEffect(highlight, [highlight]);

  // Drop selections that no longer exist after an edit.
  useEffect(() => {
    setPicked((p) => (p.every((id) => ids.includes(id)) ? p : p.filter((id) => ids.includes(id))));
  }, [ids]);

  const goToScene = (i: number) => {
    setPicked([]);
    setSelection(null);
    const s = stage.current;
    if (!s) return;
    if (mode === 'edit') {
      s.showLayout(i, new Set((doc?.scenes[i]?.elements ?? []).map((e) => e.id)), editCams.current.get(i));
      editCams.current.set(i, s.camera);
    } else {
      s.showScene(i);
    }
  };

  // ---------------------------------------------------------------- editing actions

  const { newScene, removeScene, deletePicked, add, duplicate, rename } = useEditActions({
    doc, docRef, sceneIndex, picked, pickedEl, stage, editCams, openScene, update, setPicked, setSelection, setArrowFrom,
  });

  // ---------------------------------------------------------------- board (edit mode)

  const { inline, setInline, startInline, finishInline } = useInlineText({
    stage, stageFrame, doc, sceneIndex, elements: scene?.elements, editable, setPicked, update,
  });

  const board = useBoardPointer({
    stage, mode, doc, sceneIndex, elements: scene?.elements, ids, editable, picked, setPicked, setSelection, pickedEl, canResize,
    arrowFrom, setArrowFrom, editingText: !!inline, startInline, editCams, update,
  });

  /** Back to the view the scene starts with, or (fit) to everything on the board. */
  const resetView = (fit = false) => {
    const s = stage.current;
    if (!s || mode !== 'edit') return;
    const start = result.ok ? result.presentation.scenes[sceneIndex]?.camera : undefined;
    s.camera = fit || !start ? s.fitCamera() : start;
    editCams.current.set(sceneIndex, s.camera);
    s.setSelection(picked, [], { handles: canResize });
  };

  const togglePresent = async () => {
    if (boardFullscreen()) await document.exitFullscreen();
    else {
      setMode('play');
      await stageFrame.current?.requestFullscreen();
    }
  };

  useEditorKeys({ mode, setMode, picked, deletePicked, history, duplicate, startInline, resetView, togglePresent }, { stage, setPicked, setSelection, setArrowFrom });
  // Paste a screenshot (Ctrl+V) or drop a picture on the board to add it.
  const addPicture = usePictureInput(mode, add);

  // ---------------------------------------------------------------- files

  const replaceAll = (value: string) => {
    log('replaceAll', { bytes: value.length });
    editCams.current.clear();
    setPicked([]);
    setSelection(null);
    stage.current?.showScene(0);
    history.set(value);
  };

  // ---------------------------------------------------------------- render

  const compiledScene = result.ok ? result.presentation.scenes[sceneIndex] : undefined;
  const { colors: elementColors, types: elementTypes } = useElementInfo(compiledScene);
  useLiveOutline(stage, mode === 'play', compiledScene, scene?.beats, pos);

  return (
    <div className={`app mode-${mode}`}>
      <EditorWindows
        id={id} text={text} doc={doc} result={result} sceneIndex={sceneIndex} update={update} latest={() => docRef.current!} add={add} onUndo={history.undo}
        onSceneAdded={(index) => { openScene.current = index; setPicked([]); setSelection(null); }}
        settingsOpen={settingsOpen} setSettingsOpen={setSettingsOpen} timingOpen={timingOpen} setTimingOpen={setTimingOpen}
        scriptOpen={scriptOpen} setScriptOpen={setScriptOpen} libraryOpen={libraryOpen} setLibraryOpen={setLibraryOpen}
        creating={creating} setCreating={setCreating} libraryVersion={libraryVersion} setLibraryVersion={setLibraryVersion}
        onTake={(takeId) => { setTimingOpen(false); setMadeTake(takeId); setPanel('video'); }}
        onTimingClosed={(si) => { if (si !== sceneIndex) goToScene(si); }}
        onEditBeat={(si, beat) => { setTimingOpen(false); openScene.current = si; if (mode === 'edit') goToScene(si); else setMode('edit'); setSelection({ kind: 'beat', beat }); setPanel('props'); }}
      />
      <TopBar
        title={doc?.title} history={history} valid={result.ok} onHome={onHome}
        onScript={() => setScriptOpen(true)} onTiming={() => setTimingOpen(true)} onPresent={() => void togglePresent()} onSettings={() => setSettingsOpen(true)}
      />

      <div className="main">
        <aside className="left" style={{ width: leftW.value }}>
          <SceneList doc={doc} sceneIndex={sceneIndex} mode={mode} onGo={goToScene} onRemove={(i) => void removeScene(i)} onAdd={(i, where, ai) => (ai && doc ? setCreating({ kind: 'scene', after: sceneSlot(doc, i, where) }) : newScene(i, where))} update={update} />
          {mode === 'edit' && doc && <Library onAdd={add} arrowActive={arrowTool} onCreate={() => setCreating({ kind: 'icon' })} onBrowse={() => setLibraryOpen(true)} version={libraryVersion} />}
        </aside>
        <Resizer orientation="vertical" value={leftW.value} onChange={leftW.setValue} onReset={leftW.reset} min={180} max={520} />

        <section className="center">
          <div
            className="frame"
            ref={stageFrame}
            style={{ maxHeight: playbackH.value }}
            onClick={() => mode === 'play' && stage.current?.next()}
            onPointerDown={board.onPointerDown}
            onPointerMove={board.onPointerMove}
            onPointerUp={board.onPointerUp}
            onWheel={board.onWheel}
            onDoubleClick={board.onDoubleClick}
            onDragOver={(e) => { if (mode === 'edit' && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault(); }}
            onDrop={(e) => { if (mode === 'edit' && addPicture(imageFrom(e.dataTransfer))) e.preventDefault(); }}
          >
            <div className="host" ref={stageHost} />
            <video ref={preview} className={recording && recorder.state.stream?.getVideoTracks().length ? 'cam-preview on' : 'cam-preview'} autoPlay muted playsInline />
            {inline && <InlineTextEditor inline={inline} setInline={setInline} finishInline={finishInline} />}
            {mode === 'edit' && doc && pickedEl && isRecording(pickedEl) && !inline && <FrameStepper stage={stage} frame={stageFrame} id={pickedEl.id} doc={doc} sceneIndex={sceneIndex} update={update} />}
            {mode === 'edit' && (
              <div className="view-tools" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                <button onClick={() => resetView()} title="Back to the scene's start view (0)">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 8a5.5 5.5 0 1 0 1.8-4.1" /><path d="M2.5 2.5v3.2h3.2" /></svg>
                  Reset view
                </button>
                <button onClick={() => resetView(true)} title="Show everything on the board (Shift+0)">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" /></svg>
                  Fit all
                </button>
              </div>
            )}
            {arrowTool && mode === 'edit' && (
              <div className="tool-hint">
                {arrowFrom ? <>Arrow from <b>{arrowFrom}</b>: now click where it goes.</> : <>Arrow: click the element it starts from.</>} <span className="muted">Esc to cancel</span>
              </div>
            )}
            {!result.ok && mode === 'edit' && <div className="frame-note">The board shows the last valid version. Fix: {result.errors[0]}</div>}
          </div>
          <Resizer orientation="horizontal" value={playbackH.value} onChange={playbackH.setValue} onReset={playbackH.reset} min={240} max={2000} />

          {mode === 'play' && (
            <PlayControls stage={stage} pos={pos} recorder={recorder} withCamera={withCamera} setWithCamera={setWithCamera} onVideo={() => setPanel('video')} modeSwitch={<ModeSwitch mode={mode} setMode={setMode} />} />
          )}

          {mode === 'edit' && doc && scene && (
            <div className="ask-row"><ModeSwitch mode={mode} setMode={setMode} /><SceneAsk presentation={text} scene={sceneIndex} title={scene.title ?? scene.id} onApply={(json, open) => { log('ai:sceneAsk', { bytes: json.length }); if (open !== undefined) openScene.current = open; history.set(json); }} /></div>
          )}
          {doc && scene && (
            <Beats
              beats={scene.beats ?? []}
              selection={selection}
              picked={picked.filter((id) => ids.includes(id))}
              timing={compiledScene?.beats.map((b) => b.actions)}
              colors={elementColors}
              types={elementTypes}
              chartData={(cid) => compiledScene?.final[cid]?.chart?.values}
              live={mode === 'play' && compiledScene ? { time: pos.time, beatStarts: compiledScene.beats.map((b) => b.start), beatEnds: compiledScene.beats.map((b) => b.end) } : undefined}
              onJump={mode === 'play' ? (b) => stage.current?.jumpToBeat(b) : undefined}
              onSelect={(s) => { setSelection(s); if (s) setPicked([]); if (s) setPanel('props'); }}
              onChange={(beats) => update(updateBeats(doc, sceneIndex, () => beats))}
            />
          )}
        </section>

        <RightPanel
          id={id} text={text} doc={doc} result={result} panel={panel} setPanel={setPanel} sceneIndex={sceneIndex}
          picked={picked} setPicked={setPicked} editable={editable} ids={ids} selection={selection} setSelection={setSelection}
          beatCount={scene?.beats?.length ?? 0} update={update} history={history} chatLog={chatLog} setChatLog={setChatLog}
          videoRefreshKey={`${recorder.state.lastTake?.id}:${madeTake}`} madeTake={madeTake}
          pinPatch={(elId, pin) => pinPatch(scene?.elements?.find((x) => x.id === elId), pin, stage.current?.camera ?? { x: 960, y: 540, zoom: 1 })}
          rename={rename} deletePicked={deletePicked} duplicate={duplicate} replaceAll={replaceAll}
          currentView={() => stage.current?.camera ?? { x: 960, y: 540, zoom: 1 }}
        />
      </div>
    </div>
  );
}
