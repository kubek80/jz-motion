import { z } from 'zod';
import { colorNames } from './palette';

// The presentation format. docs/format.md describes it for people and LLMs; keep them in sync.

export const anchorNames = [
  'center', 'top', 'bottom', 'left', 'right',
  'top-left', 'top-right', 'bottom-left', 'bottom-right',
] as const;
export type AnchorName = (typeof anchorNames)[number];

const Color = z.enum(colorNames);
const Point = z.object({ x: z.number(), y: z.number() });
/** "id", "id.anchor" or a board point. */
const Ref = z.union([z.string().min(1), Point]);
const Id = z.string().regex(/^[A-Za-z][\w-]*$/, 'ids start with a letter and use letters, digits, - or _');

const base = {
  id: Id,
  color: Color.default('white'),
  /** Visible before any beat. Defaults to false when a beat reveals the element, true otherwise. */
  visible: z.boolean().optional(),
};

export const IconElement = z.object({
  ...base,
  type: z.literal('icon'),
  icon: z.string(),
  x: z.number(),
  y: z.number(),
  size: z.number().positive().default(120),
  label: z.string().optional(),
});

export const TextElement = z.object({
  ...base,
  type: z.literal('text'),
  text: z.string(),
  x: z.number(),
  y: z.number(),
  size: z.number().positive().default(56),
  align: z.enum(['start', 'middle', 'end']).default('middle'),
});

export const BoxElement = z.object({
  ...base,
  type: z.literal('box'),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  radius: z.number().min(0).default(18),
  label: z.string().optional(),
  /** Border: solid, dashed or dotted. */
  line: z.enum(['solid', 'dashed', 'dotted']).optional(),
  /** Border thickness. */
  weight: z.enum(['normal', 'bold']).default('normal'),
  /** Older way to say line "dashed". */
  dashed: z.boolean().default(false),
});

export const ArrowElement = z.object({
  ...base,
  type: z.literal('arrow'),
  from: Ref,
  to: Ref,
  /** Bend as a fraction of the arrow length; positive bends to the left of the direction of travel. */
  curve: z.number().default(0),
  head: z.enum(['end', 'start', 'both', 'none']).default('end'),
  label: z.string().optional(),
  /** Solid, dashed or dotted line. */
  line: z.enum(['solid', 'dashed', 'dotted']).optional(),
  /** "bold": a thicker line and a bigger head. */
  weight: z.enum(['normal', 'bold']).default('normal'),
  /** Older way to say line "dashed". */
  dashed: z.boolean().default(false),
});

const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
export const IsoPart = z.object({
  shape: z.enum(['box', 'cylinder']),
  /** Width (x), height (y), depth (z) in world units; for a cylinder x is the diameter. */
  size: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
  /** Center of the part's bottom face; y points up. */
  at: Vec3.default([0, 0, 0]),
  color: Color.optional(),
});

/** Isometric 3D object: a preset `model` from the library or your own `parts`. */
export const IsoElement = z.object({
  ...base,
  type: z.literal('iso'),
  model: z.string().optional(),
  parts: z.array(IsoPart).optional(),
  x: z.number(),
  y: z.number(),
  /** Board units per world unit. */
  scale: z.number().positive().default(70),
  /** Starting turn around the vertical axis, degrees. */
  rotate: z.number().default(0),
  label: z.string().optional(),
});

export const ChartElement = z.object({
  ...base,
  type: z.literal('chart'),
  kind: z.enum(['bar', 'line', 'pie']).default('bar'),
  /** Center of the chart. */
  x: z.number(),
  y: z.number(),
  width: z.number().positive().default(640),
  height: z.number().positive().default(380),
  data: z.array(z.object({ label: z.string(), value: z.number().min(0), color: Color.optional() })).min(1),
  /** Top of the value axis (bar and line). Defaults to a round number above the largest value. */
  max: z.number().positive().optional(),
  /** Appended to value labels, e.g. "%" or " GB". */
  unit: z.string().default(''),
  title: z.string().optional(),
  /** Show the value of each bar, point or slice. */
  values: z.boolean().default(true),
});

/** A picture, usually a screenshot, optionally framed as a browser window drawn in marker. */
export const ImageElement = z.object({
  ...base,
  type: z.literal('image'),
  /** Where the picture is: "/images/<file>" (pasted or added in the app), or a data: URL. */
  src: z.string().min(1),
  /** Center of the picture (with its frame). */
  x: z.number(),
  y: z.number(),
  /** Size of the picture itself; the browser frame adds a bar above it. */
  width: z.number().positive(),
  height: z.number().positive(),
  /** "browser": a browser window outline drawn around it, in the element's colour. */
  frame: z.enum(['none', 'browser']).default('none'),
  /** Text in the browser frame's address bar. */
  url: z.string().optional(),
  label: z.string().optional(),
});

/** A marked region, e.g. part of a screenshot, for circle, spotlight and camera. Not drawn itself. */
export const AreaElement = z.object({
  ...base,
  type: z.literal('area'),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  shape: z.enum(['rect', 'ellipse']).default('rect'),
});

export const Element = z.discriminatedUnion('type', [IconElement, TextElement, BoxElement, ArrowElement, IsoElement, ChartElement, ImageElement, AreaElement]);

const Targets = z.union([Id, z.array(Id).min(1)]);
const timing = {
  /** "after" (default) starts when the previous action ends, "with" starts together with it. */
  start: z.enum(['after', 'with']).default('after'),
  delay: z.number().min(0).default(0),
  duration: z.number().positive().optional(),
};
const targeted = { ...timing, target: Targets, stagger: z.number().min(0).default(0.25) };

export const Action = z.discriminatedUnion('do', [
  z.object({ do: z.literal('draw'), ...targeted }),
  z.object({ do: z.literal('fade-in'), ...targeted }),
  z.object({ do: z.literal('pop'), ...targeted }),
  z.object({ do: z.literal('fade-out'), ...targeted }),
  z.object({ do: z.literal('erase'), ...targeted }),
  z.object({ do: z.literal('pulse'), ...targeted, times: z.number().int().positive().default(1) }),
  z.object({ do: z.literal('move'), ...targeted, to: Point }),
  z.object({ do: z.literal('recolor'), ...targeted, color: Color }),
  /** Animates a chart to new values, one per data item. */
  z.object({ do: z.literal('set-values'), ...targeted, values: z.array(z.number().min(0)).min(1) }),
  z.object({ do: z.literal('rotate'), ...targeted, to: z.number().optional(), by: z.number().optional() }),
  z.object({ do: z.literal('explode'), ...targeted, amount: z.number().min(0).default(0.6) }),
  z.object({
    do: z.literal('spin'),
    ...timing,
    target: Targets,
    on: z.boolean().default(true),
    /** Degrees per second. */
    speed: z.number().default(30),
  }),
  z.object({ do: z.literal('circle'), ...timing, target: Targets, id: Id.optional(), color: Color.default('yellow') }),
  z.object({
    do: z.literal('flow'),
    ...timing,
    target: Targets,
    on: z.boolean().default(true),
    reverse: z.boolean().default(false),
    /** Board units per second. */
    speed: z.number().positive().default(160),
  }),
  z.object({
    do: z.literal('camera'),
    ...timing,
    /** Element id(s) to frame, or "all" for everything visible. */
    focus: z.union([Id, z.array(Id).min(1)]).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    zoom: z.number().positive().optional(),
    /** Space around the focused elements, in screen pixels at 1920×1080. */
    padding: z.number().min(0).default(120),
  }),
  /**
   * Darkens (or fades) everything outside the targets so they stand out; stays on between beats.
   * "on": false turns it off; a new spotlight moves the light to new targets.
   */
  z.object({
    do: z.literal('spotlight'),
    ...timing,
    target: Targets.optional(),
    on: z.boolean().default(true),
    /** "dark": everything else goes darker; "fade": everything else fades into the board. */
    style: z.enum(['dark', 'fade']).default('dark'),
    /** How strongly, 0 to 1. */
    amount: z.number().min(0).max(1).default(0.7),
    /** Shape of the light; defaults to the area's own shape, else a rounded rectangle. */
    shape: z.enum(['rect', 'ellipse']).optional(),
    /** Room around the targets, in board units. */
    padding: z.number().min(0).default(24),
  }),
  z.object({ do: z.literal('wait'), ...timing }),
]);

/**
 * How the video frame is laid out while a beat plays (video export only):
 * board = board only; pip / pip-left = board with a small camera bottom-right / bottom-left;
 * camera = camera full screen with the board small; side = two cameras side by side.
 */
export const layoutNames = ['board', 'pip', 'pip-left', 'camera', 'side'] as const;
const videoLayout = {
  layout: z.enum(layoutNames).optional(),
  /** Which recorded track the camera layouts show, e.g. "me" (default) or "friend". */
  track: z.string().optional(),
};

export const Beat = z.object({
  title: z.string().optional(),
  /** Speaker notes. */
  notes: z.string().optional(),
  /** Play right after the previous beat instead of waiting for a click. */
  auto: z.boolean().default(false),
  /** Seconds into a recording at which this beat starts (presentations made from a recording). */
  cue: z.number().min(0).optional(),
  ...videoLayout,
  actions: z.array(Action),
});

export const Camera = z.object({ x: z.number(), y: z.number(), zoom: z.number().positive() });

export const Scene = z.object({
  id: Id,
  title: z.string().optional(),
  /** Start with the previous scene's visible elements and camera. */
  inherit: z.boolean().default(false),
  camera: Camera.optional(),
  /** Video layout for the scene's beats that don't set their own. */
  ...videoLayout,
  elements: z.array(Element).default([]),
  beats: z.array(Beat).default([]),
});

export const Presentation = z.object({
  version: z.literal(1),
  title: z.string(),
  scenes: z.array(Scene).min(1),
});

export type LayoutName = (typeof layoutNames)[number];
export type Point = z.infer<typeof Point>;
export type Ref = z.infer<typeof Ref>;
export type Element = z.infer<typeof Element>;
export type IconElement = z.infer<typeof IconElement>;
export type TextElement = z.infer<typeof TextElement>;
export type BoxElement = z.infer<typeof BoxElement>;
export type ArrowElement = z.infer<typeof ArrowElement>;
export type IsoElement = z.infer<typeof IsoElement>;
export type ChartElement = z.infer<typeof ChartElement>;
export type Action = z.infer<typeof Action>;
export type Beat = z.infer<typeof Beat>;
export type Camera = z.infer<typeof Camera>;
export type Scene = z.infer<typeof Scene>;
export type Presentation = z.infer<typeof Presentation>;
