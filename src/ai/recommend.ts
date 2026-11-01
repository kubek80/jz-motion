import type { ModelProfile } from './profiles';

// Which model is enough for which job. Each menu that picks a model knows its job; models are sorted into
// three sizes (guessed from their names, or set in Settings), and the menu marks the smallest one that fits.

export type Size = 'small' | 'medium' | 'large';
const ORDER: Size[] = ['small', 'medium', 'large'];

export type Task =
  | 'icon' | 'clipart' | '3d'
  | 'scene-edit' | 'scene-new' | 'chat'
  | 'from-topic' | 'from-script' | 'from-recording';

export const TASKS: Record<Task, { size: Size; job: string; why: string }> = {
  icon: { size: 'small', job: 'an icon', why: 'a few strokes, and the rules and checks keep it on style' },
  '3d': { size: 'small', job: 'a 3D model', why: 'boxes and cylinders placed by numbers' },
  clipart: { size: 'medium', job: 'clipart', why: 'many shapes that must look like something; a small model often manages, a medium one draws cleaner' },
  'scene-edit': { size: 'small', job: 'a change to one scene', why: 'a focused edit' },
  'scene-new': { size: 'medium', job: 'a new scene', why: 'it has to match the rest of the presentation' },
  chat: { size: 'medium', job: 'changes to the whole presentation', why: 'it reads and rewrites all of it' },
  'from-topic': { size: 'medium', job: 'a presentation from a topic', why: 'it plans a whole presentation from one sentence' },
  'from-script': { size: 'large', job: 'a presentation from a script', why: 'splitting a long script into scenes and beats and choosing what to draw benefits most from a large model; a medium one also works' },
  'from-recording': { size: 'large', job: 'a presentation from a recording', why: 'turning a whole talk into timed scenes is the hardest job here; a medium one also works' },
};

/** A model's size: as set in Settings, else guessed from its name; undefined when there is no telling. */
export function sizeOf(p: ModelProfile): Size | undefined {
  if (p.size) return p.size;
  const m = `${p.model} ${p.name}`.toLowerCase();
  if (/mock/.test(m)) return undefined;
  if (/haiku|(?<![a-z])mini|nano|flash|lite|small|\b[1-9]b\b|\b1[0-4]b\b/.test(m)) return 'small';
  if (/opus|gpt-5(?!-?(mini|nano))|\bo3\b|\bo1\b|gemini-[\d.]+-pro|ultra|deepseek-r1|\b(70|72|405|235)b\b|-max\b/.test(m)) return 'large';
  if (/sonnet|gpt-4|gemini|deepseek|qwen|llama|mistral|claude|gpt/.test(m)) return 'medium';
  return undefined;
}

export type Fit = 'recommended' | 'enough' | 'smaller' | 'too-small' | 'more-than-needed' | 'unknown';

/** How each model fits a task, and the one to suggest: the smallest that fits (a known size beats an unknown). */
export function rate(task: Task, profiles: ModelProfile[]): { fits: Map<string, Fit>; best?: ModelProfile } {
  const need = ORDER.indexOf(TASKS[task].size);
  const sized = profiles.map((p) => ({ p, s: sizeOf(p) }));
  const candidates = sized.filter((x) => x.s && ORDER.indexOf(x.s) >= need).sort((a, b) => ORDER.indexOf(a.s!) - ORDER.indexOf(b.s!) || Number(b.p.enabled) - Number(a.p.enabled));
  // Nothing big enough: the biggest there is.
  const fallback = sized.filter((x) => x.s).sort((a, b) => ORDER.indexOf(b.s!) - ORDER.indexOf(a.s!))[0];
  const best = candidates[0]?.p ?? fallback?.p;
  const fits = new Map<string, Fit>();
  for (const { p, s } of sized) {
    if (!s) fits.set(p.id, 'unknown');
    else if (p.id === best?.id) fits.set(p.id, 'recommended');
    else if (ORDER.indexOf(s) < need) fits.set(p.id, need - ORDER.indexOf(s) === 1 ? 'smaller' : 'too-small');
    else if (ORDER.indexOf(s) > ORDER.indexOf(sizeOf(best!) ?? s)) fits.set(p.id, 'more-than-needed');
    else fits.set(p.id, 'enough');
  }
  return { fits, best };
}

export const FIT_LABEL: Record<Fit, string> = {
  recommended: '★ recommended',
  enough: 'enough',
  smaller: 'works, smaller than ideal',
  'too-small': 'may struggle',
  'more-than-needed': 'more than needed',
  unknown: '',
};

/** One sentence for under or beside a model menu. */
export function advice(task: Task, profiles: ModelProfile[]): string {
  const t = TASKS[task];
  const lead = t.size === 'small' ? 'A small, fast model is enough' : t.size === 'medium' ? 'A medium model is the sweet spot' : 'Worth a large model';
  const base = `${lead} for ${t.job}: ${t.why}.`;
  const { best } = rate(task, profiles);
  const s = best && sizeOf(best);
  if (!best || !s) return base;
  return ORDER.indexOf(s) < ORDER.indexOf(t.size) ? `${base} None of your models is that size; ${best.name} is the closest.` : `${base} Suggested: ${best.name}.`;
}

/** The model to use for a task: the one last chosen for it, else the recommended one, else the first ticked. */
export function pickFor(task: Task, profiles: ModelProfile[], remembered?: string): ModelProfile | undefined {
  return profiles.find((p) => p.id === remembered) ?? rate(task, profiles).best ?? profiles.find((p) => p.enabled) ?? profiles[0];
}

const KEY = (task: Task) => `jzm.model.${task}`;
export function rememberedFor(task: Task): string | undefined {
  try { return localStorage.getItem(KEY(task)) ?? undefined; } catch { return undefined; }
}
export function rememberFor(task: Task, id: string) {
  try { localStorage.setItem(KEY(task), id); } catch { /* no storage */ }
}
