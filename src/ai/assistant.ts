import { checkPresentation, type ChatMessage, type Check } from './client';
import { referenceDocs } from './prompt';

// Working with a model on a presentation in conversation: it answers, and changes the presentation
// when asked. Also used to turn a script or a transcript into a new presentation.

export const ASSISTANT_RULES = `You work with a person on their jz-motion presentation (technical explainers drawn on a dark blackboard with luminous marker colors, stepped through beat by beat), inside the app.

Reply with ONE JSON object, no Markdown fences:
{"reply": "<short answer to the person, 1 to 3 sentences>", "presentation": <the complete presentation> or null}
- Include "presentation" only when they ask for a change or a new presentation; otherwise null.
- When you change it, return the whole presentation (all scenes) and change only what was asked; keep element ids stable.
- In "reply" say briefly what you did, or answer the question.`;

export interface Turn { role: 'user' | 'assistant'; text: string }

export interface AssistantReply { reply: string; presentation: unknown | null }

export function assistantMessages(history: Turn[], request: string, current: string | null, scene?: number): ChatMessage[] {
  const context = current
    ? `Current presentation${scene !== undefined ? ` (the person is looking at scene ${scene + 1})` : ''}:\n${current}\n\n`
    : 'There is no presentation yet.\n\n';
  return [
    { role: 'system', content: `${ASSISTANT_RULES}\n\n${referenceDocs()}` },
    // Earlier turns as plain text; only the latest presentation is sent, to keep requests small.
    ...history.map((t): ChatMessage => ({ role: t.role, content: t.text })),
    { role: 'user', content: `${context}${request}` },
  ];
}

export function checkAssistant(value: unknown): Check<AssistantReply> {
  const v = value as Record<string, unknown>;
  if (!v || typeof v !== 'object' || typeof v.reply !== 'string') return { ok: false, errors: ['reply with {"reply": "...", "presentation": ... or null}'] };
  if (v.presentation === null || v.presentation === undefined) return { ok: true, value: { reply: v.reply, presentation: null } };
  const p = checkPresentation(v.presentation);
  return p.ok ? { ok: true, value: { reply: v.reply, presentation: v.presentation } } : { ok: false, errors: p.errors.map((e) => `presentation.${e}`) };
}

export const scriptRequest = (script: string) => `Turn this script into a presentation that illustrates it.
- One scene per section or topic change; one beat per idea, in the order it is said.
- Put the exact lines the presenter says during each beat in that beat's "notes".
- Draw what the words describe: components, flows, comparisons, numbers as charts.

Script:
${script}`;

export interface Segment { start: number; end: number; text: string }

export const transcriptRequest = (segments: Segment[]) => `This is the transcript of a recorded talk, with each sentence's start time in seconds. Turn it into a presentation that illustrates it while the recording plays.
- One scene per topic; one beat per idea, in order.
- Set each beat's "cue" to the start time (seconds, from the brackets) of the sentence where its idea begins, so the animation plays as it is said. Cues must increase through the presentation.
- Put the words spoken during each beat in its "notes".
- Draw what is said: components, flows, comparisons, numbers as charts.

Transcript:
${segments.map((s) => `[${s.start.toFixed(1)}] ${s.text.trim()}`).join('\n')}`;
