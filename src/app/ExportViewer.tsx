import { useEffect, useMemo, useRef, useState } from 'react';
import { compile } from '../engine/compile';
import { cuePerformance, type Performance } from '../video/performance';
import { clock, frameOf, notesText, timeOfFrame, whereAt, type FrameNote, type Outline } from './exportFrames';

// An exported video, frame by frame (the Video tab): step one frame or a second at a time, see which scene and beat
// each frame shows, write notes on frames (kept next to the video: exports/<file>.notes.json) and copy them as text
// to share, or save the frame as a picture.

interface Props { file: string; fps: number; duration: number; presentation: string; onClose: () => void }

export function ExportViewer({ file, fps, duration, presentation, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const noteBox = useRef<HTMLTextAreaElement>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [timing, setTiming] = useState<{ perf: Performance; outline?: Outline; exact: boolean } | null>(null);
  const [notes, setNotes] = useState<FrameNote[]>([]);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const total = Math.max(1, Math.round(duration * fps));
  const t = timeOfFrame(frame, fps) - 0.5 / fps;

  const compiled = useMemo(() => { try { const r = compile(JSON.parse(presentation)); return r.ok ? r.presentation : null; } catch { return null; } }, [presentation]);
  useEffect(() => {
    void fetch(`/api/exports/${file}/timing`).then(async (r) => {
      if (r.ok) { const j = await r.json(); setTiming({ perf: j.performance, outline: j.outline, exact: true }); }
      // Made before exports kept their timing: the presentation's timing now (right while it hasn't changed since).
      else if (compiled) setTiming({ perf: cuePerformance(compiled, duration), exact: false });
    });
    void fetch(`/api/exports/${file}/notes`).then((r) => r.json()).then(setNotes).catch(() => undefined);
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps
  // The scenes as exported (kept with the video), or the presentation as it is now for older exports.
  const outline = timing?.outline ?? compiled;
  const where = outline && timing ? whereAt(outline, timing.perf, t) : null;

  const go = (f: number) => {
    const v = video.current;
    if (!v) return;
    if (!v.paused) v.pause();
    const next = Math.min(total - 1, Math.max(0, Math.round(f)));
    setFrame(next);
    v.currentTime = timeOfFrame(next, fps);
  };
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play(); else go(frameOf(v.currentTime, fps));
  };
  // While playing, the frame number follows the frames actually shown.
  useEffect(() => {
    const v = video.current;
    if (!v || !playing) return;
    let id = 0;
    const tick = (_: number, m: { mediaTime: number }) => { setFrame(frameOf(m.mediaTime, fps)); id = v.requestVideoFrameCallback(tick); };
    if (typeof v.requestVideoFrameCallback === 'function') id = v.requestVideoFrameCallback(tick);
    return () => v.cancelVideoFrameCallback?.(id);
  }, [playing, fps]);

  const save = (next: FrameNote[]) => {
    setNotes(next);
    void fetch(`/api/exports/${file}/notes`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) });
  };
  const addNote = () => {
    if (!draft.trim()) return;
    save([...notes, { frame, t: Math.round(t * 1000) / 1000, scene: where ? `scene ${where.scene + 1} “${where.sceneTitle}”` : undefined, beat: where ? `beat ${where.beat + 1} “${where.beatTitle}”` : undefined, text: draft.trim() }].sort((a, b) => a.frame - b.frame));
    setDraft('');
  };
  const copy = async () => {
    await navigator.clipboard.writeText(notesText(file, fps, notes)).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const saveFrame = () => {
    const v = video.current;
    if (!v) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    c.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `${file.replace(/\.mp4$/, '')}-frame-${frame}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, 'image/png');
  };

  // Keys: ←/→ a frame (Shift: a second), Space play, Home/End, N a note, Esc close. Not while typing a note.
  const keys = useRef({ go, toggle, frame, onClose, total });
  keys.current = { go, toggle, frame, onClose, total };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      // Typing a note: keys are for the note. The frame number box still steps with ←/→.
      if ((e.target as HTMLElement).closest('textarea, input:not([type=number])')) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === 'ArrowRight') k.go(k.frame + (e.shiftKey ? fps : 1));
      else if (e.key === 'ArrowLeft') k.go(k.frame - (e.shiftKey ? fps : 1));
      else if (e.key === ' ') k.toggle();
      else if (e.key === 'Home') k.go(0);
      else if (e.key === 'End') k.go(k.total - 1);
      else if (e.key.toLowerCase() === 'n') noteBox.current?.focus();
      else if (e.key === 'Escape') k.onClose();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [fps]);

  return (
    <div className="modal-back export-viewer-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide export-viewer">
        <div className="modal-head">
          <h2>{file}</h2>
          <span className="muted">{fps} fps · {total} frames · {clock(duration)}</span>
          <span className="spacer" />
          <button onClick={onClose} title="Close (Esc)">✕</button>
        </div>
        <div className="export-viewer-body">
          <div className="export-viewer-main">
            <video ref={video} src={`/exports/${file}`} preload="auto" onClick={toggle} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
            <input className="export-viewer-scrub" type="range" min={0} max={total - 1} value={frame} onChange={(e) => go(Number(e.target.value))} aria-label="Frame" />
            <div className="row wrap export-viewer-controls">
              <button onClick={() => go(0)} title="First frame (Home)">⏮</button>
              <button onClick={() => go(frame - fps)} title="A second back (Shift+←)">−1 s</button>
              <button onClick={() => go(frame - 1)} title="A frame back (←)">◀ frame</button>
              <button className="primary" onClick={toggle} title="Play / pause (Space)">{playing ? '❚❚' : '▶'}</button>
              <button onClick={() => go(frame + 1)} title="A frame on (→)">frame ▶</button>
              <button onClick={() => go(frame + fps)} title="A second on (Shift+→)">+1 s</button>
              <span className="export-viewer-at"><b>{clock(t)}</b> · frame <input type="number" min={0} max={total - 1} value={frame} onChange={(e) => go(Number(e.target.value))} /> / {total - 1}</span>
              <span className="spacer" />
              <button onClick={saveFrame} title="This frame as a PNG picture, to attach to a message">⬇ Save this frame</button>
            </div>
            <p className="export-viewer-where">
              {where ? <>Scene {where.scene + 1} <b>{where.sceneTitle}</b> › beat {where.beat + 1} <b>{where.beatTitle}</b></> : <span className="muted">Which scene: unknown (the presentation doesn't compile)</span>}
              {timing && !timing.exact && <span className="muted"> · from the presentation's timing now (this export was made before videos kept their own; right if the timing hasn't changed since)</span>}
            </p>
          </div>
          <aside className="export-viewer-notes">
            <h4>Notes on frames</h4>
            <textarea ref={noteBox} rows={3} value={draft} placeholder={`What you see at frame ${frame} (N to write here, Ctrl+Enter to add)`} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addNote(); } }} />
            <button onClick={addNote} disabled={!draft.trim()}>＋ Add a note at frame {frame}</button>
            <ol>
              {notes.map((n, i) => (
                <li key={`${n.frame}-${i}`} className={n.frame === frame ? 'here' : ''}>
                  <button className="link" onClick={() => go(n.frame)} title="Go to this frame">{clock(n.t)} · frame {n.frame}</button>
                  <span className="muted">{n.scene}{n.beat ? ` › ${n.beat}` : ''}</span>
                  <span>{n.text}</span>
                  <button className="small" onClick={() => save(notes.filter((_, j) => j !== i))} title="Remove this note">✕</button>
                </li>
              ))}
            </ol>
            <button className="primary" onClick={() => void copy()} disabled={!notes.length} title="Every note with its time, frame, scene and beat, as text to paste into a message">{copied ? 'Copied ✓' : '📋 Copy notes'}</button>
            <p className="muted hint">Kept next to the video: <code>exports/{file}.notes.json</code></p>
          </aside>
        </div>
      </div>
    </div>
  );
}
