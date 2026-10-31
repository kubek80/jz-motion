import { useEffect, useMemo, useRef, useState } from 'react';
import { compile, Stage, type StagePosition } from '../engine';
import intro from '../examples/intro.json';

const DRAFT_KEY = 'jzm.draft';
const example = JSON.stringify(intro, null, 2);
const examples = Object.entries(import.meta.glob<{ title: string }>('../examples/*.json', { eager: true, import: 'default' }))
  .map(([path, data]) => ({ name: path.split('/').pop()!.replace('.json', ''), title: data.title, text: JSON.stringify(data, null, 2) }));

function loadDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? example;
  } catch {
    return example;
  }
}

function saveDraft(text: string) {
  try {
    localStorage.setItem(DRAFT_KEY, text);
  } catch {
    // Storage can be unavailable (private mode); the draft just won't survive a reload.
  }
}

export function App() {
  const [text, setText] = useState(loadDraft);
  const [pos, setPos] = useState<StagePosition>({ scene: 0, beat: 0, time: 0, duration: 0, playing: false });
  const [editorOpen, setEditorOpen] = useState(true);
  const stageHost = useRef<HTMLDivElement>(null);
  const stageFrame = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;

  const result = useMemo(() => {
    try {
      return compile(JSON.parse(text));
    } catch (e) {
      return { ok: false as const, errors: [`JSON: ${(e as Error).message}`] };
    }
  }, [text]);

  useEffect(() => {
    const s = new Stage(stageHost.current!);
    stage.current = s;
    const off = s.onChange(setPos);
    return () => {
      off();
      s.destroy();
      stage.current = null;
    };
  }, []);

  // Reload the stage when the presentation changes, staying on the same scene and beat.
  useEffect(() => {
    if (!result.ok || !stage.current) return;
    const { scene, beat } = posRef.current;
    void stage.current.load(result.presentation, { scene, beat });
  }, [result]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('textarea, input')) return;
      const s = stage.current;
      if (!s) return;
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) s.next();
      else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) s.prev();
      else if (e.key === 'f') void togglePresent();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const togglePresent = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await stageFrame.current?.requestFullscreen();
  };

  const onEdit = (value: string) => {
    setText(value);
    saveDraft(value);
  };

  const exportJson = () => {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'presentation.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = (file: File) => {
    void file.text().then(onEdit);
  };

  const scenes = result.ok ? result.presentation.scenes : [];
  const scene = scenes[pos.scene];

  return (
    <div className="app">
      <header className="bar">
        <strong className="logo">jz-motion</strong>
        <span className="muted">{result.ok ? result.presentation.title : 'fix the errors to update the board'}</span>
        <span className="spacer" />
        <button onClick={() => void togglePresent()} title="Full screen (F). Arrows, space or a clicker to step.">Present</button>
        <button onClick={() => setEditorOpen((o) => !o)}>{editorOpen ? 'Hide JSON' : 'Show JSON'}</button>
      </header>

      <div className="main">
        <aside className="scenes">
          {scenes.map((s, i) => (
            <button key={s.id} className={i === pos.scene ? 'scene active' : 'scene'} onClick={() => stage.current?.showScene(i)}>
              <span className="num">{i + 1}</span>
              {s.title ?? s.id}
            </button>
          ))}
        </aside>

        <section className="center">
          <div className="frame" ref={stageFrame} onClick={() => stage.current?.next()}>
            <div className="host" ref={stageHost} />
          </div>

          <div className="controls">
            <button onClick={() => stage.current?.prev()} title="Previous beat (←)">◀</button>
            <button onClick={() => stage.current?.next()} title="Next beat (→ or space)">▶</button>
            <button onClick={() => (pos.playing ? stage.current?.pause() : stage.current?.playAll())}>
              {pos.playing ? 'Pause' : 'Play all'}
            </button>
            <input
              type="range"
              min={0}
              max={pos.duration || 1}
              step={0.01}
              value={pos.time}
              onChange={(e) => stage.current?.seek(Number(e.target.value))}
            />
            <span className="time">{pos.time.toFixed(1)}s / {pos.duration.toFixed(1)}s</span>
          </div>

          {scene && (
            <ol className="beats">
              <li className={pos.beat === 0 ? 'current' : ''}>
                <button onClick={() => stage.current?.jumpToBeat(0)}>start</button>
              </li>
              {scene.beats.map((b, i) => (
                <li key={i} className={pos.beat === i + 1 ? 'current' : pos.beat > i ? 'done' : ''}>
                  <button onClick={() => stage.current?.jumpToBeat(i + 1)} title={b.notes}>
                    {b.auto ? '↳ ' : ''}{b.title ?? `beat ${i + 1}`}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        {editorOpen && (
          <aside className="editor">
            <div className="editor-bar">
              <label className="file">
                Import
                <input type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
              </label>
              <button onClick={exportJson}>Export</button>
              <select
                value=""
                onChange={(e) => {
                  const ex = examples.find((x) => x.name === e.target.value);
                  if (ex && (text === ex.text || confirm(`Replace your current JSON with "${ex.title}"?`))) {
                    stage.current?.showScene(0);
                    onEdit(ex.text);
                  }
                }}
              >
                <option value="" disabled>Load example…</option>
                {examples.map((x) => <option key={x.name} value={x.name}>{x.title}</option>)}
              </select>
            </div>
            <textarea spellCheck={false} value={text} onChange={(e) => onEdit(e.target.value)} />
            {!result.ok && (
              <ul className="errors">
                {result.errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
