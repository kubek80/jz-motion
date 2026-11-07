import { useRef, useState } from 'react';
import { assistantMessages, checkAssistant } from '../../ai/assistant';
import { askJson, checkPresentation } from '../../ai/client';
import { agentPrompt, isAgent, runAgent } from '../../ai/agent';
import { Activity, agentStep, type ActivityStep, type AgentSession } from '../Activity';
import { loadProfiles } from '../../ai/profiles';
import { pickFor, rememberedFor, rememberFor } from '../../ai/recommend';
import { ModelSelect } from '../ModelSelect';
import { describeChange } from '../../ai/changes';

/** Adds what the app did with an AI answer to the AI log (logs/ai.jsonl on the local server). */
const logOutcome = (entry: Record<string, unknown>) => void fetch('/api/ai-log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) }).catch(() => undefined);


/**
 * One-line requests to a model about the scene being edited: its elements, beats and timing, or a new scene
 * made from part of it. Says plainly what changed (and opens a new scene), and records every request and its
 * outcome in the AI log (logs/ai.jsonl).
 */
export function SceneAsk({ presentation, scene, title, onApply }: { presentation: string; scene: number; title: string; onApply: (json: string, openScene?: number) => void }) {
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
    const asked = text.trim();
    // About this scene, but free to add scenes after it when asked (e.g. a part of its narration in a scene of its own).
    const request = `This is about scene ${scene + 1} ("${title}"). Change that scene as asked. If the request asks for a new scene (for example, part of this scene's narration illustrated in a scene of its own), add it right after scene ${scene + 1} and move that part of the speaker notes into it. Leave the other scenes as they are.\n\n${asked}`;
    const started = Date.now();
    /** Applies an answer (if it changes anything), tells the person what happened, and logs it. */
    const finish = (value: unknown, reply: string, extra: { steps: ActivityStep[]; session?: AgentSession }) => {
      const before = JSON.parse(presentation);
      const summary = value ? describeChange(before, value as typeof before) : null;
      const outcome = !value ? 'no change' : summary!.text ? 'applied' : 'no change';
      if (value && summary!.text) onApply(JSON.stringify(value, null, 2), summary!.added[0]);
      const message = outcome === 'applied'
        ? `${summary!.text}. ${reply}  (Ctrl+Z undoes it)`
        : `Nothing was changed. ${reply ? `The model said: “${reply}”` : ''}`;
      setResult({ ok: outcome === 'applied' || !value, message, ...extra });
      if (outcome === 'applied') setText('');
      logOutcome({ where: 'scene-ask', model: profile.name, scene: scene + 1, request: asked, outcome, changes: summary?.text, reply, ms: Date.now() - started, session: extra.session?.id });
    };

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
        if (check && !check.ok) {
          setResult({ ok: false, message: `Not applied: the changed presentation doesn't load (${check.errors[0]}). Ask again, or open the steps below to see what it did.`, steps, session });
          logOutcome({ where: 'scene-ask', model: profile.name, scene: scene + 1, request: asked, outcome: 'rejected: does not load', errors: check.errors.slice(0, 10), reply: done.reply, ms: Date.now() - started, session: session?.id });
        } else finish(value, done.reply, { steps, session });
      } catch (e) {
        setResult({ ok: false, message: (e as Error).message, steps, session });
        logOutcome({ where: 'scene-ask', model: profile.name, scene: scene + 1, request: asked, outcome: 'error', error: (e as Error).message, ms: Date.now() - started, session: session?.id });
      } finally {
        setBusy(false);
      }
      return;
    }

    const r = await askJson(profile, assistantMessages([], request, presentation, scene), checkAssistant, { onStep: (st) => add({ kind: st.kind, text: st.text, detail: st.detail }) });
    setBusy(false);
    if (r.ok && r.value) finish(r.value.presentation ?? null, r.value.reply, { steps });
    else {
      setResult({ ok: false, message: `Not applied: ${r.errors[0] ?? 'that did not work'}.`, steps });
      logOutcome({ where: 'scene-ask', model: profile.name, scene: scene + 1, request: asked, outcome: 'error', errors: r.errors.slice(0, 10), ms: Date.now() - started });
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
