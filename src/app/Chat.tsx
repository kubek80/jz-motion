import { useEffect, useRef, useState } from 'react';
import { assistantMessages, checkAssistant, type Turn } from '../ai/assistant';
import { askJson } from '../ai/client';
import { loadProfiles, type ModelProfile } from '../ai/profiles';
import { ModelsEditor } from './ModelsEditor';

interface Message extends Turn {
  /** For the model's turns: it changed the presentation. */
  changed?: boolean;
  errors?: string[];
  meta?: string;
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
}

/** Talk to a model about the presentation; when it changes something, the change is applied (and can be undone). */
export function Chat({ current, scene, onPresentation, wrapFirst, placeholder, intro, initial, onMessages, initialInput }: Props) {
  const [profiles, setProfiles] = useState<ModelProfile[]>(loadProfiles);
  const [modelId, setModelId] = useState<string>(() => profiles.find((p) => p.enabled)?.id ?? profiles[0]?.id ?? '');
  const [messages, setMessages] = useState<Message[]>(initial ?? []);
  const [input, setInput] = useState(initialInput ?? '');
  const [busy, setBusy] = useState(false);
  const [managing, setManaging] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => { onMessages?.(messages); }, [messages, onMessages]);
  // Braces matter: scrollTo returns a promise in newer browsers, and an effect may only return a cleanup.
  useEffect(() => { void list.current?.scrollTo({ top: list.current.scrollHeight }); }, [messages, busy]);
  const profile = profiles.find((p) => p.id === modelId);

  const send = async () => {
    const text = input.trim();
    if (!text || !profile || busy) return;
    const isFirst = !messages.some((m) => m.role === 'user');
    const request = isFirst && wrapFirst ? wrapFirst(text) : text;
    const history: Turn[] = messages.filter((m) => !m.errors).map(({ role, text: t }) => ({ role, text: t }));
    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    setBusy(true);
    const r = await askJson(profile, assistantMessages(history, request, current, scene), checkAssistant);
    setBusy(false);
    const meta = `${profile.name} · ${(r.ms / 1000).toFixed(1)}s${r.attempts > 1 ? ` · ${r.attempts} tries` : ''}${r.usage.cost !== undefined ? ` · $${r.usage.cost.toFixed(4)}` : ''}`;
    if (!r.ok || !r.value) {
      setMessages((m) => [...m, { role: 'assistant', text: 'That did not work.', errors: r.errors, meta }]);
      return;
    }
    if (r.value.presentation) onPresentation(JSON.stringify(r.value.presentation, null, 2));
    setMessages((m) => [...m, { role: 'assistant', text: r.value!.reply, changed: !!r.value!.presentation, meta }]);
  };

  return (
    <div className="chat">
      <div className="chat-bar">
        <select value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={!profiles.length}>
          {!profiles.length && <option value="">No models yet</option>}
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={() => setManaging(!managing)}>{managing ? 'Done' : 'Models…'}</button>
        {messages.length > 0 && <button onClick={() => setMessages([])} title="Start a new conversation">Clear</button>}
      </div>
      {managing && <ModelsEditor onChange={(ps) => { setProfiles(ps); if (!ps.some((p) => p.id === modelId)) setModelId(ps[0]?.id ?? ''); }} />}
      <div className="chat-log" ref={list}>
        {!messages.length && <div className="muted chat-intro">{intro ?? 'Ask for changes ("add a database under the API and an arrow to it"), or ask about the presentation.'}</div>}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}${m.errors ? ' failed' : ''}`}>
            <div className="msg-text">{m.text}</div>
            {m.changed && <div className="msg-tag">✓ changed the presentation (undo with Ctrl+Z)</div>}
            {m.errors && <details><summary>{m.errors.length} problem{m.errors.length === 1 ? '' : 's'}</summary><ul>{m.errors.slice(0, 12).map((e) => <li key={e}>{e}</li>)}</ul></details>}
            {m.meta && <div className="msg-meta">{m.meta}</div>}
          </div>
        ))}
        {busy && <div className="msg assistant pending">thinking…</div>}
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
