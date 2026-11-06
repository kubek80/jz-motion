// The editor's top bar: back to all presentations, title, Edit/Play, undo/redo, and the buttons that
// open the Script, Timing and Settings windows or present full screen.
import { log } from '../debug';

interface Props {
  title: string | undefined;
  mode: 'edit' | 'play';
  setMode: (mode: 'edit' | 'play') => void;
  history: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean };
  /** Whether the presentation is valid (Script and Timing need it). */
  valid: boolean;
  onHome: () => void;
  onScript: () => void;
  onTiming: () => void;
  onPresent: () => void;
  onSettings: () => void;
}

export function TopBar({ title, mode, setMode, history, valid, onHome, onScript, onTiming, onPresent, onSettings }: Props) {
  return (
    <header className="bar">
      <button className="logo-button" onClick={onHome} title="All presentations"><img className="logo" src="/logo.svg" alt="jz-motion" /></button>
      <span className="muted">{title ?? 'fix the JSON to continue'}</span>
      <span className="spacer" />
      <div className="toggle">
        <button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>Edit</button>
        <button className={mode === 'play' ? 'on' : ''} onClick={() => setMode('play')}>Play</button>
      </div>
      <button onClick={() => { log('undo:button'); history.undo(); }} disabled={!history.canUndo} title="Undo (Ctrl+Z)">↶</button>
      <button onClick={() => { log('redo:button'); history.redo(); }} disabled={!history.canRedo} title="Redo (Ctrl+Shift+Z)">↷</button>
      <button onClick={onScript} disabled={!valid} title="Read and edit the whole narration beat by beat, with reading-time estimates">Script</button>
      <button onClick={onTiming} disabled={!valid} title="Time the beats to a voice-over">Timing</button>
      <button onClick={onPresent} title="Full screen (F). Arrows, space or a clicker to step.">Present</button>
      <button onClick={onSettings} title="Models, API keys, transcription">⚙</button>
    </header>
  );
}
