---
name: library-item
description: Draw a new icon, multi-colour clipart or isometric 3D model for the jz-motion library (library/<name>.json) in the board's marker style, so presentations and models can use it. Use when a presentation needs a picture the library doesn't have, or when asked to make an icon, clipart, logo-like drawing or 3D model.
---

# Add something to the library

Library items live in `library/<name>.json` (`name`: lowercase letters, digits and `-`, starting with a letter, not already used: check `npm run check -- --library`). The app, exports and every model writing presentations pick them up automatically.

## The rules

The exact rules the app gives models are in `src/ai/iconPrompt.ts`; read the one for the kind you are making:

- **Icon** (`ICON_RULES`): single colour line art on a 24×24 grid, Tabler/Lucide style, 2–12 paths, each one continuous stroke (one `M`), drawn in order. File: `{ "description", "tags", "paths": ["M…", …] }`.
- **Clipart** (`CLIPART_RULES`): multi-colour drawing in a `box` of your choosing, `parts` with marker colours (`green pink yellow cyan orange white`, fill `board` for solid dark), drawn in order. File: `{ "description", "tags", "box": [w, h], "parts": [{ "d", "color", "width", "fill", "fillOpacity" }], "paths": [] }`.
- **3D model** (`ISO_RULES`): boxes and cylinders, y up, stacked exactly, no overlaps, listed bottom to top. File: `{ "kind": "iso", "description", "tags", "parts": [{ "shape", "size": [w, h, d], "at": [x, y, z], "color" }] }`.

The `description` matters: models read it to decide when to use the item. Say what it shows and when it fits.

## Check and look

```sh
npm run check -- library/<name>.json
```

Then put it on a scratch presentation and look at it:

```sh
mkdir -p /tmp/jzm && cat > /tmp/jzm/look.json <<'JSON'
{ "version": 1, "title": "look", "scenes": [{ "id": "s", "elements": [
  { "id": "it", "type": "icon", "icon": "<name>", "x": 960, "y": 520, "size": 400, "color": "cyan", "label": "<name>" }
], "beats": [] }] }
JSON
npm run snapshot -- /tmp/jzm/look.json --out /tmp/jzm
```

(For a 3D model use `{ "type": "iso", "model": "<name>", "scale": 120 }`.) Look at `/tmp/jzm/scene-1.png`: is it recognisable at a glance, clean, in the board's style? Refine until it is. The user can also refine it later in the app (Library → Refine with AI).
