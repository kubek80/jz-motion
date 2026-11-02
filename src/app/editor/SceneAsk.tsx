import { useRef, useState } from 'react';
import { assistantMessages, checkAssistant } from '../../ai/assistant';
import { askJson, checkPresentation } from '../../ai/client';
import { agentPrompt, isAgent, runAgent } from '../../ai/agent';
import { Activity, agentStep, type ActivityStep, type AgentSession } from '../Activity';
import { loadProfiles } from '../../ai/profiles';
import { pickFor, rememberedFor, rememberFor } from '../../ai/recommend';
import { ModelSelect } from '../ModelSelect';


/** One-line requests to a model about the scene being edited: its elements, beats and timing. */
export function SceneAsk({ presentation, scene, title, onApply }: { presentation: string; scene: number; title: string; onApply: (json: string) => void }) {
  const profiles = loadProfiles();
  const [modelId, setModelId] = useState(() => rememberedFor('scene-edit'));
  const profile = pickFor('scene-edit', profiles, modelId);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; steps: ActivityStep[]; session?: AgentSession } | null>(null);
  const [live, setLive] = useState<ActivityStep[]>([]);
  const draftId = useRef(`scene-${Math.random().toString(36).slice(2, 10)}`);

  const ask = async () => {
    if (!profile || !text.trim()) return;
    setBusy(true);
    setResult(null);
    setLive([]);
    const steps: ActivityStep[] = [];
    const add = (st: ActivityStep) => { steps.push(st); setLive([...steps]); };
    const request = `Change only scene ${scene + 1} ("${title}"): its elements, beats and timing. Keep every other scene exactly as it is.\n\n${text.trim()}`;

    if (isAgent(profile)) {
      let session: AgentSession | undefined;
      try {
        const done = await runAgent(profile, {
          prompt: agentPrompt({ file: `presentations/.drafts/${draftId.current}.json`, request, existing: true, followUp: false, scene }),
          draftId: draftId.current, draft: presentation,
        }, (ev) => {
          if (ev.e === 'start') session = { id: ev.session, cwd: ev.cwd };
          const st = agentStep(ev);
          if (st) add(st);
        });
        const value = done.changed && done.presentation ? JSON.parse(done.presentation) : null;
        const check = value ? checkPresentation(value) : null;
        if (check && !check.ok) setResult({ ok: false, message: `The changed presentation doesn't load: ${check.errors[0]}`, steps, session });
        else {
          if (value) onApply(JSON.stringify(value, null, 2));
          setResult({ ok: true, message: `${done.reply}${value ? '  (Ctrl+Z undoes it)' : ''}`, steps, session });
          setText('');
        }
      } catch (e) {
        setResult({ ok: false, message: (e as Error).message, steps, session });
      } finally {
        setBusy(false);
      }
      return;
    }

    const r = await askJson(profile, assistantMessages([], request, presentation, scene), checkAssistant, { onStep: (st) => add({ kind: st.kind, text: st.text, detail: st.detail }) });
    setBusy(false);
    if (r.ok && r.value) {
      if (r.value.presentation) onApply(JSON.stringify(r.value.presentation, null, 2));
      setResult({ ok: true, message: `${r.value.reply}${r.value.presentation ? '  (Ctrl+Z undoes it)' : ''}`, steps });
      setText('');
    } else {
      setResult({ ok: false, message: r.errors[0] ?? 'That did not work.', steps });
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
        <ModelSelect task="scene-edit" profiles={profiles} value={profile?.id} onChange={(id) => { setModelId(id); rememberFor('scene-edit', id); }} />
      )}
      <button className="primary" disabled={!profile || !text.trim() || busy} onClick={() => void ask()}>{busy ? 'Working…' : 'Ask'}</button>
      {busy && (
        <div className="scene-ask-live">
          <span className="muted">{live.at(-1)?.text ?? (isAgent(profile) ? `${profile?.name} is starting in the project…` : 'Working…')}</span>
          <Activity steps={live} />
        </div>
      )}
      {result && (
        <div className="scene-ask-done">
          <span className={result.ok ? 'scene-ask-result' : 'scene-ask-result error-text'}>{result.message}</span>
          <Activity steps={result.steps} session={result.session} />
        </div>
      )}
    </div>
  );
}
