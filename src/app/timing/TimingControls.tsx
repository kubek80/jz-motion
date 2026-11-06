// The control bar under the board: record narration, prompter toggle, play/pause and clock, tap
// mode, split, and the timeline zoom.
import type { Click } from '../../video/performance';
import { fmt } from './format';

interface Props {
  recording: boolean;
  busy: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  prompter: boolean;
  setPrompter: (on: boolean) => void;
  playing: boolean;
  play: () => void;
  pause: () => void;
  time: number;
  total: number;
  clicks: Click[];
  tapping: boolean;
  setTapping: (on: boolean) => void;
  tapIndex: number;
  setTapIndex: (i: number) => void;
  nextAfter: (t: number) => number;
  now: () => number;
  tap: () => void;
  beatTitle: (c: Click) => string | undefined;
  splitAtPlayhead: () => void;
  hasClips: boolean;
  pps: number;
  setPps: (pps: number) => void;
}

export function TimingControls(p: Props) {
  const { recording, busy, startRecording, stopRecording, prompter, setPrompter, playing, play, pause, time, total, clicks, tapping, setTapping, tapIndex, setTapIndex, nextAfter, now, tap, splitAtPlayhead, pps, setPps } = p;
  return (
    <div className="timing-controls">
      {recording ? (
        <button className="rec-btn on" onClick={() => void stopRecording()}>■ Stop recording</button>
      ) : (
        <button className="rec-btn" disabled={!!busy} onClick={() => void startRecording()} title="Record narration from the playhead onward: a new clip is added at the current timeline position (lane 0 if free, else lane 1). → places each beat's cue, Space holds the prompter still, Esc stops.">● Record narration</button>
      )}
      <button className={prompter ? 'on' : ''} onClick={() => setPrompter(!prompter)} title="Show the script large, as a teleprompter">Prompter</button>
      <button className="play" disabled={recording} onClick={() => (playing ? pause() : play())} title="Play / pause (Space)">{playing ? '❚❚' : '▶'}</button>
      <span className="clock">{fmt(time)} / {fmt(total)}</span>
      <button
        className={tapping ? 'tap on' : 'tap'}
        onClick={() => { setTapping(!tapping); setTapIndex(nextAfter(now())); }}
        title="Tap mode: play, and press T as each line starts; each tap places the next click"
      >
        Tap to place {tapping && clicks[tapIndex] ? `· next: ${p.beatTitle(clicks[tapIndex]) ?? `beat ${clicks[tapIndex].beat + 1}`}` : ''}
      </button>
      {tapping && <button className="primary tap-now" onClick={tap} disabled={!clicks[tapIndex]}>T · place it now</button>}
      <button onClick={splitAtPlayhead} disabled={!p.hasClips || recording} title="Split any clip under the playhead into two adjacent clips (S)">✂ Split</button>
      <span className="spacer" />
      <span className="muted hint">Drag a click to move it · double-click to let it follow the one before · ←/→ seek</span>
      <label className="zoom" title="Zoom the timeline">
        <span className="muted">zoom</span>
        <input type="range" min={4} max={200} step={1} value={pps || 20} onChange={(e) => setPps(Number(e.target.value))} />
      </label>
    </div>
  );
}
