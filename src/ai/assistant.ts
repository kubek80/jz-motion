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

export const SCENE_TASK = `Write ONE new scene for the jz-motion presentation below (technical explainers drawn on a dark blackboard with luminous marker colors, stepped through beat by beat).
Reply with ONE JSON object, no Markdown fences: the scene, {"id": "...", "title": "...", "elements": [...], "beats": [...]}.
- Match the presentation's style: its colours, sizes and the way it explains things.
- 3 to 7 beats; each beat one idea, with a short title.
- Only use icons, clipart and 3D models from the library.`;

export function sceneMessages(description: string, current: string, after: number): ChatMessage[] {
  return [
    { role: 'system', content: `${SCENE_TASK}\n\n${referenceDocs()}` },
    { role: 'user', content: `The presentation:\n${current}\n\nThe new scene goes after scene ${after + 1}.\n\nThe scene: ${description}` },
  ];
}

/**
 * Inserts a scene after `after`, renaming its id if another scene has it. Scenes that continue from the
 * one before them ("inherit") stay attached: the new scene goes after the end of such a chain.
 */
export function insertScene(doc: { scenes: { id: string; inherit?: boolean }[] }, scene: Record<string, unknown>, after: number) {
  let at = after + 1;
  while (doc.scenes[at]?.inherit) at++;
  const ids = new Set(doc.scenes.map((s) => s.id));
  let id = typeof scene.id === 'string' && /^[A-Za-z][\w-]*$/.test(scene.id) ? scene.id : 'scene';
  for (let n = 2; ids.has(id); n++) id = `${String(scene.id ?? 'scene').replace(/-\d+$/, '')}-${n}`;
  const copy = structuredClone(doc);
  copy.scenes.splice(at, 0, { ...scene, id });
  return { doc: copy, index: at };
}

/** A scene is good when the presentation with it inserted still loads. */
export function checkScene(current: string, after: number) {
  return (value: unknown): Check<Record<string, unknown>> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: ['reply with one scene object'] };
    const { doc, index } = insertScene(JSON.parse(current), value as Record<string, unknown>, after);
    const r = checkPresentation(doc);
    if (r.ok) return { ok: true, value: doc.scenes[index] as Record<string, unknown> };
    // Errors about the new scene are the useful ones; say which scene that is.
    return { ok: false, errors: r.errors.map((e) => e.replace(`scenes.${index}`, 'the new scene')) };
  };
}
