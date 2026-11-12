import { DEFAULT_CAMERA, fullBox, type Box } from './geometry';
import { isoModels } from './iso';
import { icons } from './library';
import { Presentation, type Camera } from './schema';
import { compileAction, SHOW } from './compileAction';
import { isPinned, isPositioned, type CompiledBeat, type CompiledElement, type CompiledScene, type CompileResult, type ElementState, type Op, type Spotlight } from './compileTypes';

export * from './compileTypes';

// Turns a presentation into a flat, timed plan per scene. Pure and DOM-free so it is easy to test;
// the board (render.ts) turns the plan into SVG and a GSAP timeline. Each action is compiled by
// compileAction.ts; the types of the plan are in compileTypes.ts.

/** A round number a little above `v`: 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8 times a power of ten. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const target = v * 1.05;
  const exp = 10 ** Math.floor(Math.log10(target));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * exp >= target) return m * exp;
  return 10 * exp;
}

export function compile(input: unknown): CompileResult {
  const parsed = Presentation.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  const source = parsed.data;
  const errors: string[] = [];
  const scenes: CompiledScene[] = [];
  const castIds = (source.cast ?? []).map((c) => c.id);
  (source.cast ?? []).forEach((c, i) => { if (castIds.indexOf(c.id) !== i) errors.push(`cast.${i}: "${c.id}" is already in the cast`); });

  source.scenes.forEach((scene, si) => {
    try {
      compileScene(scene, si);
    } catch (e) {
      // Errors are reported, never thrown: an LLM gets them back as a list it can fix.
      errors.push(`scenes.${si}: ${(e as Error).message}`);
    }
  });

  function compileScene(scene: Presentation['scenes'][number], si: number) {
    const where = `scenes.${si}`;
    const prev = scenes[si - 1];
    const elements: CompiledElement[] = [];
    const byId = new Map<string, CompiledElement>();
    const state: Record<string, ElementState> = {};

    if (scene.inherit && prev) {
      for (const el of prev.elements) {
        const s = prev.final[el.id];
        if (!s.visible) continue;
        const moved = isPositioned(el) ? { ...el, x: s.x, y: s.y } : el;
        const carried = { ...moved, color: s.color } as CompiledElement;
        elements.push(carried);
        byId.set(el.id, carried);
        state[el.id] = { ...s };
      }
    }

    // Elements revealed by a beat start hidden unless they say otherwise.
    const revealed = new Set<string>();
    for (const beat of scene.beats) {
      for (const a of beat.actions) {
        if (a.do in SHOW && 'target' in a && a.target) [a.target].flat().forEach((id) => revealed.add(id));
      }
    }

    scene.elements.forEach((el, ei) => {
      if (byId.has(el.id)) {
        errors.push(`${where}.elements.${ei}: id "${el.id}" is already used${state[el.id] ? ' (inherited from the previous scene)' : ''}`);
        return;
      }
      if (el.type === 'chart' && el.kind === 'pie' && el.data.every((d) => d.value === 0)) {
        errors.push(`${where}.elements.${ei}: a pie chart needs at least one value above 0`);
        return;
      }
      if (el.type === 'icon' && !icons[el.icon]) {
        errors.push(`${where}.elements.${ei}: unknown icon "${el.icon}" (see docs/library.md)`);
        return;
      }
      if (el.type === 'iso' && !el.parts?.length && !isoModels[el.model ?? '']) {
        errors.push(`${where}.elements.${ei}: ${el.model ? `unknown iso model "${el.model}"` : 'an iso element needs "model" or "parts"'} (see docs/library.md)`);
        return;
      }
      elements.push(el);
      byId.set(el.id, el);
      state[el.id] = {
        visible: el.visible ?? !revealed.has(el.id),
        x: 'x' in el ? el.x : 0,
        y: 'y' in el ? el.y : 0,
        color: el.color,
        flow: null,
        ...(el.type === 'iso' ? { iso: { rotate: el.rotate, explode: 0, spin: null } } : {}),
        ...(el.type === 'chart' ? { chart: { values: el.data.map((d) => d.value), max: el.max ?? 0 } } : {}),
      };
    });

    const lookup = (id: string) => byId.get(id);
    // An arrow lives either on the screen or on the board, and so must what it connects.
    for (const [ei, el] of scene.elements.entries()) {
      if (el.type !== 'arrow') continue;
      const ends = [el.from, el.to].filter((r): r is string => typeof r === 'string').map((r) => r.split('.')[0]);
      const odd = ends.filter((id) => byId.has(id) && isPinned(byId.get(id)) !== isPinned(el));
      if (odd.length) errors.push(`${where}.elements.${ei}: the arrow "${el.id}" is ${isPinned(el) ? 'fixed on the screen' : 'on the board'} but ${odd.map((m) => `"${m}"`).join(' and ')} ${isPinned(el) ? "isn't" : 'is fixed on the screen'}; pin both ends and the arrow, or none`);
    }
    for (const [ei, el] of scene.elements.entries()) {
      if (el.type !== 'arrow' || byId.get(el.id) !== el) continue;
      try {
        fullBox(el, lookup);
      } catch (e) {
        errors.push(`${where}.elements.${ei} (${el.id}): ${(e as Error).message}`);
        // Leave the broken arrow out so later steps (framing, circles) don't trip over it.
        elements.splice(elements.indexOf(el), 1);
        byId.delete(el.id);
        delete state[el.id];
      }
    }

    const initial = structuredClone(state);
    const startCamera: Camera = scene.camera ?? (scene.inherit && prev ? prev.finalCamera : DEFAULT_CAMERA);
    // Scene-wide state the actions change: the camera, the light on the board (every scene starts without
    // a spotlight), and how many circles were drawn (for their ids).
    const sc: { camera: Camera; spotlight: Spotlight | null; rings: number } = { camera: startCamera, spotlight: null, rings: 0 };
    const ops: Op[] = [];
    const beats: CompiledBeat[] = [];
    let time = 0;

    /** Current box of an element, following moves. */
    const boxOf = (id: string): Box => {
      const el = byId.get(id)!;
      const s = state[id];
      const shifted = isPositioned(el) ? ({ ...el, x: s.x, y: s.y } as CompiledElement) : el;
      return fullBox(shifted, lookup);
    };

    // Who speaks: someone in the cast (a podcast), named by the beat, else the scene, else the first in the cast.
    for (const [where2, who] of [[`${where}.speaker`, scene.speaker], ...scene.beats.map((b, i) => [`${where}.beats.${i}.speaker`, b.speaker])] as [string, string | undefined][]) {
      if (who !== undefined && !castIds.includes(who)) errors.push(`${where2}: "${who}" is not in the cast (${castIds.length ? castIds.map((c) => `"${c}"`).join(', ') : 'the presentation has no cast'})`);
    }

    scene.beats.forEach((beat, bi) => {
      const beatStart = time;
      let prevStart = beatStart;
      let prevEnd = beatStart;
      let beatEnd = beatStart;
      const timing: CompiledBeat['actions'] = [];

      beat.actions.forEach((action, ai) => {
        const at = `${where}.beats.${bi}.actions.${ai}`;
        const start = (action.start === 'with' ? prevStart : prevEnd) + action.delay;

        const targets: string[] = 'target' in action && action.target ? [action.target].flat() : [];
        const missing = targets.filter((id) => !byId.has(id));
        if (missing.length) {
          errors.push(`${at}: unknown element ${missing.map((m) => `"${m}"`).join(', ')}`);
          return;
        }

        const end = compileAction({ action, at, start, targets, state, initial, byId, elements, ops, errors, boxOf, sc });
        if (end === null) return;
        prevStart = start;
        prevEnd = end;
        beatEnd = Math.max(beatEnd, end);
        timing[ai] = { start: start - beatStart, end: end - beatStart };
      });

      beats.push({
        title: beat.title, notes: beat.notes, auto: beat.auto, start: beatStart, end: beatEnd,
        layout: beat.layout ?? scene.layout, track: beat.track ?? scene.track, cue: beat.cue,
        ...(castIds.length ? { speaker: beat.speaker ?? scene.speaker ?? castIds[0] } : {}),
        actions: Array.from({ length: beat.actions.length }, (_, i) => timing[i] ?? { start: 0, end: 0 }),
      });
      time = beatEnd;
    });

    // A chart's value axis covers every value it shows during the scene, so later set-values don't overflow.
    for (const el of elements) {
      if (el.type !== 'chart' || el.max !== undefined) continue;
      const seen = [...el.data.map((d) => d.value), ...(initial[el.id]?.chart?.values ?? []), ...ops.flatMap((o) => (o.kind === 'values' && o.id === el.id ? o.to : []))];
      for (const st of [initial, state]) if (st[el.id]?.chart) st[el.id].chart!.max = niceMax(Math.max(...seen));
    }

    scenes.push({
      id: scene.id,
      title: scene.title,
      ...(scene.skip ? { skip: true } : {}),
      elements,
      initial,
      final: structuredClone(state),
      camera: startCamera,
      layout: scene.layout,
      track: scene.track,
      finalCamera: sc.camera,
      ops,
      beats,
      duration: time,
      above: drawnInSpotlight(ops),
    });
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, presentation: { title: source.title, scenes }, source };
}

/** Elements whose first appearance happens while a spotlight is on. */
export function drawnInSpotlight(ops: Op[]): string[] {
  const lights = ops.filter((o): o is Extract<Op, { kind: 'spotlight' }> => o.kind === 'spotlight').sort((a, b) => a.t - b.t);
  const onAt = (t: number) => {
    let on = false;
    for (const l of lights) if (l.t <= t + 1e-6) on = l.to !== null;
    return on;
  };
  const seen = new Set<string>();
  const above: string[] = [];
  for (const o of [...ops].sort((a, b) => a.t - b.t)) {
    if (o.kind !== 'show' || seen.has(o.id)) continue;
    seen.add(o.id);
    if (onAt(o.t)) above.push(o.id);
  }
  return above;
}
