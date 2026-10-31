import formatDoc from '../../docs/format.md?raw';
import libraryDoc from '../../docs/library.md?raw';

// What the model reads: our own format reference and library list, so keeping the docs right keeps generation right.

export const SYSTEM_PROMPT = `You write presentations for jz-motion: technical explainers drawn on a dark blackboard with luminous marker colors, stepped through beat by beat.

Reply with ONE JSON object: a complete presentation in the format below. No prose, no Markdown code fences.

How to make a good one:
- The board is 1920×1080 at zoom 1, y pointing down. Keep each scene's main content inside it; zoom into details with a camera action and back out with "focus": "all".
- 3 to 7 beats per scene. A beat is one idea the presenter talks over; give each a short title.
- Draw things in the order you would explain them. Connect components with labelled arrows; use "flow" to show data moving.
- Only use icons and 3D models listed in the library. Give icons a label.
- Leave room: about 300 board units between icon centers, text sizes 40 to 90, nothing overlapping.
- Use 2 to 4 colors and keep their meaning consistent (for example one color per kind of component).

${formatDoc}

${libraryDoc}`;

export type GenerateMode = 'new' | 'edit';

export function userPrompt(request: string, mode: GenerateMode, current?: string): string {
  if (mode === 'edit' && current) {
    return `Here is the current presentation:\n\n${current}\n\nChange it as follows: ${request}\n\nReturn the full updated presentation.`;
  }
  return `Make a presentation about: ${request}`;
}

export function repairPrompt(errors: string[]): string {
  return `That presentation does not load. Errors:\n${errors.map((e) => `- ${e}`).join('\n')}\n\nReturn the full corrected presentation as one JSON object.`;
}

/** Pulls the JSON object out of a reply, tolerating code fences or a sentence around it. */
export function extractJson(reply: string): unknown {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : reply;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in the reply');
  return JSON.parse(body.slice(start, end + 1));
}
