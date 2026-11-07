import { loadUserLibrary } from '../app/userLibrary';
import type { ModelProfile } from './profiles';

// Talking to Claude Code in agent mode (server/claudeAgent.ts): it works on a draft file in the repository
// with the project's skills, and reports each step as it goes.

export type AgentEvent =
  | { e: 'start'; session: string; cwd: string; file: string }
  | { e: 'step'; tool: string; text: string }
  | { e: 'note'; text: string }
  | { e: 'problem'; text: string }
  | { e: 'done'; reply: string; session?: string; turns?: number; ms: number; cost?: number; presentation?: string; changed: boolean }
  | { e: 'error'; text: string };

/** Agent mode applies to "Claude Code (my subscription)" models unless switched off for one. */
export const isAgent = (p?: ModelProfile) => !!p && p.baseURL.startsWith('claude-code') && p.agent !== false;

export async function runAgent(
  profile: ModelProfile,
  job: { prompt: string; draftId: string; draft?: string; resume?: string },
  onEvent: (ev: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<Extract<AgentEvent, { e: 'done' }>> {
  const res = await fetch('/api/agent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: profile.model, ...job }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let done: Extract<AgentEvent, { e: 'done' }> | undefined;
  let failure: string | undefined;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      const ev = JSON.parse(line) as AgentEvent;
      onEvent(ev);
      if (ev.e === 'done') done = ev;
      if (ev.e === 'error') failure = ev.text;
    }
  }
  if (!done) throw new Error(failure ?? 'Claude Code stopped without an answer');
  // It may have made library items (icons, logos, 3D models) for the presentation: load them before the
  // answer is checked, or the presentation would look like it uses unknown icons.
  await loadUserLibrary();
  return done;
}

/** The instruction for working on a presentation draft. `scene` is the one the person is looking at. */
export function agentPrompt(o: { file: string; request: string; existing: boolean; followUp: boolean; scene?: number }): string {
  if (o.followUp) return `${o.request}\n\n(Same draft file: ${o.file}. Reply in 1–3 sentences when done.)`;
  const rules = `Work only on ${o.file}: the app opens that file when you finish. Don't create or change other presentations, don't commit, don't start the dev server; you may add library items if one is really needed. You are already in the project folder. Use the Read, Write and Edit tools for files (not shell commands); the only commands you can run are \`npm run check -- <file>\`, \`npm run snapshot -- <file>\`, \`npm run media -- import <file>\` (to bring a picture or screen recording into the media library; use the /media/… src it prints) \`npm run media -- frames <file>\` (a recording's frames, for play's goto/until) and \`npm run voice -- time|place <file> --scenes id,…\` (generated speech: time a scene's words; give new scenes in a timed presentation their voice on the timeline, as the edit-presentation skill says; it needs a speech key in the environment, so if it says there is none, tell the person), with their options, one per call, without cd, pipes or other commands. Pictures and recordings already in the library are listed in media/index.json.`;
  return o.existing
    ? `The person has a jz-motion presentation open in the app; it is saved in ${o.file}${o.scene !== undefined ? ` and they are looking at scene ${o.scene + 1}` : ''}. Change it as they ask below, following the edit-presentation skill (check it, and look at snapshots of the scenes you change). The app reloads the file when you finish, so ignore the skill's advice about closing it. If they only ask a question, answer without changing the file. ${rules}\n\nTheir request:\n\n${o.request}\n\nWhen done, reply in 1–3 sentences: what you changed, or the answer.`
    : `Make a new jz-motion presentation for the person using the app, following the new-presentation skill (read the rules and examples, check it, look at the snapshots and fix what looks wrong), but write it to ${o.file} instead of presentations/<id>.json. ${rules}\n\nTheir request:\n\n${o.request}\n\nWhen done, reply in 1–3 sentences: what you made.`;
}
