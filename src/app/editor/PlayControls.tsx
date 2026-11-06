// Under the board in play mode: step and play controls with the time slider, recording a take
// (voice and camera), and the scene's beats to jump to.
import type { CompiledScene, Stage, StagePosition } from '../../engine';
import type { useRecorder } from '../useRecorder';

interface Props {
  stage: React.RefObject<Stage | null>;
  pos: StagePosition;
  recorder: ReturnType<typeof useRecorder>;
  withCamera: boolean;
  setWithCamera: (on: boolean) => void;
  /** Opens the Video tab, where takes are exported. */
  onVideo: () => void;
  compiledScene: CompiledScene | undefined;
}

export function PlayControls({ stage, pos, recorder, withCamera, setWithCamera, onVideo, compiledScene }: Props) {
  const recording = recorder.state.status === 'recording';
  return (
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
        {recorder.state.lastTake && !recording && <span className="muted">Saved “{recorder.state.lastTake.name}”. Export it from the <button className="link" onClick={onVideo}>Video</button> tab.</span>}
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
  );
}
