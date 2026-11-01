import { useState } from 'react';
import { loadProfiles, type ModelProfile } from '../ai/profiles';
import { ModelsEditor } from './ModelsEditor';
import { loadModeModels, loadTranscriber, saveModeModel, saveTranscriber, TRANSCRIBERS, type StartMode, type Transcriber } from './settingsStore';

/** Speech-to-text service settings (for presentations made from a recording). */
export function TranscriberFields({ value, onChange }: { value: Transcriber; onChange: (t: Transcriber) => void }) {
  const preset = TRANSCRIBERS.find((t) => t.baseURL === value.baseURL)?.label ?? 'Custom';
  return (
    <>
      <label className="field">
        <span>service</span>
        <select value={preset} onChange={(e) => { const t = TRANSCRIBERS.find((x) => x.label === e.target.value)!; onChange({ ...value, baseURL: t.baseURL, model: t.model || value.model }); }}>
          {TRANSCRIBERS.map((t) => <option key={t.label}>{t.label}</option>)}
        </select>
      </label>
      <label className="field"><span>base URL</span><input value={value.baseURL} onChange={(e) => onChange({ ...value, baseURL: e.target.value })} /></label>
      <label className="field"><span>model</span><input value={value.model} onChange={(e) => onChange({ ...value, model: e.target.value })} /></label>
      <label className="field"><span>API key</span><input type="password" autoComplete="off" value={value.apiKey} onChange={(e) => onChange({ ...value, apiKey: e.target.value })} /></label>
    </>
  );
}

const MODES: [StartMode, string][] = [['topic', 'From a topic'], ['script', 'From a script'], ['recording', 'From a recording']];

/** API keys and models, the transcription service, and which model each kind of start uses. */
export function Settings({ onClose }: { onClose: () => void }) {
  const [profiles, setProfiles] = useState<ModelProfile[]>(loadProfiles);
  const [transcriber, setTranscriber] = useState(loadTranscriber);
  const [modeModels, setModeModels] = useState(loadModeModels);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button onClick={onClose} title="Close">✕</button>
        </div>
        <section className="settings-section">
          <h3>Models and API keys</h3>
          <p className="muted hint">Claude Code on this computer (your Claude subscription, no key), or any OpenAI-compatible service: OpenRouter (one key for Claude, GPT, Gemini, Qwen, DeepSeek…), RunPod, or your own. Keys stay in this browser and are only sent to that service, through the local server.</p>
          <ModelsEditor onChange={setProfiles} />
        </section>
        <section className="settings-section">
          <h3>Model for each way of starting</h3>
          {MODES.map(([mode, label]) => (
            <label key={mode} className="field">
              <span>{label}</span>
              <select value={modeModels[mode] ?? ''} onChange={(e) => { saveModeModel(mode, e.target.value); setModeModels(loadModeModels()); }}>
                <option value="">(first ticked model)</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          ))}
        </section>
        <section className="settings-section">
          <h3>Transcription (for recordings)</h3>
          <p className="muted hint">Speech to text for making presentations from recordings: any OpenAI-compatible /audio/transcriptions service, such as OpenAI Whisper or Groq.</p>
          <TranscriberFields value={transcriber} onChange={(t) => { setTranscriber(t); saveTranscriber(t); }} />
        </section>
      </div>
    </div>
  );
}
