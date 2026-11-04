import type { IsoPart } from '../engine/iso';
import type { ClipartPart, IconDef } from '../engine/library';
import { colorNames } from '../engine/palette';
import { splitSubpaths } from '../engine/pathSplit';
import type { ChatMessage, Check } from './client';

// Asking a model to draw an icon or clipart for the library. The rules below are sent with the
// person's description, and shown to them, so it is clear what the model is held to.

export type DrawingKind = 'icon' | 'clipart' | 'logo';

export const ICON_RULES = `Draw a single-colour line icon for a glowing-marker blackboard, in the style of Tabler / Lucide outline icons.
- Grid: 24×24 units. Keep every point between 2 and 22.
- Line art only: open or closed strokes, no fills, no text. It is drawn with a stroke about 2 units wide, so leave at least 2 units between parallel lines and avoid details smaller than 2 units.
- 2 to 12 paths. Each path is one continuous stroke (a single M at the start), listed in the order a person would draw them: main outline first, details last. They are animated stroke by stroke in this order.
- Path commands: M L H V C S Q T A Z (absolute or relative) with plain numbers.
- It must read clearly at 30 pixels: simple, recognisable silhouette, centred on the grid.
Reply with one JSON object: {"description": "<what it shows and when to use it>", "tags": ["..."], "paths": ["M...", "..."]}`;

export const LOGO_RULES = `Draw a brand logo mark for a glowing-marker blackboard: thin neon outlines tracing filled shapes, on a 24×24 grid.
- Grid: 24×24 units. Keep every point between 1 and 23 so the mark sits within the usual icon frame.
- Trace the silhouette of each filled shape as a closed path (ending in Z). The renderer strokes each path thinly and fades in a faint fill at the end, so the result reads as the brand mark glowing on the dark board.
- 1 to 8 paths. Each path is one continuous stroke (a single M at the start), listed in the drawing order (largest shape first, then smaller details and cutouts). Path commands: M L H V C S Q T A Z.
- Do not pre-apply colours — on the board, the logo takes the element's marker colour; the fill is the same colour at low opacity, added automatically.
- "stroke" (optional, 0.4-1.2) overrides the default thin stroke width when the brand has very fine or very thick lines. "tags" must include "logo" so the renderer picks the filled-shape mode and the library groups it under Logos.
- It must read clearly at 30 pixels: use the brand's actual silhouette, keep proportions.
Reply with one JSON object: {"description": "<what brand or symbol>", "tags": ["logo", "..."], "paths": ["M...Z", "..."], "stroke": <optional width>}`;

export const CLIPART_RULES = `Draw a multi-colour illustration for a glowing-marker blackboard: neon marker lines on a near-black board.
- Pick a drawing area "box": [width, height] between 60 and 1000 units each (e.g. [240, 160]); keep all points inside it.
- The drawing is a list of "parts", drawn one after another in the order given (animated stroke by stroke): big shapes first, details last.
- Each part: {"d": "<path>", "color": "<colour>", "width": <stroke width 1.5-8>, "fill": "<colour>" (optional), "fillOpacity": <0-1> (optional), "opacity": <0-1> (optional), "transform": "<svg transform>" (optional)}.
- Colours, only these names: ${colorNames.join(', ')}, plus "board" (the dark board colour, for solid fills that hide what is behind) and "ink" (the element's own marker colour at render time).
- CRITICAL — the "ink" colour is what makes a clipart RECOLOURABLE on the board: the person placing it picks a marker colour on the element and every "ink" part retints to that colour. So use "ink" for the dominant mass of the picture (silhouettes, main shapes, structural outlines) — typically 60-90% of all parts. Reserve the fixed palette colours (cyan/pink/yellow/orange/green/white) ONLY for small accents that should look the same regardless of marker (skin tones, warning flags, brand colours). A clipart with no "ink" parts is a bug: it can't be recoloured.
- Neon style: bright coloured outlines; fills either "board" (solid dark) or a colour with fillOpacity 0.12-0.6 (the engine pre-mixes dim fills with the board so they read as a solid darker colour, not a see-through overlay). Use 1 dominant ("ink") + 0-3 fixed accents. No text.
- 2 to 120 parts — small freehand illustrations are 3-20 parts; richer composite scenes (characters with props, multi-element layouts) can go up to 120.
- Path commands: M L H V C S Q T A Z with plain numbers.
Reply with one JSON object: {"description": "<what it shows>", "tags": ["..."], "box": [w, h], "parts": [...]}`;

const RULES_FOR: Record<DrawingKind, string> = { icon: ICON_RULES, clipart: CLIPART_RULES, logo: LOGO_RULES };

export function drawingMessages(kind: DrawingKind, description: string): ChatMessage[] {
  return [
    { role: 'system', content: RULES_FOR[kind] },
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

    if (kind === 'icon' || kind === 'logo') {
      const paths = Array.isArray(v.paths) ? v.paths : [];
      const [lo, hi] = kind === 'logo' ? [1, 8] : [1, 16];
      if (paths.length < lo || paths.length > hi) errors.push(`"paths" must have ${lo === 1 ? '1' : '2'} to ${hi === 8 ? '8' : '12'} paths (got ${paths.length})`);
      paths.forEach((d, i) => {
        if (pathOk(d, `paths.${i}`) && splitSubpaths(d as string).length > 1) errors.push(`paths.${i}: one continuous stroke per path (it has several M commands); split it into separate paths`);
      });
      const stroke = kind === 'logo' ? v.stroke : undefined;
      if (stroke !== undefined && !(typeof stroke === 'number' && stroke >= 0.3 && stroke <= 2)) errors.push('"stroke" must be a number 0.3-2');
      if (errors.length) return { ok: false, errors };
      const styleTags = kind === 'logo' && !tags.includes('logo') ? ['logo', ...tags] : tags;
      return {
        ok: true,
        value: {
          description,
          tags: ['made-with-ai', ...styleTags],
          paths: paths as string[],
          ...(kind === 'logo' ? { style: 'logo' as const } : {}),
          ...(typeof stroke === 'number' ? { stroke } : {}),
        },
      };
    }

    const box = v.box;
    if (!Array.isArray(box) || box.length !== 2 || !box.every((n) => typeof n === 'number' && n >= 20 && n <= 2000)) errors.push('"box" must be [width, height] with numbers between 60 and 600');
    const parts = Array.isArray(v.parts) ? v.parts : [];
    // 120 parts fits the imported external clipart (UnDraw tiles) that are legitimately more
    // complex than anything a model would draw from scratch.
    if (parts.length < 1 || parts.length > 120) errors.push(`"parts" must have 1 to 120 parts (got ${parts.length})`);
    // "ink" is the element's own colour at render time — used by imported external clipart so a
    // single tile recolours by changing the element's marker.
    const colours = new Set<string>([...colorNames, 'board', 'ink']);
    parts.forEach((p: Record<string, unknown>, i) => {
      if (!p || typeof p !== 'object') return errors.push(`parts.${i} must be an object`);
      pathOk(p.d, `parts.${i}.d`);
      for (const key of ['color', 'fill']) {
        if (p[key] !== undefined && !colours.has(p[key] as string)) errors.push(`parts.${i}.${key}: "${p[key]}" is not one of ${[...colours].join(', ')}`);
      }
      if (p.width !== undefined && !(typeof p.width === 'number' && p.width > 0 && p.width <= 20)) errors.push(`parts.${i}.width must be a number from 1.5 to 8`);
      if (p.fillOpacity !== undefined && !(typeof p.fillOpacity === 'number' && p.fillOpacity >= 0 && p.fillOpacity <= 1)) errors.push(`parts.${i}.fillOpacity must be between 0 and 1`);
      if (p.opacity !== undefined && !(typeof p.opacity === 'number' && p.opacity >= 0 && p.opacity <= 1)) errors.push(`parts.${i}.opacity must be between 0 and 1`);
      if (p.transform !== undefined && typeof p.transform !== 'string') errors.push(`parts.${i}.transform must be an SVG transform string`);
    });
    if (errors.length) return { ok: false, errors };
    const clean: ClipartPart[] = parts.map((p: Record<string, unknown>) => ({
      d: p.d as string,
      ...(p.color ? { color: p.color as ClipartPart['color'] } : {}),
      ...(typeof p.width === 'number' ? { width: p.width } : {}),
      ...(p.fill ? { fill: p.fill as ClipartPart['fill'] } : {}),
      ...(typeof p.fillOpacity === 'number' ? { fillOpacity: p.fillOpacity } : {}),
      ...(typeof p.opacity === 'number' ? { opacity: p.opacity } : {}),
      ...(typeof p.transform === 'string' ? { transform: p.transform } : {}),
    }));
    return { ok: true, value: { description, tags: ['clipart', 'made-with-ai', ...tags], paths: [], box: box as [number, number], parts: clean } };
  };
}

export const ISO_RULES = `Build an isometric 3D model from boxes, cylinders and spheres, for a glowing-marker blackboard (drawn as neon outlines with dim dark faces).
- World units, y points up. "at" is the centre of a part's bottom face [x, y, z]; "size" is [width, height, depth] (for a cylinder, width = depth = diameter; for a sphere, size[0] is the diameter — size[1] and size[2] are ignored but write them equal to size[0] for clarity).
- A whole model is about 2 to 5 units across; parts are 0.1 to 4 units.
- Stack parts exactly: a part resting on another has at[1] = the lower part's at[1] + its size[1]. Parts must not overlap (touching is fine).
- Shapes: use "sphere" for round things (heads, planets, bulbs, berries, dots, balls). A sphere shades as a flat dim disc in the element's colour — fine for small details and heads, less convincing for very large shapes.
- 2 to 30 parts, listed bottom to top and back to front: the model is built part by part in this order.
- Optional "color" per part: ${colorNames.join(', ')} (without one, a part takes the element's colour).
Reply with one JSON object: {"description": "<what it is>", "tags": ["..."], "parts": [{"shape": "box" | "cylinder" | "sphere", "size": [w, h, d], "at": [x, y, z], "color": "<optional>"}]}`;

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
    if (p?.shape !== 'box' && p?.shape !== 'cylinder' && p?.shape !== 'sphere') errors.push(`parts.${i}.shape must be "box", "cylinder" or "sphere"`);
    if (!nums(p?.size, 3, (x) => x > 0 && x <= 20)) errors.push(`parts.${i}.size must be [w, h, d] with numbers above 0`);
    // A sphere's diameter is size[0]; coerce size[1] and size[2] to match so stacking rules
    // (at[1] = lower.at[1] + lower.size[1]) behave the way the shape actually renders.
    if (p?.shape === 'sphere' && Array.isArray(p.size) && typeof p.size[0] === 'number') {
      (p.size as unknown as number[])[1] = p.size[0];
      (p.size as unknown as number[])[2] = p.size[0];
    }
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

/** A follow-up in a conversation about one item: the reply it changes, and what to change. */
export interface Refinement { previous: unknown; change: string }

export const CHANGE_PREFIX = 'Change it:';

/**
 * The messages for a conversation about one item (icon, clipart, 3D model or scene): the first request,
 * then for every follow-up the version it refers to and the change asked for. The model always replies
 * with the whole item again, under the same rules, so every reply is checked the same way.
 */
export function refineMessages(first: ChatMessage[], steps: Refinement[]): ChatMessage[] {
  return [
    ...first,
    ...steps.flatMap((s): ChatMessage[] => [
      { role: 'assistant', content: JSON.stringify(s.previous) },
      { role: 'user', content: `${CHANGE_PREFIX} ${s.change}

Reply with the whole thing again as one JSON object. Start from the JSON you just produced — do not regenerate it from scratch. Every part not touched by the change above must come back byte-identical (same d, color, width, fill, fillOpacity, opacity, transform, and in the same order). The reply should differ from the previous JSON only where this change requires it: add parts to introduce new shapes, change the d/color/width/fill of specific parts to modify them, remove parts to delete shapes.

Preserve recolourability. If a part's color or fill is "ink" in the previous JSON, KEEP it as "ink" — do not replace with a fixed palette colour like "cyan" or "white". "ink" is what makes a clipart recolour when the user changes the element's marker; replacing it with a specific colour breaks that core feature. If the user explicitly asks to change the dominant colour, they want it to STAY as "ink" (the element colour picker on the board drives it), not pinned to a specific palette entry. Only introduce fixed palette colours for small accents or when adding a brand-new element that genuinely shouldn't recolour.

If the previous JSON uses "ink" fills, a large part count, or dimensions outside the usual limits, trust it — it came from an imported illustration and the rules above describe the fresh-draw case, not a reason to replace it.` },
    ]),
  ];
}
