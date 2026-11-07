// Under the board in play mode: step and play controls with the time slider, recording a take
// (voice and camera). The scene's beats are in the storyboard below, which lights up as they play.
import type { Stage, StagePosition } from '../../engine';
import type { useRecorder } from '../useRecorder';

interface Props {
  stage: React.RefObject<Stage | null>;
  pos: StagePosition;
  recorder: ReturnType<typeof useRecorder>;
  withCamera: boolean;
  setWithCamera: (on: boolean) => void;
  /** Opens the Video tab, where takes are exported. */
  onVideo: () => void;
  /** Edit / Play, at the start of the controls. */
  modeSwitch?: React.ReactNode;
}

export function PlayControls({ stage, pos, recorder, withCamera, setWithCamera, onVideo, modeSwitch }: Props) {
  const recording = recorder.state.status === 'recording';
  return (
    <>
      <div className="controls">
        {modeSwitch}
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
    </>
  );
}
