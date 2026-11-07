// What an AI answer changed, in plain words: scenes added (where), removed, and changed. Used to tell the person
// what happened (and where to look), and for the AI log.

interface SceneLike { id?: string; title?: string }
interface DocLike { title?: string; scenes: SceneLike[]; voiceover?: unknown }

export interface ChangeSummary {
  /** Positions (0-based, in the new presentation) of scenes that weren't there before. */
  added: number[];
  removed: string[];
  changed: number[];
  /** One line, e.g. "Added scene 2 “No Photoshop needed” · changed scene 1". Empty when nothing changed. */
  text: string;
}

const name = (s: SceneLike | undefined, i: number) => `scene ${i + 1}${s?.title ? ` “${s.title}”` : ''}`;

export function describeChange(before: DocLike, after: DocLike): ChangeSummary {
  const oldById = new Map(before.scenes.map((s, i) => [s.id, { s, i }]));
  const newIds = new Set(after.scenes.map((s) => s.id));
  const added: number[] = [];
  const changed: number[] = [];
  after.scenes.forEach((s, i) => {
    const old = oldById.get(s.id);
    if (!old) added.push(i);
    else if (JSON.stringify(old.s) !== JSON.stringify(s)) changed.push(i);
  });
  const removed = before.scenes.filter((s) => !newIds.has(s.id)).map((s) => s.title ?? s.id ?? 'a scene');
  const parts = [
    ...added.map((i) => `Added ${name(after.scenes[i], i)}`),
    ...removed.map((t) => `removed “${t}”`),
    ...(changed.length ? [`changed ${changed.map((i) => `scene ${i + 1}`).join(', ')}`] : []),
    ...(before.title !== after.title ? ['renamed the presentation'] : []),
  ];
  const text = parts.join(' · ');
  return { added, removed, changed, text: text ? text[0].toUpperCase() + text.slice(1) : '' };
}
