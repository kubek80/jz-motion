# Presentation format

A presentation is one JSON document. This page is the reference for writing one by hand or with an LLM. The schema in `src/engine/schema.ts` is the source of truth; the app shows validation errors with their path (for example `scenes.0.beats.2.actions.1: unknown element "db"`).

## Shape

```json
{
  "version": 1,
  "title": "What is RAG",
  "scenes": [
    {
      "id": "overview",
      "title": "Overview",
      "inherit": false,
      "camera": { "x": 960, "y": 540, "zoom": 1 },
      "elements": [ ... ],
      "beats": [ { "title": "...", "notes": "...", "auto": false, "actions": [ ... ] } ]
    }
  ]
}
```

- **Board coordinates**: at zoom 1 the camera shows x 0–1920, y 0–1080, with y going down. Elements can be placed outside that area and reached with the camera.
- **ids** start with a letter and use letters, digits, `-` and `_`. They are unique within a scene, including inherited elements.
- **Colors**: `green`, `pink`, `yellow`, `cyan`, `orange`, `white` (default).
- **`inherit: true`**: the scene starts with the previous scene's visible elements (where they ended up, in their final colors) and its final camera. Add new elements alongside them.
- **`camera`**: the starting camera. Defaults to the full board, or the previous camera when inheriting.

## Elements

All elements take `id`, `color` and optionally `visible`. An element that a beat reveals (`draw`, `fade-in`, `pop`) starts hidden; everything else starts visible. Set `visible` to override.

| type | Fields | Notes |
|---|---|---|
| `icon` | `icon`, `x`, `y`, `size` (120), `label` | `x`, `y` is the center. Label is written under the icon. Names of icons, logos and clipart: [library.md](library.md). Clipart is multi-coloured (`color` only affects its uncoloured parts) and `size` is its width. |
| `text` | `text`, `x`, `y`, `size` (56), `align` (`middle`, `start`, `end`), `style` (`marker`, `bold`, `code`) | `marker`: handwriting (default). `bold`: chunky outlined capitals for headlines, like the logo. `code`: monospace for code; its lines keep their indentation and line up on the left. `\n` starts a new line. `y` is the vertical middle. |
| `box` | `x`, `y`, `width`, `height`, `radius` (18), `label`, `line` (`solid`, `dashed`, `dotted`), `weight` (`normal`, `bold`) | `x`, `y` is the center. Label is written inside. |
| `arrow` | `from`, `to`, `curve` (0), `head` (`end`, `start`, `both`, `none`), `label`, `line` (`solid`, `dashed`, `dotted`), `weight` (`normal`, `bold`: thicker, bigger head) | See below. |
| `iso` | `model` or `parts`, `x`, `y`, `scale` (70), `rotate` (0), `label` | Isometric 3D object, see below. `x`, `y` is its middle. |
| `chart` | `kind` (`bar`, `line`, `pie`), `data`, `x`, `y`, `width` (640), `height` (380), `title`, `unit` (""), `max`, `values` (true) | See below. `x`, `y` is its middle. |
| `image` | `src`, `x`, `y`, `width`, `height`, `frame` (`none`, `browser`), `url`, `label` | A screenshot or picture. See below. |
| `area` | `x`, `y`, `width`, `height`, `shape` (`rect`, `ellipse`) | A marked region, not drawn: target it with `circle`, `spotlight` or `camera`. `x`, `y` is its middle. |

### Arrows

`from` and `to` are either an element id, `"id.anchor"`, or a point `{ "x": 100, "y": 200 }`.

- With a plain id, the arrow attaches to the side facing the other end.
- Anchors: `center`, `top`, `bottom`, `left`, `right`, `top-left`, `top-right`, `bottom-left`, `bottom-right`. The bottom of an icon is below its label.
- `curve` bends the arrow: `0.2` is a gentle bend to the left of the direction of travel, negative bends right.
- The label sits above the arrow (to the side for vertical arrows).
- `"dashed": true` (older files) is the same as `"line": "dashed"`.

### Isometric 3D (`iso`)

A 3D object drawn in the same marker style: outlines in its color, faces filled with the board color so hidden edges stay hidden. Use a preset `model` from [library.md](library.md#3d-iso-models), or build your own from `parts`:

```json
{ "id": "rack", "type": "iso", "x": 960, "y": 540, "scale": 90, "color": "cyan", "parts": [
  { "shape": "box", "size": [2, 0.4, 1.4], "at": [0, 0, 0] },
  { "shape": "box", "size": [2, 0.4, 1.4], "at": [0, 0.5, 0], "color": "pink" },
  { "shape": "cylinder", "size": [0.6, 0.3, 0.6], "at": [0, 0.9, 0] }
] }
```

- World units: `y` points up; `at` is the center of the part's bottom face; `size` is width (x), height (y), depth (z). A cylinder's width is its diameter.
- `scale` is board units per world unit. `rotate` turns the object around its vertical axis (degrees).
- Parts are boxes and cylinders that should not overlap each other. A part's own `color` overrides the element color.
- `draw` builds the object part by part, in the order of `parts`.

### Screenshots (`image`)

```json
{ "id": "shot", "type": "image", "src": "/images/9a10139fc3473100.png", "x": 960, "y": 540, "width": 1100, "height": 690,
  "frame": "browser", "url": "myapp.com/settings", "color": "cyan" },
{ "id": "save-button", "type": "area", "x": 1320, "y": 760, "width": 220, "height": 90 }
```

- `src` is a picture added in the app (`/images/<file>`). Don't invent one: only use `src` values already in the presentation.
- `width` × `height` is the picture itself; `"frame": "browser"` draws a browser window around it in marker (in the element's colour) with `url` in its address bar, adding a bar above the picture. The picture and its bar together are centered on `x`, `y`.
- Pictures always sit under the marker drawing, so arrows, text and circles can be drawn on top of them.
- `draw` draws the frame, then reveals the picture left to right.
- To point at part of a screenshot, put an `area` over it, then `circle`, `spotlight` or `camera` → `focus` on the area.

### Charts

```json
{ "id": "speed", "type": "chart", "kind": "bar", "x": 960, "y": 560, "width": 1000, "height": 600, "color": "cyan",
  "title": "tokens per second", "unit": "",
  "data": [ { "label": "GPU", "value": 120 }, { "label": "Mac", "value": 45, "color": "pink" } ] }
```

- `data` is a list of `{ "label", "value", "color" }`; values are 0 or more. A data item's `color` overrides the chart color; pie slices without a color get different colors automatically.
- `draw` writes the title and draws the axes, then grows the bars one after another with overlap (or traces the line, its dots popping in as it reaches them, or sweeps the slices) while the values count up. The growing takes most of the draw time.
- `set-values` animates the chart to new numbers. The value axis is scaled to fit every value the chart shows in the scene; set `max` to fix it.
- `unit` is appended to the value labels, for example `"%"` or `" GB"`.

## Video layout

For video export, a beat or a scene can say where the recorded camera goes while it plays. A beat without one uses its scene's; the default is `pip`.

| `layout` | Frame |
|---|---|
| `board` | The board only. |
| `pip` | The board, with the camera small in the bottom-right corner. |
| `pip-left` | The same, bottom-left. |
| `camera` | The camera full screen, with the board small in the top-right corner. |
| `side` | Two cameras side by side (the `track` one on the left). |

`track` names the recording to show, for example `"me"` (default) or `"friend"`. Layouts fall back gracefully: without a camera recording every layout shows the board.

```json
{ "title": "Over to Marek", "layout": "camera", "track": "friend", "actions": [ ... ] }
```

## Beats and actions

A beat is one click while presenting. Its actions run in order: each starts when the previous one ends, unless it says `"start": "with"` (start together with the previous action). Every action also takes `delay` (seconds) and `duration` (seconds, default depends on the action). A beat with `"auto": true` plays straight after the previous beat. A beat's `cue` (seconds) is when it starts in a recording or voice-over: the video plays each beat at its cue (set them in the app's **Timing** window). A cue that comes before the previous beat has finished cuts that beat short, like an early click; cues must not go backwards. A top-level `"voiceover": { "upload", "duration", "name" }` names the narration the cues refer to (a file kept by the local server).

Actions with `target` accept one id or a list. With a list, targets start `stagger` seconds apart (default 0.25).

| `do` | Extra fields | Default duration | What it does |
|---|---|---|---|
| `draw` | | icon/box 1.2, arrow 0.8, text ~0.06 per character | Draws strokes in order, then writes labels. Text is written left to right. |
| `fade-in` | | 0.5 | |
| `pop` | | 0.45 | Scales in with a bounce. |
| `fade-out` | | 0.5 | |
| `erase` | | 0.6 | Fades out with a blur smear. Stops flows on it. |
| `pulse` | `times` (1) | 0.5 per pulse | Grows and shrinks to draw attention. |
| `move` | `to: {x, y}` | 1 | Not for arrows (arrows don't follow moves yet). |
| `recolor` | `color` | 0.4 | |
| `circle` | `color` (yellow), `id` | 0.7 | Draws a hand-drawn loop around the target(s). The loop is an element with id `id` or `<target>-circle`, so it can be erased later. |
| `flow` | `on` (true), `reverse` (false), `speed` (160) | instant | Dots travel along an arrow and keep going between beats. `"on": false` stops them. Arrows only. |
| `set-values` | `values` (one number per data item) | 1.2 | Animates a chart to new values. |
| `rotate` | `to` or `by` (90) | 1.2 | Turns an iso object to an angle or by an amount, in degrees. |
| `spin` | `on` (true), `speed` (30) | instant | Keeps an iso object turning (degrees per second) between beats. `"on": false` stops it. |
| `explode` | `amount` (0.6) | 1.2 | Pushes an iso object's parts apart from its middle; `0` puts them back together. |
| `spotlight` | `target`, `on` (true), `style` (`dark`, `fade`), `amount` (0.7), `shape` (`rect`, `ellipse`; default: the area's shape), `padding` (24) | 0.6 | Darkens (or fades into the board) everything outside the target(s) and keeps it that way between beats; another `spotlight` moves the light, `"on": false` turns it off. Things drawn while it is on stay bright. |
| `camera` | `focus`, `padding` (120), `x`, `y`, `zoom` | 1.3 | `focus` is an id, a list of ids, or `"all"` (everything visible at that moment); the camera frames them with `padding` screen pixels around. Without `focus`, moves to `x`/`y`/`zoom` (any omitted value stays). `zoom` together with `focus` overrides the fitted zoom. |
| `wait` | | 1 | Pause inside a beat. |

## Example

```json
{
  "version": 1,
  "title": "Request flow",
  "scenes": [{
    "id": "flow",
    "elements": [
      { "id": "user", "type": "icon", "icon": "user", "x": 400, "y": 540, "color": "pink", "label": "user" },
      { "id": "api", "type": "box", "x": 960, "y": 540, "width": 260, "height": 140, "color": "cyan", "label": "API" },
      { "id": "db", "type": "icon", "icon": "database", "x": 1500, "y": 540, "color": "green", "label": "Postgres" },
      { "id": "req", "type": "arrow", "from": "user", "to": "api", "label": "request" },
      { "id": "query", "type": "arrow", "from": "api", "to": "db", "label": "SQL" }
    ],
    "beats": [
      { "title": "Caller", "actions": [{ "do": "draw", "target": ["user", "req", "api"], "stagger": 0.8 }] },
      { "title": "Storage", "actions": [
        { "do": "draw", "target": ["query", "db"], "stagger": 0.6 },
        { "do": "flow", "target": ["req", "query"] }
      ] },
      { "title": "Focus on the API", "actions": [
        { "do": "camera", "focus": "api", "padding": 300 },
        { "do": "circle", "target": "api", "color": "pink" }
      ] }
    ]
  }]
}
```

## Layout tips

- Leave about 150 units between an icon's label and anything below it.
- Icons of size 120–160 and text of 40–60 read well at zoom 1. Use smaller text only for details you zoom into.
- Put detail elements near what they explain, then `camera` + `focus` on them; zoom back with `"focus": "all"`.
