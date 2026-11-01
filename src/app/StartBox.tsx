import { useState } from 'react';
import { loadProfiles } from '../ai/profiles';
import { loadModeModels, saveModeModel, type StartMode } from './settingsStore';

const MODES: { mode: StartMode; label: string; placeholder: string }[] = [
  { mode: 'topic', label: 'Topic', placeholder: 'What do you want to explain? e.g. "How RAG works: embed the question, search a vector DB, answer with the documents"' },
  { mode: 'script', label: 'Script', placeholder: 'Paste your script. Each idea becomes a beat, your lines become speaker notes.' },
  { mode: 'recording', label: 'Recording', placeholder: 'Attach a recording below; add anything the presentation should focus on (optional).' },
];

export interface Start { mode: StartMode; text: string; file?: File; modelId?: string }

/** The home screen's prompt box: pick how to start, the model for it, type or attach, send. */
export function StartBox({ onStart, onSettings, canRecord }: { onStart: (s: Start) => void; onSettings: () => void; canRecord: boolean }) {
  const [mode, setMode] = useState<StartMode>('topic');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const profiles = loadProfiles();
  const [chosen, setChosen] = useState(loadModeModels);
  const modelId = chosen[mode] && profiles.some((p) => p.id === chosen[mode]) ? chosen[mode] : profiles.find((p) => p.enabled)?.id ?? profiles[0]?.id;
  const info = MODES.find((m) => m.mode === mode)!;
  const ready = !!modelId && (mode === 'recording' ? !!file : !!text.trim());

  const send = () => ready && onStart({ mode, text: text.trim(), file: file ?? undefined, modelId });

  return (
    <div className="start-box">
      <textarea
        rows={mode === 'script' ? 6 : 3}
        value={text}
        placeholder={info.placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && mode !== 'script') {
            e.preventDefault();
            send();
          }
        }}
      />
      {mode === 'recording' && (
        <label className={file ? 'attach has' : 'attach'}>
          {file ? `🎞 ${file.name} (${(file.size / 1e6).toFixed(1)} MB)` : '+ Attach a recording (video or audio)'}
          <input type="file" accept="video/*,audio/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      )}
      <div className="start-row">
        <div className="mode-chips">
          {MODES.map((m) => (
            <button
              key={m.mode}
              className={mode === m.mode ? 'chip on' : 'chip'}
              disabled={m.mode === 'recording' && !canRecord}
              title={m.mode === 'recording' && !canRecord ? 'Needs the local server (npm run dev)' : undefined}
              onClick={() => setMode(m.mode)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="spacer" />
        {profiles.length ? (
          <select
            className="model-pick"
            value={modelId}
            title="Model for this kind of start (remembered)"
            onChange={(e) => { saveModeModel(mode, e.target.value); setChosen(loadModeModels()); }}
          >
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (
          <button className="link" onClick={onSettings}>Add a model in Settings</button>
        )}
        <button className="send" disabled={!ready} onClick={send} title="Send">↑</button>
      </div>
    </div>
  );
}
