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
  /**
   * Fixed on the screen instead of the board: it stays in place (and in size) while the camera moves.
   * Its x, y are then screen positions on the 1920×1080 frame. For titles, notes and explanations.
   */
  pinned: z.boolean().optional(),
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
  /** "marker" handwriting, "bold" chunky outlined capitals, "code" monospace. New lines ("\n") start new lines. */
  style: z.enum(['marker', 'bold', 'code']).default('marker'),
});

export const BoxElement = z.object({
  ...base,
  type: z.literal('box'),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  radius: z.number().min(0).default(18),
  /** The outline: a (rounded) rectangle, an ellipse, or a diamond (a decision in a flowchart). */
  shape: z.enum(['rect', 'ellipse', 'diamond']).default('rect'),
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
  /** Bend as a fraction of the arrow length; positive bends to the left of the direction of travel (without `via`). */
  curve: z.number().default(0),
  /** Knots: board points the arrow passes through on its way, in order (to go round things, to arrive straight). */
  via: z.array(Point).optional(),
  /** Through its knots: "smooth" curves, or "corners": straight lines with rounded corners. */
  bends: z.enum(['smooth', 'corners']).default('smooth'),
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
  /** Size of the picture itself; the browser and window frames add a bar above it, the phone frame a body round it. */
  width: z.number().positive(),
  height: z.number().positive(),
  /**
   * "browser": a browser window outline drawn around it in marker, in the element's colour. "window": a neutral,
   * solid window (a dark title bar with the three coloured buttons, rounded corners, a soft shadow), as on a Mac.
   * "phone": a phone round it (the picture is its screen: a dark body with a metal edge, rounded screen corners, the
   * camera island and a faint glass sheen), for apps captured in phone format (npm run snap/record -- --phone).
   */
  frame: z.enum(['none', 'browser', 'window', 'phone']).default('none'),
  /** Text in the frame's address bar. */
  url: z.string().optional(),
  /** Animated pictures and videos (APNG, GIF, animated WebP, WebM, MP4): start again at the end instead of stopping on the last frame. */
  loop: z.boolean().default(false),
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
  /**
   * Plays a recording (a video: WebM from the media library, MP4, MOV; muted); it keeps playing between beats until
   * it ends (or loops), or another `play` with "on": false pauses it. Without `play` it shows its first frame.
   * `goto` jumps to a frame (and stays there, unless `until` or "on": true); `until` plays on to a frame and holds it.
   */
  z.object({
    do: z.literal('play'),
    ...timing,
    target: Targets,
    /** Playing (true) or paused (false). Default: playing, except a jump with `goto` (and no `until`) stays still. */
    on: z.boolean().optional(),
    /** Seconds into the recording to jump to first; without it (or `goto`), it continues from where it is. */
    from: z.number().min(0).optional(),
    /** Frame to jump to first (1 is the first frame; frames are the recording's distinct pictures). */
    goto: z.number().int().min(1).optional(),
    /** Play on until this frame (1 is the first), then hold it. With `duration`, it gets there in exactly that time. */
    until: z.number().int().min(1).optional(),
    /** With `goto`: cross-fade from what was showing to the new frame, over `duration` (default 0.5 s). */
    fade: z.boolean().optional(),
    speed: z.number().positive().default(1),
  }),
  z.object({ do: z.literal('wait'), ...timing }),
  /** Moves your avatar (video only) to a place in the frame, gliding over `duration` (default 0.8 s). */
  z.object({ do: z.literal('avatar'), ...timing, layout: z.enum(['board', 'pip', 'pip-left', 'camera', 'side', 'pair', 'studio']) }),
]);

/**
 * How the video frame is laid out while a beat plays (video export only):
 * board = board only; pip / pip-left = board with a small camera bottom-right / bottom-left;
 * camera = camera full screen with the board small; side = two cameras side by side, or with one camera
 * (your avatar) the camera on the left half and the board on the right; pair = the first two in the cast side by
 * side, full frame; studio = the studio wide shot of the cast talking (voiceover.studio), full frame.
 */
export const layoutNames = ['board', 'pip', 'pip-left', 'camera', 'side', 'pair', 'studio'] as const;
const videoLayout = {
  layout: z.enum(layoutNames).optional(),
  /** Which recorded track the camera layouts show, e.g. "me" (default) or "friend". */
  track: z.string().optional(),
};

/** Who says the notes: the id of someone in the presentation's `cast` (default: the scene's, else the first). */
const speaker = { speaker: Id.optional() };

/**
 * Someone who speaks in the presentation (a podcast: you and your guests): `avatar` is the id of one of the avatars
 * in voice/my-avatar.json (the Avatar window), whose look and voice they speak with; `name` is shown in the script.
 */
export const CastMember = z.object({ id: Id, name: z.string(), avatar: z.string() });

export const Beat = z.object({
  title: z.string().optional(),
  /** Speaker notes. */
  notes: z.string().optional(),
  /** Play right after the previous beat instead of waiting for a click. */
  auto: z.boolean().default(false),
  /** Seconds into a recording at which this beat starts (presentations made from a recording). */
  cue: z.number().min(0).optional(),
  ...videoLayout,
  ...speaker,
  actions: z.array(Action),
});

export const Camera = z.object({ x: z.number(), y: z.number(), zoom: z.number().positive() });

export const Scene = z.object({
  id: Id,
  title: z.string().optional(),
  /** Start with the previous scene's visible elements and camera. */
  inherit: z.boolean().default(false),
  /** Left out of the video: Timing, Play all, presenting and export pass over it; it stays in the editor. */
  skip: z.boolean().optional(),
  camera: Camera.optional(),
  /** Video layout for the scene's beats that don't set their own. */
  ...videoLayout,
  /** Who speaks in the scene's beats that don't say. */
  ...speaker,
  elements: z.array(Element).default([]),
  beats: z.array(Beat).default([]),
});

/**
 * One recording placed on the Timing timeline. `upload` is the source file in uploads/; a clip
 * views the window `[trimStart, trimEnd)` of that source and plays back starting at `offset`
 * seconds on `lane` (0 = top, 1 = bottom). Trimming or cutting mid-clip is non-destructive — the
 * underlying file is untouched and the clip can hold several views of the same recording.
 */
const Clip = z.object({
  id: z.string(),
  upload: z.string(),
  sourceDuration: z.number().positive(),
  offset: z.number().min(0).default(0),
  lane: z.number().int().min(0).max(1).default(0),
  trimStart: z.number().min(0).default(0),
  trimEnd: z.number().positive(),
  name: z.string().optional(),
  /** The original recording, when `upload` is a cleaned-up copy of it (Clean up voice). */
  cleanedFrom: z.string().optional(),
  /** Volume change in dB, in Timing and in the video (to even out a quiet or loud clip). */
  gain: z.number().min(-24).max(24).optional(),
  /** The scene this narration belongs to (its id): it moves with the scene, and is left out with it. */
  scene: z.string().optional(),
  /** Who speaks in it (an id in the `cast`): their avatar says it. */
  speaker: z.string().optional(),
  /**
   * Your avatar saying this clip: a talking-head video in uploads/ made from the clip's `trimStart`–`trimEnd` (those
   * at the time), shown in the video wherever a layout shows the camera.
   */
  avatar: z.object({ video: z.string(), trimStart: z.number().min(0), trimEnd: z.number().positive() }).optional(),
});

export const Presentation = z.object({
  version: z.literal(1),
  title: z.string(),
  /** The people who speak (a podcast); none: just you, as before. */
  cast: z.array(CastMember).optional(),
  /** The cast together in a studio: the picture the studio wide shots are made from (uploads/), and their sharpness. */
  studio: z.object({ picture: z.string(), resolution: z.enum(['480p', '720p']).default('480p') }).optional(),
  scenes: z.array(Scene).min(1),
  /**
   * The narration beats are timed to: each beat's `cue` is seconds into the whole timeline.
   * Two shapes are accepted here:
   *   - Legacy single clip: `{ upload, duration, name? }` — one recording from offset 0 on lane 0.
   *   - Multi-clip: `{ clips: [...] }` — several recordings on two lanes with their own offsets
   *     and trims. Takes precedence when present; legacy fields are then ignored.
   * `clipsOf()` in src/engine/voiceover.ts normalises either shape to a Clip[] everything else uses.
   */
  voiceover: z.object({
    upload: z.string().optional(),
    duration: z.number().positive().optional(),
    name: z.string().optional(),
    clips: z.array(Clip).optional(),
    /**
     * Studio wide shots: videos of the cast talking together (uploads/), each placed at `offset` seconds on the
     * timeline for `length` seconds (at most about 9.6 s each), shown where the layout is `studio`.
     */
    studio: z.array(z.object({ video: z.string(), offset: z.number().min(0), length: z.number().positive(), scene: z.string().optional() })).optional(),
  }).optional(),
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
export type Clip = z.infer<typeof Clip>;
export type CastMember = z.infer<typeof CastMember>;
export type Voiceover = NonNullable<Presentation['voiceover']>;
