import formatDoc from '../../docs/format.md?raw';
import libraryDoc from '../../docs/library.md?raw';
import { generatedIcons } from '../engine/icons.generated';
import builtInIso from '../engine/iso-models.json';
import { isoModels } from '../engine/iso';
import { icons } from '../engine/library';

// What the model reads: our own format reference and library list, so keeping the docs right keeps generation right.

const TASK = `You write presentations for jz-motion: technical explainers drawn on a dark blackboard with luminous marker colors, stepped through beat by beat.

Reply with ONE JSON object: a complete presentation in the format below. No prose, no Markdown code fences.`;

const CRAFT = `How to make a good one:
- The board is 1920×1080 at zoom 1, y pointing down. Keep each scene's main content inside it; zoom into details with a camera action and back out with "focus": "all".
- 3 to 7 beats per scene. A beat is one idea the presenter talks over; give each a short title.
- Draw things in the order you would explain them. Connect components with labelled arrows; use "flow" to show data moving.
- Only use icons, clipart and 3D models listed in the library. Give icons a label.
- Leave room: about 300 board units between icon centers, text sizes 40 to 90, nothing overlapping.
- Use 2 to 4 colors and keep their meaning consistent (for example one color per kind of component).`;

/** The format reference and the library, including icons and clipart made in this app. */
export function referenceDocs(): string {
  const own = Object.entries(icons).filter(([name]) => !(name in generatedIcons));
  const ownIso = Object.entries(isoModels).filter(([name]) => !(name in builtInIso));
  const extra = own.length || ownIso.length
    ? `\n\n## Made in this app\n\n| Name | Use as | What it shows |\n|---|---|---|\n${[
      ...own.map(([n, d]) => `| \`${n}\` | icon | ${d.description} |`),
      ...ownIso.map(([n, d]) => `| \`${n}\` | iso model | ${d.description} |`),
    ].join('\n')}\n`
    : '';
  return `${CRAFT}\n\n${formatDoc}\n\n${libraryDoc}${extra}`;
}

/** System prompt for "write me a presentation" requests. */
export function systemPrompt(): string {
  return `${TASK}\n\n${referenceDocs()}`;
}

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
