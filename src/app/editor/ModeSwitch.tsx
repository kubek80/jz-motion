// Edit / Play, just above the beats (beside the AI bar in Edit mode, the play controls in Play mode).
// P toggles between them from the keyboard (see useEditorKeys).

export function ModeSwitch({ mode, setMode }: { mode: 'edit' | 'play'; setMode: (m: 'edit' | 'play') => void }) {
  return (
    <div className="toggle mode-switch" role="radiogroup" aria-label="Mode">
      <button role="radio" aria-checked={mode === 'edit'} className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')} title="Edit the board and the beats (P switches)">Edit</button>
      <button role="radio" aria-checked={mode === 'play'} className={mode === 'play' ? 'on' : ''} onClick={() => setMode('play')} title="Play it like a presentation (P switches; Esc goes back to Edit)">Play</button>
    </div>
  );
}
