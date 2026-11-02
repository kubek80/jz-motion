import { useState } from 'react';

/** One thing that happened while a model worked: a request sent, a reply, a check, or an agent's step. */
export interface ActivityStep {
  kind: 'sent' | 'received' | 'checked' | 'failed' | 'step' | 'note' | 'problem';
  text: string;
  /** Full text behind the step (the request, the reply, the problems), shown on demand. */
  detail?: string;
  tool?: string;
}

export interface AgentSession { id: string; cwd: string }

const ICON: Record<string, string> = {
  sent: '→', received: '←', checked: '✓', failed: '✗', problem: '!', note: '·',
  Read: '◧', Write: '✎', Edit: '✎', MultiEdit: '✎', Bash: '▸', Glob: '⌕', Grep: '⌕', Skill: '✦', TodoWrite: '☰',
};

/** What a model did, step by step: live while it works, folded away afterwards. */
export function Activity({ steps, live, session, startOpen }: { steps: ActivityStep[]; live?: boolean; session?: AgentSession; startOpen?: boolean }) {
  const [shown, setShown] = useState<ActivityStep | null>(null);
  const [copied, setCopied] = useState(false);
  if (!steps.length && !live) return null;
  const command = session ? `cd "${session.cwd}" && claude --resume ${session.id}` : '';
  const list = (
    <ol className="activity-steps">
      {steps.map((s, i) => (
        <li key={i} className={`act ${s.kind}`}>
          <i>{ICON[s.tool && s.tool in ICON ? s.tool : s.kind] ?? '•'}</i>
          <span className="act-text">{s.text}</span>
          {s.detail && <button className="link" onClick={() => setShown(s)}>view</button>}
        </li>
      ))}
      {live && <li className="act working"><i className="spinner" /> <span className="muted">working…</span></li>}
    </ol>
  );
  return (
    <div className="activity">
      {live ? list : (
        <details open={startOpen}>
          <summary>What happened · {steps.length} step{steps.length === 1 ? '' : 's'}</summary>
          {list}
        </details>
      )}
      {session && !live && (
        <div className="act-session">
          <span className="muted">Continue this session in a terminal:</span>
          <code>{command}</code>
          <button className="link" onClick={() => { void navigator.clipboard?.writeText(command); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'copied' : 'copy'}</button>
        </div>
      )}
      {shown && (
        <div className="modal-back" onClick={() => setShown(null)}>
          <div className="modal wide tall act-detail" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>{shown.text}</h2><button onClick={() => setShown(null)}>✕</button></div>
            <pre>{shown.detail}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

/** An agent event as a step (or nothing, for events that aren't steps). */
export function agentStep(ev: { e: string; tool?: string; text?: string }): ActivityStep | null {
  if (ev.e === 'step') return { kind: 'step', tool: ev.tool, text: ev.text! };
  if (ev.e === 'note') return { kind: 'note', text: ev.text!.length > 220 ? `${ev.text!.slice(0, 219)}…` : ev.text!, detail: ev.text!.length > 220 ? ev.text : undefined };
  if (ev.e === 'problem') return { kind: 'problem', text: ev.text! };
  return null;
}
