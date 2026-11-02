import { useEffect, useRef, useState } from 'react';
import { assistantMessages, checkAssistant, type Turn } from '../ai/assistant';
import { askJson, checkPresentation } from '../ai/client';
import { agentPrompt, isAgent, runAgent } from '../ai/agent';
import { Activity, agentStep, type ActivityStep, type AgentSession } from './Activity';
import { loadProfiles, type ModelProfile } from '../ai/profiles';
import { advice, pickFor, rememberedFor, rememberFor, type Task } from '../ai/recommend';
import { ModelSelect } from './ModelSelect';
import { ModelsEditor } from './ModelsEditor';

interface Message extends Turn {
  /** For the model's turns: it changed the presentation. */
  changed?: boolean;
  errors?: string[];
  meta?: string;
  /** What the model did to get there. */
  activity?: ActivityStep[];
  session?: AgentSession;
}

interface Props {
  /** The presentation being worked on (null: none yet). */
  current: string | null;
  scene?: number;
  /** A changed (or new) presentation from the model. */
  onPresentation: (json: string) => void;
  /** Wraps the first message (e.g. a script into "turn this script into a presentation"). */
  wrapFirst?: (text: string) => string;
  placeholder?: string;
  intro?: React.ReactNode;
  /** Messages to start with (restored conversation). */
  initial?: Message[];
  onMessages?: (m: Message[]) => void;
  /** Text to start the input box with. */
  initialInput?: string;
  /** The model to start with (a profile id). */
  initialModelId?: string;
  /** Send the starting input straight away. */
  autoSend?: boolean;
  /** The job, for recommending a model (default: changes to the whole presentation). */
  task?: Task;
}

/** Talk to a model about the presentation; when it changes something, the change is applied (and can be undone). */
export function Chat({ current, scene, onPresentation, wrapFirst, placeholder, intro, initial, onMessages, initialInput, initialModelId, autoSend, task = 'chat' }: Props) {
  const [profiles, setProfiles] = useState<ModelProfile[]>(loadProfiles);
  const [modelId, setModelId] = useState<string>(() => pickFor(task, profiles, initialModelId ?? rememberedFor(task))?.id ?? '');
  const [messages, setMessages] = useState<Message[]>(initial ?? []);
  const [input, setInput] = useState(initialInput ?? '');
  const [busy, setBusy] = useState(false);
  /** Steps of the request in progress. */
  const [live, setLive] = useState<ActivityStep[]>([]);
  /** Agent mode: the draft file and the Claude Code session, kept across the conversation. */
  const draftId = useRef(`chat-${Math.random().toString(36).slice(2, 10)}`);
  const agentSession = useRef<AgentSession | undefined>(undefined);
  const [managing, setManaging] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => { onMessages?.(messages); }, [messages, onMessages]);
  // Braces matter: scrollTo returns a promise in newer browsers, and an effect may only return a cleanup.
  useEffect(() => { void list.current?.scrollTo({ top: list.current.scrollHeight }); }, [messages, busy]);
  const profile = profiles.find((p) => p.id === modelId);

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || !profile || busy) return;
    const isFirst = !messages.some((m) => m.role === 'user');
    const request = isFirst && wrapFirst ? wrapFirst(text) : text;
    const history: Turn[] = messages.filter((m) => !m.errors).map(({ role, text: t }) => ({ role, text: t }));
    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    setBusy(true);
    setLive([]);
    const steps: ActivityStep[] = [];
    const add = (s: ActivityStep) => { steps.push(s); setLive([...steps]); };

    if (isAgent(profile)) {
      // Claude Code works in the project with its skills, on a draft copy of the presentation.
      const file = `presentations/.drafts/${draftId.current}.json`;
      try {
        const done = await runAgent(profile, {
          prompt: agentPrompt({ file, request, existing: current !== null, followUp: !!agentSession.current, scene }),
          draftId: draftId.current,
          draft: current ?? undefined,
          resume: agentSession.current?.id,
        }, (ev) => {
          if (ev.e === 'start') agentSession.current = { id: ev.session, cwd: ev.cwd };
          const s = agentStep(ev);
          if (s) add(s);
        });
        if (done.session) agentSession.current = { id: done.session, cwd: agentSession.current?.cwd ?? '' };
        // Its last words are the reply shown above; don't list them twice.
        const last = steps.at(-1);
        if (last?.kind === 'note' && done.reply.startsWith((last.detail ?? last.text).slice(0, 40))) steps.pop();
        const meta = `${profile.name} · ${done.turns ?? '?'} steps · ${(done.ms / 1000).toFixed(0)}s`;
        let changed = false;
        let errors: string[] | undefined;
        if (done.changed && done.presentation) {
          try {
            const value = JSON.parse(done.presentation);
            const check = checkPresentation(value);
            if (check.ok) { onPresentation(JSON.stringify(value, null, 2)); changed = true; } else errors = check.errors;
          } catch (e) {
            errors = [`the draft is not valid JSON: ${(e as Error).message}`];
          }
        }
        setMessages((m) => [...m, { role: 'assistant', text: done.reply || (changed ? 'Done.' : 'No changes.'), changed, errors, meta, activity: steps, session: agentSession.current }]);
      } catch (e) {
        setMessages((m) => [...m, { role: 'assistant', text: 'That did not work.', errors: [(e as Error).message], activity: steps, session: agentSession.current }]);
      } finally {
        setBusy(false);
      }
      return;
    }

    const r = await askJson(profile, assistantMessages(history, request, current, scene), checkAssistant, {
      onStep: (s) => add({ kind: s.kind, text: s.text, detail: s.detail }),
    });
    setBusy(false);
    const meta = `${profile.name} · ${(r.ms / 1000).toFixed(1)}s${r.attempts > 1 ? ` · ${r.attempts} tries` : ''}${r.usage.cost !== undefined ? ` · $${r.usage.cost.toFixed(4)}` : ''}`;
    if (!r.ok || !r.value) {
      setMessages((m) => [...m, { role: 'assistant', text: 'That did not work.', errors: r.errors, meta, activity: steps }]);
      return;
    }
    if (r.value.presentation) onPresentation(JSON.stringify(r.value.presentation, null, 2));
    setMessages((m) => [...m, { role: 'assistant', text: r.value!.reply, changed: !!r.value!.presentation, meta, activity: steps }]);
  };

  // Sent once, on the way in (from the home screen's prompt box).
  const autoSent = useRef(false);
  useEffect(() => {
    if (autoSend && !autoSent.current && initialInput) {
      autoSent.current = true;
      void send(initialInput);
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="chat">
      <div className="chat-bar">
        <ModelSelect task={task} profiles={profiles} value={modelId} onChange={(id) => { setModelId(id); rememberFor(task, id); }} />
        <button onClick={() => setManaging(!managing)}>{managing ? 'Done' : 'Models…'}</button>
        {messages.length > 0 && <button onClick={() => setMessages([])} title="Start a new conversation">Clear</button>}
      </div>
      {profiles.length > 0 && <small className="model-advice">{advice(task, profiles)}</small>}
      {managing && <ModelsEditor onChange={(ps) => { setProfiles(ps); if (!ps.some((p) => p.id === modelId)) setModelId(ps[0]?.id ?? ''); }} />}
      <div className="chat-log" ref={list}>
        {!messages.length && <div className="muted chat-intro">{intro ?? 'Ask for changes ("add a database under the API and an arrow to it"), or ask about the presentation.'}</div>}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}${m.errors ? ' failed' : ''}`}>
            <div className="msg-text">{m.text}</div>
            {m.changed && <div className="msg-tag">✓ changed the presentation (undo with Ctrl+Z)</div>}
            {m.errors && <details><summary>{m.errors.length} problem{m.errors.length === 1 ? '' : 's'}</summary><ul>{m.errors.slice(0, 12).map((e) => <li key={e}>{e}</li>)}</ul></details>}
            {m.meta && <div className="msg-meta">{m.meta}</div>}
            {m.activity && <Activity steps={m.activity} session={m.session} />}
          </div>
        ))}
        {busy && (
          <div className="msg assistant pending">
            <div className="msg-text">{isAgent(profile) ? `${profile?.name} is working in the project…` : 'Working…'}</div>
            <Activity steps={live} live />
          </div>
        )}
      </div>
      <div className="chat-input">
        <textarea
          rows={3}
          value={input}
          placeholder={profile ? placeholder ?? 'Message (Enter to send, Shift+Enter for a new line)' : 'Add a model first (Models…)'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="primary" disabled={!input.trim() || !profile || busy} onClick={() => void send()}>Send</button>
      </div>
    </div>
  );
}

export type { Message as ChatMessageView };
