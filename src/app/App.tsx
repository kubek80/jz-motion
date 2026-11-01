import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compile, Stage, type StagePosition } from '../engine';
import type { Camera } from '../engine/schema';
import { AiPanel } from './AiPanel';
import { VideoPanel } from './VideoPanel';
import { useRecorder } from './useRecorder';
import { Beats } from './editor/Beats';
import {
  addElement, addScene, deleteElement, deleteScene, idsInScope, moveItem, renameElement, uniqueId,
  updateBeats, updateElement, updateScene, type Raw, type RawDoc,
} from './editor/doc';
import { Inspector } from './editor/Inspector';
import { Library, type AddRequest } from './editor/Library';
import type { Selection } from './editor/types';
import { examples } from './examples';
import { useHistory } from './useHistory';

type Mode = 'edit' | 'play';
type Panel = 'props' | 'json' | 'ai' | 'video';

interface Drag {
  pointer: number;
  startX: number;
  startY: number;
  moved: boolean;
  /** Elements being moved, with their starting positions. */
  items: { id: string; x: number; y: number }[];
  /** Pressed on the empty board: dragging pans. */
  pan: boolean;
  board: { x: number; y: number };
  camera: Camera;
  unitsPerPixel: number;
  /** Dragging a resize handle of one element, scaling it around its own position. */
  resize?: { id: string; el: Raw; origin: { x: number; y: number }; start: { x: number; y: number }; sx: number; sy: number };
}

/** Elements that resize around their position; the rest (arrows) follow what they connect. */
const RESIZABLE = new Set(['icon', 'text', 'box', 'chart', 'iso']);
/** These keep their proportions; boxes and charts stretch freely (Shift keeps proportions). */
const UNIFORM = new Set(['icon', 'text', 'iso']);

/** New size fields after scaling an element by sx × sy. */
function resized(el: Raw, sx: number, sy: number): Raw {
  const r = (v: number) => Math.max(4, Math.round(v));
  switch (el.type) {
    case 'icon': return { size: r((el.size ?? 120) * sx) };
    case 'text': return { size: r((el.size ?? 56) * sx) };
    case 'iso': return { scale: Math.round((el.scale ?? 70) * sx * 10) / 10 };
    case 'box': return { width: r(el.width * sx), height: r(el.height * sy) };
    case 'chart': return { width: r((el.width ?? 640) * sx), height: r((el.height ?? 380) * sy) };
    default: return {};
  }
}

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
  const [panel, setPanel] = useState<Panel>('props');
  const [pos, setPos] = useState<StagePosition>({ scene: 0, beat: 0, time: 0, duration: 0, playing: false });
  const [picked, setPicked] = useState<string[]>([]);
  /** Arrow tool: click the start element, then the end element. */
  const [arrowFrom, setArrowFrom] = useState<string | null | undefined>(undefined);
  const arrowTool = arrowFrom !== undefined;
  const [selection, setSelection] = useState<Selection>(null);
  const stageHost = useRef<HTMLDivElement>(null);
  const stageFrame = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const drag = useRef<Drag | null>(null);
  /** The editor's own camera per scene, so edits don't reset the view. */
  const editCams = useRef(new Map<number, Camera>());
  const posRef = useRef(pos);
  posRef.current = pos;
  const [withCamera, setWithCamera] = useState(true);
  const docRef = useRef<RawDoc | null>(null);
  const recorder = useRecorder(stage, () => JSON.parse(history.value), () => docRef.current?.title ?? 'take', id);
  const preview = useRef<HTMLVideoElement>(null);
  const recording = recorder.state.status === 'recording';
  const sceneIndex = pos.scene;

  // Save shortly after edits stop, and on the way out.
  const saved = useRef(initial);
  const latest = useRef(text);
  latest.current = text;
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

  const scene = doc?.scenes[Math.min(sceneIndex, doc.scenes.length - 1)];
  const editable = useMemo(() => new Set((scene?.elements ?? []).map((e) => e.id)), [scene]);
  const ids = useMemo(() => (doc ? [...idsInScope(doc, sceneIndex)] : []), [doc, sceneIndex]);

  const update = useCallback((next: RawDoc) => history.set(JSON.stringify(next, null, 2)), [history]);

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
    const { scene: si, beat } = posRef.current;
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

  const deletePicked = (list: string[]) => {
    if (!doc || !list.length) return;
    update(list.reduce((d, id) => deleteElement(d, sceneIndex, id), doc));
    setPicked([]);
  };

  const add = (r: AddRequest) => {
    if (!doc) return;
    const cam = stage.current?.camera ?? { x: 960, y: 540, zoom: 1 };
    const at = { x: Math.round(cam.x), y: Math.round(cam.y) };
    let el: Raw;
    switch (r.kind) {
      case 'icon':
        el = { id: uniqueId(doc, sceneIndex, r.name), type: 'icon', icon: r.name, ...at, size: 140, color: 'cyan', label: r.name };
        break;
      case 'iso':
        el = { id: uniqueId(doc, sceneIndex, r.name), type: 'iso', model: r.name, ...at, scale: 80, color: 'cyan' };
        break;
      case 'text':
        el = { id: uniqueId(doc, sceneIndex, 'text'), type: 'text', text: 'new text', ...at, size: 56 };
        break;
      case 'box':
        el = { id: uniqueId(doc, sceneIndex, 'box'), type: 'box', ...at, width: 280, height: 150, color: 'green', label: 'box' };
        break;
      case 'chart':
        el = {
          id: uniqueId(doc, sceneIndex, 'chart'), type: 'chart', kind: 'bar', ...at, width: 640, height: 380, color: 'cyan',
          data: [{ label: 'A', value: 3 }, { label: 'B', value: 5 }, { label: 'C', value: 2 }],
        };
        break;
      case 'arrow':
        if (picked.length !== 2) {
          // Start the arrow tool; a single selected element is where the arrow starts.
          setArrowFrom(picked.length === 1 ? picked[0] : null);
          return;
        }
        el = { id: uniqueId(doc, sceneIndex, `${picked[0]}-${picked[1]}`), type: 'arrow', from: picked[0], to: picked[1] };
        break;
    }
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

  // ---------------------------------------------------------------- board pointer handling (edit mode)

  const connect = (from: string, to: string) => {
    if (!doc) return;
    const el = { id: uniqueId(doc, sceneIndex, `${from}-${to}`), type: 'arrow', from, to };
    update(addElement(doc, sceneIndex, el));
    setPicked([el.id]);
    setArrowFrom(undefined);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const s = stage.current;
    if (mode !== 'edit' || !s || !doc) return;
    const board = s.boardPoint(e.clientX, e.clientY);
    const hit = s.elementAt(board, new Set(ids));
    if (arrowTool) {
      if (!hit) setArrowFrom(null);
      else if (!arrowFrom) { setArrowFrom(hit); setPicked([hit]); }
      else if (hit !== arrowFrom) connect(arrowFrom, hit);
      return;
    }
    const corner = canResize ? s.handleAt(board) : undefined;
    if (corner && pickedEl) {
      drag.current = {
        pointer: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, items: [], pan: false,
        board, camera: s.camera, unitsPerPixel: s.unitsPerPixel,
        resize: { id: pickedEl.id, el: pickedEl, origin: { x: pickedEl.x, y: pickedEl.y }, start: board, sx: 1, sy: 1 },
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    let nextPicked = picked;
    if (hit) {
      if (e.shiftKey) nextPicked = picked.includes(hit) ? picked.filter((i) => i !== hit) : [...picked, hit];
      else if (!picked.includes(hit)) nextPicked = [hit];
      setPicked(nextPicked);
      setSelection(null);
    }
    const movable = hit && !e.shiftKey
      ? nextPicked.flatMap((id) => {
          const el = scene?.elements?.find((x) => x.id === id);
          return el && typeof el.x === 'number' ? [{ id, x: el.x as number, y: el.y as number }] : [];
        })
      : [];
    drag.current = {
      pointer: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, items: movable, pan: !hit,
      board, camera: s.camera, unitsPerPixel: s.unitsPerPixel,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const s = stage.current;
    if (s && !d && mode === 'edit') {
      // Hover feedback: resize cursors over handles, a crosshair while connecting.
      const corner = canResize ? s.handleAt(s.boardPoint(e.clientX, e.clientY)) : undefined;
      (e.currentTarget as HTMLElement).style.cursor = arrowTool ? 'cell' : corner ? (corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize') : '';
    }
    if (!d || !s || d.pointer !== e.pointerId) return;
    if (d.resize) {
      const r = d.resize;
      const p = s.boardPoint(e.clientX, e.clientY);
      const o = r.origin;
      const ratio = (a: number, b: number) => Math.max(0.1, Math.abs(a) / Math.max(Math.abs(b), 1));
      if (UNIFORM.has(r.el.type) || e.shiftKey) {
        r.sx = r.sy = ratio(Math.hypot(p.x - o.x, p.y - o.y), Math.hypot(r.start.x - o.x, r.start.y - o.y));
      } else {
        r.sx = ratio(p.x - o.x, r.start.x - o.x);
        r.sy = ratio(p.y - o.y, r.start.y - o.y);
      }
      d.moved = true;
      s.previewScale(r.id, r.sx, r.sy);
      s.setSelection(picked, [], { handles: true });
      return;
    }
    const dx = (e.clientX - d.startX) * d.unitsPerPixel;
    const dy = (e.clientY - d.startY) * d.unitsPerPixel;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return;
    d.moved = true;
    if (d.items.length) {
      for (const it of d.items) s.previewMove(it.id, it.x + dx, it.y + dy);
      s.setSelection(picked, [], { handles: canResize });
    } else if (d.pan) {
      s.camera = { ...d.camera, x: d.camera.x - dx, y: d.camera.y - dy };
      editCams.current.set(sceneIndex, s.camera);
      s.setSelection(picked, [], { handles: canResize });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !doc) return;
    if (d.resize) {
      if (d.moved) update(updateElement(doc, sceneIndex, d.resize.id, resized(d.resize.el, d.resize.sx, d.resize.sy)));
      return;
    }
    if (!d.moved) {
      if (d.pan) { setPicked([]); setSelection(null); }
      return;
    }
    if (d.items.length) {
      const dx = Math.round((e.clientX - d.startX) * d.unitsPerPixel);
      const dy = Math.round((e.clientY - d.startY) * d.unitsPerPixel);
      update(d.items.reduce((acc, it) => updateElement(acc, sceneIndex, it.id, { x: it.x + dx, y: it.y + dy }), doc));
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const s = stage.current;
    if (mode !== 'edit' || !s) return;
    const p = s.boardPoint(e.clientX, e.clientY);
    const cam = s.camera;
    const zoom = Math.min(6, Math.max(0.1, cam.zoom * Math.exp(-e.deltaY * 0.0015)));
    // Keep the point under the cursor in place.
    s.camera = { zoom, x: p.x - (p.x - cam.x) * (cam.zoom / zoom), y: p.y - (p.y - cam.y) * (cam.zoom / zoom) };
    editCams.current.set(sceneIndex, s.camera);
    s.setSelection(picked, [], { handles: canResize });
  };

  // ---------------------------------------------------------------- keyboard

  const keyState = useRef({ mode, picked, deletePicked, history, duplicate });
  keyState.current = { mode, picked, deletePicked, history, duplicate };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keyState.current;
      const typing = (e.target as HTMLElement).closest('textarea, input, select');
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !typing) {
        if (e.shiftKey) k.history.redo();
        else k.history.undo();
      } else if (mod && e.key.toLowerCase() === 'y' && !typing) {
        k.history.redo();
      } else if (typing) {
        return;
      } else if (k.mode === 'edit') {
        if (e.key === 'Delete' || e.key === 'Backspace') k.deletePicked(k.picked);
        else if (e.key === 'Escape') { setPicked([]); setSelection(null); setArrowFrom(undefined); }
        else if (mod && e.key.toLowerCase() === 'd' && k.picked.length === 1) k.duplicate(k.picked[0]);
        else return;
      } else {
        const s = stage.current;
        if (!s) return;
        if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) s.next();
        else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) s.prev();
        else if (e.key === 'f') void togglePresent();
        else return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const togglePresent = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else {
      setMode('play');
      await stageFrame.current?.requestFullscreen();
    }
  };

  // ---------------------------------------------------------------- files

  const exportJson = () => {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'presentation.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const replaceAll = (value: string) => {
    editCams.current.clear();
    setPicked([]);
    setSelection(null);
    stage.current?.showScene(0);
    history.set(value);
  };

  // ---------------------------------------------------------------- render

  const compiledScene = result.ok ? result.presentation.scenes[sceneIndex] : undefined;

  return (
    <div className={`app mode-${mode}`}>
      <header className="bar">
        <button className="logo-button" onClick={onHome} title="All presentations"><img className="logo" src="/logo.svg" alt="jz-motion" /></button>
        <span className="muted">{doc?.title ?? 'fix the JSON to continue'}</span>
        <span className="spacer" />
        <div className="toggle">
          <button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>Edit</button>
          <button className={mode === 'play' ? 'on' : ''} onClick={() => setMode('play')}>Play</button>
        </div>
        <button onClick={history.undo} disabled={!history.canUndo} title="Undo (Ctrl+Z)">↶</button>
        <button onClick={history.redo} disabled={!history.canRedo} title="Redo (Ctrl+Shift+Z)">↷</button>
        <button onClick={() => void togglePresent()} title="Full screen (F). Arrows, space or a clicker to step.">Present</button>
      </header>

      <div className="main">
        <aside className="left">
          <div className="scenes">
            {(doc?.scenes ?? []).map((s, i) => (
              <div key={i} className={i === sceneIndex ? 'scene active' : 'scene'} onClick={() => goToScene(i)}>
                <span className="num">{i + 1}</span>
                <span className="scene-title">{s.title ?? s.id}{s.inherit ? ' ↲' : ''}</span>
                {mode === 'edit' && doc && (
                  <span className="tools" onClick={(e) => e.stopPropagation()}>
                    <button title="Move up" onClick={() => update({ ...doc, scenes: moveItem(doc.scenes, i, i - 1) })}>↑</button>
                    <button title="Delete scene" disabled={doc.scenes.length < 2} onClick={() => confirm(`Delete scene "${s.title ?? s.id}"?`) && update(deleteScene(doc, i))}>✕</button>
                  </span>
                )}
              </div>
            ))}
            {mode === 'edit' && doc && <button className="add-scene" onClick={() => update(addScene(doc, sceneIndex))}>+ scene</button>}
          </div>
          {mode === 'edit' && doc && <Library onAdd={add} arrowActive={arrowTool} />}
        </aside>

        <section className="center">
          <div
            className="frame"
            ref={stageFrame}
            onClick={() => mode === 'play' && stage.current?.next()}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onWheel={onWheel}
          >
            <div className="host" ref={stageHost} />
            <video ref={preview} className={recording && recorder.state.stream?.getVideoTracks().length ? 'cam-preview on' : 'cam-preview'} autoPlay muted playsInline />
            {arrowTool && mode === 'edit' && (
              <div className="tool-hint">
                {arrowFrom ? <>Arrow from <b>{arrowFrom}</b>: now click where it goes.</> : <>Arrow: click the element it starts from.</>} <span className="muted">Esc to cancel</span>
              </div>
            )}
            {!result.ok && mode === 'edit' && <div className="frame-note">The board shows the last valid version. Fix: {result.errors[0]}</div>}
          </div>

          {mode === 'play' && (
            <>
              <div className="controls">
                <button onClick={() => stage.current?.prev()} title="Previous beat (←)">◀</button>
                <button onClick={() => stage.current?.next()} title="Next beat (→ or space)">▶</button>
                <button onClick={() => (pos.playing ? stage.current?.pause() : stage.current?.playAll())}>{pos.playing ? 'Pause' : 'Play all'}</button>
                <input type="range" min={0} max={pos.duration || 1} step={0.01} value={pos.time} onChange={(e) => stage.current?.seek(Number(e.target.value))} />
                <span className="time">{pos.time.toFixed(1)}s / {pos.duration.toFixed(1)}s</span>
              </div>
              <div className="controls record">
                {recording ? (
                  <button className="rec on" onClick={() => void recorder.stop()}>■ Stop recording · {Math.floor(recorder.state.seconds / 60)}:{String(Math.floor(recorder.state.seconds % 60)).padStart(2, '0')}</button>
                ) : (
                  <>
                    <button className="rec" disabled={recorder.state.status !== 'idle'} onClick={() => void recorder.start(withCamera)} title="Records your voice (and camera) and when you click; export the take from the Video tab">
                      {recorder.state.status === 'saving' ? 'Saving…' : recorder.state.status === 'starting' ? 'Starting…' : '● Record'}
                    </button>
                    <label className="check"><input type="checkbox" checked={withCamera} onChange={(e) => setWithCamera(e.target.checked)} /> camera</label>
                  </>
                )}
                {recorder.state.lastTake && !recording && <span className="muted">Saved “{recorder.state.lastTake.name}”. Export it from the <button className="link" onClick={() => setPanel('video')}>Video</button> tab.</span>}
                {recorder.state.error && <span className="error-text">{recorder.state.error}</span>}
              </div>
              {compiledScene && (
                <ol className="beats">
                  <li className={pos.beat === 0 ? 'current' : ''}><button onClick={() => stage.current?.jumpToBeat(0)}>start</button></li>
                  {compiledScene.beats.map((b, i) => (
                    <li key={i} className={pos.beat === i + 1 ? 'current' : pos.beat > i ? 'done' : ''}>
                      <button onClick={() => stage.current?.jumpToBeat(i + 1)} title={b.notes}>{b.auto ? '↳ ' : ''}{b.title ?? `beat ${i + 1}`}</button>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}

          {mode === 'edit' && doc && scene && (
            <Beats
              beats={scene.beats ?? []}
              selection={selection}
              picked={picked.filter((id) => ids.includes(id))}
              onSelect={(s) => { setSelection(s); if (s) setPicked([]); }}
              onChange={(beats) => update(updateBeats(doc, sceneIndex, () => beats))}
            />
          )}
        </section>

        <aside className="right">
          <div className="tabs">
            <button className={panel === 'props' ? 'on' : ''} onClick={() => setPanel('props')} disabled={mode !== 'edit'}>Properties</button>
            <button className={panel === 'json' || (mode !== 'edit' && panel === 'props') ? 'on' : ''} onClick={() => setPanel('json')}>JSON</button>
            <button className={panel === 'ai' ? 'on' : ''} onClick={() => setPanel('ai')}>AI</button>
            <button className={panel === 'video' ? 'on' : ''} onClick={() => setPanel('video')}>Video</button>
          </div>
          {panel === 'ai' ? (
            <AiPanel current={text} onUse={replaceAll} />
          ) : panel === 'video' ? (
            <VideoPanel presentation={text} presentationId={id} refreshKey={recorder.state.lastTake?.id} />
          ) : mode === 'edit' && panel === 'props' && doc ? (
            <Inspector
              doc={doc}
              scene={sceneIndex}
              picked={picked}
              editable={editable}
              ids={ids}
              selection={selection}
              onElement={(id, k, v) => update(updateElement(doc, sceneIndex, id, { [k]: v }))}
              onRename={rename}
              onDelete={deletePicked}
              onDuplicate={duplicate}
              onAction={(bi, ai, next) => update(updateBeats(doc, sceneIndex, (beats) => beats.map((b, i) => (i === bi ? { ...b, actions: b.actions.map((a, j) => (j === ai ? next : a)) } : b))))}
              onBeat={(bi, k, v) => update(updateBeats(doc, sceneIndex, (beats) => beats.map((b, i) => {
                if (i !== bi) return b;
                const next: Raw = { ...b, [k]: v };
                if (v === undefined) delete next[k];
                return next as typeof b;
              })))}
              onScene={(k, v) => update(updateScene(doc, sceneIndex, { [k]: v }))}
              onTitle={(title) => update({ ...doc, title })}
            />
          ) : (
            <div className="json-panel">
              <div className="editor-bar">
                <label className="file">
                  Import
                  <input type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && void e.target.files[0].text().then(replaceAll)} />
                </label>
                <button onClick={exportJson}>Export</button>
                <select
                  value=""
                  onChange={(e) => {
                    const ex = examples.find((x) => x.name === e.target.value);
                    if (ex && (text === ex.text || confirm(`Replace your current presentation with "${ex.title}"? (Undo brings it back.)`))) replaceAll(ex.text);
                  }}
                >
                  <option value="" disabled>Load example…</option>
                  {examples.map((x) => <option key={x.name} value={x.name}>{x.title}</option>)}
                </select>
              </div>
              <textarea spellCheck={false} value={text} onChange={(e) => history.set(e.target.value, { merge: true })} />
            </div>
          )}
          {!result.ok && (
            <ul className="errors">
              {result.errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
