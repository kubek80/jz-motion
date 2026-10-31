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
| `icon` | `icon`, `x`, `y`, `size` (120), `label` | `x`, `y` is the center. Label is written under the icon. Icon names: [library.md](library.md). |
| `text` | `text`, `x`, `y`, `size` (56), `align` (`middle`, `start`, `end`) | Handwritten marker font. `y` is the vertical middle of the line. |
| `box` | `x`, `y`, `width`, `height`, `radius` (18), `label`, `dashed` | `x`, `y` is the center. Label is written inside. |
| `arrow` | `from`, `to`, `curve` (0), `head` (`end`, `start`, `both`, `none`), `label`, `dashed` | See below. |

### Arrows

`from` and `to` are either an element id, `"id.anchor"`, or a point `{ "x": 100, "y": 200 }`.

- With a plain id, the arrow attaches to the side facing the other end.
- Anchors: `center`, `top`, `bottom`, `left`, `right`, `top-left`, `top-right`, `bottom-left`, `bottom-right`. The bottom of an icon is below its label.
- `curve` bends the arrow: `0.2` is a gentle bend to the left of the direction of travel, negative bends right.
- The label sits above the arrow (to the side for vertical arrows).

## Beats and actions

A beat is one click while presenting. Its actions run in order: each starts when the previous one ends, unless it says `"start": "with"` (start together with the previous action). Every action also takes `delay` (seconds) and `duration` (seconds, default depends on the action). A beat with `"auto": true` plays straight after the previous beat.

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
