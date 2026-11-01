import { useState } from 'react';
import { assistantMessages, checkAssistant } from '../../ai/assistant';
import { askJson } from '../../ai/client';
import { loadProfiles } from '../../ai/profiles';

const KEY = 'jzm.sceneModel';

/** One-line requests to a model about the scene being edited: its elements, beats and timing. */
export function SceneAsk({ presentation, scene, title, onApply }: { presentation: string; scene: number; title: string; onApply: (json: string) => void }) {
  const profiles = loadProfiles();
  const [modelId, setModelId] = useState(() => {
    try {
      return localStorage.getItem(KEY) ?? '';
    } catch {
      return '';
    }
  });
  const profile = profiles.find((p) => p.id === modelId) ?? profiles.find((p) => p.enabled) ?? profiles[0];
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const ask = async () => {
    if (!profile || !text.trim()) return;
    setBusy(true);
    setResult(null);
    const request = `Change only scene ${scene + 1} ("${title}"): its elements, beats and timing. Keep every other scene exactly as it is.\n\n${text.trim()}`;
    const r = await askJson(profile, assistantMessages([], request, presentation, scene), checkAssistant);
    setBusy(false);
    if (r.ok && r.value) {
      if (r.value.presentation) onApply(JSON.stringify(r.value.presentation, null, 2));
      setResult({ ok: true, message: `${r.value.reply}${r.value.presentation ? '  (Ctrl+Z undoes it)' : ''}` });
      setText('');
    } else {
      setResult({ ok: false, message: r.errors[0] ?? 'That did not work.' });
    }
  };

  return (
    <div className="scene-ask">
      <span className="spark">✦</span>
      <input
        value={text}
        disabled={busy}
        placeholder={profile ? `Ask AI to change this scene, e.g. "split the second beat in two", "zoom into the database before the flow"` : 'Add a model in the AI tab to ask for changes'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void ask(); e.stopPropagation(); }}
      />
      {profiles.length > 1 && (
        <select value={profile?.id} onChange={(e) => { setModelId(e.target.value); try { localStorage.setItem(KEY, e.target.value); } catch { /* ignore */ } }}>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      <button className="primary" disabled={!profile || !text.trim() || busy} onClick={() => void ask()}>{busy ? 'Working…' : 'Ask'}</button>
      {result && <span className={result.ok ? 'scene-ask-result' : 'scene-ask-result error-text'}>{result.message}</span>}
    </div>
  );
}
