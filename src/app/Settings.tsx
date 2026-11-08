import { useEffect, useState } from 'react';
import { MyVoice } from './MyVoice';
import { loadProfiles, type ModelProfile } from '../ai/profiles';
import { rate } from '../ai/recommend';
import { ModelSelect } from './ModelSelect';
import { ModelsEditor } from './ModelsEditor';
import { loadModeModels, loadTranscriber, loadVoicer, saveModeModel, saveTranscriber, saveVoicer, TRANSCRIBERS, VOICERS, VOICES, clones, sharedKey, type StartMode, type Transcriber, type Voicer } from './settingsStore';

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
      <label className="field"><span>API key</span><input type="password" autoComplete="off" value={value.apiKey} placeholder={sharedKey(value) ? 'empty: uses the key of your model for this service (Models above)' : 'needed'} onChange={(e) => onChange({ ...value, apiKey: e.target.value })} /></label>
    </>
  );
}

/** Text-to-speech settings (for turning speaker notes into a voice-over). */
export function VoicerFields({ value, onChange }: { value: Voicer; onChange: (v: Voicer) => void }) {
  const found = VOICERS.find((v) => v.baseURL === value.baseURL && v.model === value.model);
  const preset = found?.label ?? 'Custom';
  // The voices this model takes, from OpenRouter's list; the common ones otherwise.
  const [voices, setVoices] = useState<string[]>(VOICES);
  useEffect(() => {
    if (!value.baseURL.includes('openrouter.ai') || !value.model) { setVoices(VOICES); return; }
    fetch(`/api/tts-voices?model=${encodeURIComponent(value.model)}`).then((r) => r.json()).then((list: string[]) => setVoices(list.length ? list : VOICES)).catch(() => setVoices(VOICES));
  }, [value.baseURL, value.model]);
  const s = value.sample;
  return (
    <>
      <label className="field">
        <span>service</span>
        <select value={preset} onChange={(e) => { const v = VOICERS.find((x) => x.label === e.target.value)!; onChange({ ...value, baseURL: v.baseURL, model: v.model || value.model, ...(v.voice ? { voice: v.voice } : {}) }); }}>
          {VOICERS.map((v) => <option key={v.label}>{v.label}</option>)}
        </select>
      </label>
      <label className="field"><span>base URL</span><input value={value.baseURL} onChange={(e) => onChange({ ...value, baseURL: e.target.value })} /></label>
      <label className="field"><span>model</span><input value={value.model} onChange={(e) => onChange({ ...value, model: e.target.value })} /></label>
      {clones(value) ? (
        <div className="field">
          <span>your voice</span>
          <span>
            {s ? <>{s.name ?? s.upload}, {(s.end - s.start).toFixed(0)} s <button className="small" onClick={() => onChange({ ...value, sample: undefined })}>Clear</button></>
              : <span className="note-text">Not chosen yet: record a sample in <b>🎙 My voice</b> (home screen or Timing).</span>}
          </span>
        </div>
      ) : (
        <label className="field">
          <span>voice</span>
          <input list="jzm-voice-list" value={value.voice} onChange={(e) => onChange({ ...value, voice: e.target.value })} />
          <datalist id="jzm-voice-list">{voices.map((n) => <option key={n} value={n} />)}</datalist>
        </label>
      )}
      <label className="field" title="Models that take a style (Fish Audio, Gemini, OpenAI gpt-4o-mini-tts) follow it; others ignore it">
        <span>how to speak</span>
        <input value={value.instructions ?? ''} placeholder={found?.styled ? 'e.g. calm, clear narrator; unhurried' : 'only some models use this'} onChange={(e) => onChange({ ...value, instructions: e.target.value || undefined })} />
      </label>
      <label className="field"><span>API key</span><input type="password" autoComplete="off" value={value.apiKey} onChange={(e) => onChange({ ...value, apiKey: e.target.value })} /></label>
    </>
  );
}

const MODES: [StartMode, string][] = [['topic', 'From a topic'], ['script', 'From a script'], ['recording', 'From a recording']];

/** API keys and models, the transcription service, and which model each kind of start uses. */
export function Settings({ onClose }: { onClose: () => void }) {
  const [profiles, setProfiles] = useState<ModelProfile[]>(loadProfiles);
  const [transcriber, setTranscriber] = useState(loadTranscriber);
  const [voicer, setVoicer] = useState(loadVoicer);
  const [myVoice, setMyVoice] = useState(false);
  // Changes made in My voice show here too.
  useEffect(() => {
    const changed = () => setVoicer(loadVoicer());
    window.addEventListener('jzm-voicer-changed', changed);
    return () => window.removeEventListener('jzm-voicer-changed', changed);
  }, []);
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
              <ModelSelect
                task={`from-${mode}`} profiles={profiles} value={modeModels[mode]} showAdvice
                empty={`(recommended${rate(`from-${mode}`, profiles).best ? `: ${rate(`from-${mode}`, profiles).best!.name}` : ''})`}
                onChange={(id) => { saveModeModel(mode, id); setModeModels(loadModeModels()); }}
              />
            </label>
          ))}
        </section>
        <section className="settings-section">
          <h3>Transcription (for recordings)</h3>
          <p className="muted hint">Speech to text for making presentations from recordings: any OpenAI-compatible /audio/transcriptions service, such as OpenAI Whisper or Groq.</p>
          <TranscriberFields value={transcriber} onChange={(t) => { setTranscriber(t); saveTranscriber(t); }} />
        </section>
        <section className="settings-section">
          <h3>Voice generation (for the prompter and takes)</h3>
          <p className="muted hint">Turns each sentence of a beat's speaker notes into a short clip, so the prompter can show how long each line should take, and gives new scenes a voice until you record them. Any OpenAI-compatible /audio/speech service. Through OpenRouter (one key): ElevenLabs is the most natural, Gemini follows a style, and Fish Audio or HeyGen speak in <b>your voice</b>, copied from one of your clips.</p>
          <VoicerFields value={voicer} onChange={(v) => { setVoicer(v); saveVoicer(v); }} />
          <div className="row"><button onClick={() => setMyVoice(true)} title="Your voice sample for cloning: record it, hear it, choose the model">🎙 My voice…</button></div>
          {myVoice && <MyVoice onClose={() => setMyVoice(false)} />}
        </section>
      </div>
    </div>
  );
}
