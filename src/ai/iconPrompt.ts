import type { IsoPart } from '../engine/iso';
import type { ClipartPart, IconDef } from '../engine/library';
import { colorNames } from '../engine/palette';
import { splitSubpaths } from '../engine/pathSplit';
import type { ChatMessage, Check } from './client';

// Asking a model to draw an icon or clipart for the library. The rules below are sent with the
// person's description, and shown to them, so it is clear what the model is held to.

export type DrawingKind = 'icon' | 'clipart';

export const ICON_RULES = `Draw a single-colour line icon for a glowing-marker blackboard, in the style of Tabler / Lucide outline icons.
- Grid: 24×24 units. Keep every point between 2 and 22.
- Line art only: open or closed strokes, no fills, no text. It is drawn with a stroke about 2 units wide, so leave at least 2 units between parallel lines and avoid details smaller than 2 units.
- 2 to 12 paths. Each path is one continuous stroke (a single M at the start), listed in the order a person would draw them: main outline first, details last. They are animated stroke by stroke in this order.
- Path commands: M L H V C S Q T A Z (absolute or relative) with plain numbers.
- It must read clearly at 30 pixels: simple, recognisable silhouette, centred on the grid.
Reply with one JSON object: {"description": "<what it shows and when to use it>", "tags": ["..."], "paths": ["M...", "..."]}`;

export const CLIPART_RULES = `Draw a multi-colour illustration for a glowing-marker blackboard: neon marker lines on a near-black board.
- Pick a drawing area "box": [width, height] between 60 and 600 units each (e.g. [240, 160]); keep all points inside it.
- The drawing is a list of "parts", drawn one after another in the order given (animated stroke by stroke): big shapes first, details last.
- Each part: {"d": "<path>", "color": "<colour>", "width": <stroke width 1.5-8>, "fill": "<colour>" (optional), "fillOpacity": <0-1> (optional)}.
- Colours, only these names: ${colorNames.join(', ')}, plus "board" (the dark board colour, for solid fills that hide what is behind).
- Neon style: bright coloured outlines; fills either "board" (solid dark) or a colour at fillOpacity 0.1-0.25. Use 2 to 4 colours. No text.
- 3 to 40 parts. Path commands: M L H V C S Q T A Z with plain numbers.
Reply with one JSON object: {"description": "<what it shows>", "tags": ["..."], "box": [w, h], "parts": [...]}`;

export function drawingMessages(kind: DrawingKind, description: string): ChatMessage[] {
  return [
    { role: 'system', content: kind === 'icon' ? ICON_RULES : CLIPART_RULES },
    { role: 'user', content: `Draw: ${description}` },
  ];
}

const PATH = /^[MLHVCSQTAZmlhvcsqtaz0-9.,\s+-eE]+$/;

/** Checks a drawing reply against the rules and turns it into a library entry. */
export function checkDrawing(kind: DrawingKind) {
  return (value: unknown): Check<IconDef> => {
    const errors: string[] = [];
    const v = value as Record<string, unknown>;
    if (!v || typeof v !== 'object') return { ok: false, errors: ['reply with a JSON object'] };
    const description = typeof v.description === 'string' && v.description.trim() ? v.description.trim() : '';
    if (!description) errors.push('"description" is missing');
    const tags = Array.isArray(v.tags) ? v.tags.filter((t): t is string => typeof t === 'string') : [];
    const pathOk = (d: unknown, where: string) => {
      if (typeof d !== 'string' || !d.trim()) return errors.push(`${where}: a path must be a non-empty string`), false;
      if (!PATH.test(d) || !/^\s*[Mm]/.test(d)) return errors.push(`${where}: use only M L H V C S Q T A Z commands and numbers, starting with M`), false;
      return true;
    };

    if (kind === 'icon') {
      const paths = Array.isArray(v.paths) ? v.paths : [];
      if (paths.length < 1 || paths.length > 16) errors.push(`"paths" must have 2 to 12 paths (got ${paths.length})`);
      paths.forEach((d, i) => {
        if (pathOk(d, `paths.${i}`) && splitSubpaths(d as string).length > 1) errors.push(`paths.${i}: one continuous stroke per path (it has several M commands); split it into separate paths`);
      });
      if (errors.length) return { ok: false, errors };
      return { ok: true, value: { description, tags: ['made-with-ai', ...tags], paths: paths as string[] } };
    }

    const box = v.box;
    if (!Array.isArray(box) || box.length !== 2 || !box.every((n) => typeof n === 'number' && n >= 20 && n <= 2000)) errors.push('"box" must be [width, height] with numbers between 60 and 600');
    const parts = Array.isArray(v.parts) ? v.parts : [];
    if (parts.length < 1 || parts.length > 60) errors.push(`"parts" must have 3 to 40 parts (got ${parts.length})`);
    const colours = new Set<string>([...colorNames, 'board']);
    parts.forEach((p: Record<string, unknown>, i) => {
      if (!p || typeof p !== 'object') return errors.push(`parts.${i} must be an object`);
      pathOk(p.d, `parts.${i}.d`);
      for (const key of ['color', 'fill']) {
        if (p[key] !== undefined && !colours.has(p[key] as string)) errors.push(`parts.${i}.${key}: "${p[key]}" is not one of ${[...colours].join(', ')}`);
      }
      if (p.width !== undefined && !(typeof p.width === 'number' && p.width > 0 && p.width <= 20)) errors.push(`parts.${i}.width must be a number from 1.5 to 8`);
      if (p.fillOpacity !== undefined && !(typeof p.fillOpacity === 'number' && p.fillOpacity >= 0 && p.fillOpacity <= 1)) errors.push(`parts.${i}.fillOpacity must be between 0 and 1`);
    });
    if (errors.length) return { ok: false, errors };
    const clean: ClipartPart[] = parts.map((p: Record<string, unknown>) => ({
      d: p.d as string,
      ...(p.color ? { color: p.color as ClipartPart['color'] } : {}),
      ...(typeof p.width === 'number' ? { width: p.width } : {}),
      ...(p.fill ? { fill: p.fill as ClipartPart['fill'] } : {}),
      ...(typeof p.fillOpacity === 'number' ? { fillOpacity: p.fillOpacity } : {}),
    }));
    return { ok: true, value: { description, tags: ['clipart', 'made-with-ai', ...tags], paths: [], box: box as [number, number], parts: clean } };
  };
}

export const ISO_RULES = `Build an isometric 3D model from boxes and cylinders, for a glowing-marker blackboard (drawn as neon outlines with dark faces).
- World units, y points up. "at" is the centre of a part's bottom face [x, y, z]; "size" is [width, height, depth] (for a cylinder, width = depth = diameter).
- A whole model is about 2 to 5 units across; parts are 0.1 to 4 units.
- Stack parts exactly: a part resting on another has at[1] = the lower part's at[1] + its size[1]. Parts must not overlap (touching is fine).
- 2 to 30 parts, listed bottom to top and back to front: the model is built part by part in this order.
- Optional "color" per part: ${colorNames.join(', ')} (without one, a part takes the element's colour).
Reply with one JSON object: {"description": "<what it is>", "tags": ["..."], "parts": [{"shape": "box" | "cylinder", "size": [w, h, d], "at": [x, y, z], "color": "<optional>"}]}`;

export interface IsoModelDef { kind: 'iso'; description: string; tags: string[]; parts: IsoPart[] }

export function isoMessages(description: string): ChatMessage[] {
  return [{ role: 'system', content: ISO_RULES }, { role: 'user', content: `Build: ${description}` }];
}

export function checkIso(value: unknown): Check<IsoModelDef> {
  const v = value as Record<string, unknown>;
  if (!v || typeof v !== 'object') return { ok: false, errors: ['reply with a JSON object'] };
  const errors: string[] = [];
  const description = typeof v.description === 'string' ? v.description.trim() : '';
  if (!description) errors.push('"description" is missing');
  const parts = Array.isArray(v.parts) ? v.parts : [];
  if (parts.length < 1 || parts.length > 40) errors.push(`"parts" must have 2 to 30 parts (got ${parts.length})`);
  const nums = (a: unknown, n: number, ok: (x: number) => boolean) => Array.isArray(a) && a.length === n && a.every((x) => typeof x === 'number' && ok(x));
  parts.forEach((p: Record<string, unknown>, i) => {
    if (p?.shape !== 'box' && p?.shape !== 'cylinder') errors.push(`parts.${i}.shape must be "box" or "cylinder"`);
    if (!nums(p?.size, 3, (x) => x > 0 && x <= 20)) errors.push(`parts.${i}.size must be [w, h, d] with numbers above 0`);
    if (!nums(p?.at, 3, (x) => Math.abs(x) <= 50)) errors.push(`parts.${i}.at must be [x, y, z]`);
    if (p?.color !== undefined && !(colorNames as readonly string[]).includes(p.color as string)) errors.push(`parts.${i}.color "${p.color}" is not one of ${colorNames.join(', ')}`);
  });
  if (errors.length) return { ok: false, errors };
  const tags = Array.isArray(v.tags) ? v.tags.filter((t): t is string => typeof t === 'string') : [];
  return {
    ok: true,
    value: {
      kind: 'iso', description, tags: ['made-with-ai', ...tags],
      parts: parts.map((p: Record<string, unknown>) => ({ shape: p.shape, size: p.size, at: p.at, ...(p.color ? { color: p.color } : {}) }) as IsoPart),
    },
  };
}
