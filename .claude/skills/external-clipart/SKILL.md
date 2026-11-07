---
name: external-clipart
description: Bring high-quality SVG clipart from external libraries (UnDraw, and later StorySet, Open Peeps, LottieFiles) into jz-motion as scene-ready `image` elements, restyled to the house palette so they sit cleanly on the dark board. Use when a scene needs an illustration richer than the built-in icons but that doesn't belong in the iso primitive family — characters, scenes, objects with personality.
---

# External clipart, restyled for jz-motion

The built-in icon library is line art on a 24×24 grid — great for diagrams, generic for characters and scenes. When a slide needs *a person at a laptop with floating widgets*, drawing it from primitives doesn't work (iso is blocky, flat SVG from scratch is too simple). The answer is to **import a real illustration** from a permissively-licensed external pack, restyle it to our palette, and drop it in as a scene `image`.

This skill is the pipeline: fetch → restyle → import into the media library → use.

## What's supported today

- **Source**: [UnDraw](https://undraw.co) — MIT, no attribution required, 600+ illustrations, one primary accent colour per file that's easy to remap.
- **Mode**: `palette` — remap UnDraw's whole colour set to the jz-motion palette, preserve the illustration structure. Light greys dissolve into the dark board; dark navies become `white` so they stay visible; the primary accent (`#6c63ff`) becomes whichever accent you pick (`cyan`, `pink`, `yellow`, `orange`, `green`).
- **Output**: regular jz-motion `image` elements whose `src` is the restyled SVG in the media library (`/media/<hash>.svg`, kept as a drawing).

## Not yet supported (but noted)

- **Outline mode** — fills → neon strokes — needed a proper SVG parser; the regex pass broke the files. Skip until that's built.
- **Animated clipart** (LottieFiles etc.) — Lottie is JSON, not SVG. Would need a different loader. Design later if static tiles aren't enough.
- **Other packs** (Open Peeps, StorySet, Figma Community) — the fetcher is UnDraw-specific. Adding a new source = a new fetch script, same recolour script.

## The three commands

```sh
# 1. One-off fetch (useful for testing a specific tile).
node scripts/fetch-undraw.mjs <search-term> <filename> "<Exact Title>"

# 2. Batch fetch the shortlist at the top of batch-undraw.mjs.
node scripts/batch-undraw.mjs

# 3. Restyle every SVG in library/undraw/ into scratch/clipart/<name>-palette-<accent>.svg.
#    Run once per accent you want (cyan, pink, yellow, orange, green):
node scripts/restyle-svg.mjs --mode palette --accent cyan
node scripts/restyle-svg.mjs --mode palette --accent pink

# 4. Bring the variant you use into the media library; it prints the src for the scene.
npm run media -- import scratch/clipart/undraw-team-palette-cyan.svg --name "team (UnDraw, cyan)"
```

Raw SVGs live in `library/undraw/`; restyled variants land in `scratch/clipart/` (working files, not in git). Only what you import into the media library is referenced from presentations; check `media/index.json` first, the variant may already be there.

## Adding new tiles

**Option A — edit the batch.** Open `scripts/batch-undraw.mjs`, add rows to `BATCH` as `[searchQuery, exactTitle, filename]`, run it. Fetches in one browser session, ~5 s per tile.

The *exactTitle* must match UnDraw's card label character-for-character (case matters: `Designer`, not `designer`). If a title fails, open [undraw.co](https://undraw.co/search), search the term, hover a card and copy its exact label.

**Option B — one-shot fetch** for a single new tile: `node scripts/fetch-undraw.mjs programmer programmer "Programmer"`.

Then re-run `restyle-svg.mjs` for each accent you want: the new file appears as `scratch/clipart/undraw-programmer-palette-<accent>.svg`; import the one you use.

## Using a tile in a scene

Plain `image` element:

```json
{
  "id": "team-pic",
  "type": "image",
  "src": "/media/<hash>.svg",
  "x": 960, "y": 540,
  "width": 600, "height": 400,
  "color": "white"
}
```

Pick the accent that matches the beat's mood. `color` on the element has no effect on the illustration (it's baked into the SVG at restyle time); set it for consistency only.

## When to reach for this skill vs. the alternatives

| Need | Use |
|---|---|
| A generic icon of a thing | Built-in `icon` (library.md) |
| A real screenshot of an app | `demo-interactions` → `npm run snap` |
| A short recording of app motion | `demo-interactions` → `npm run record` |
| A rich illustration with character and context | **This skill** — UnDraw tile |
| A hand-drawn diagram in marker style | `box` + `arrow` + palette icons |
| A 3D-looking object | Was `iso` — scrapped; use clipart instead |

## Choose the accent that fits the beat

- **Cyan** — default, calm, "work being done", observations.
- **Pink** — emphasis, high-energy, "the key move".
- **Yellow** — warning, attention, callout.
- **Orange** — warmth, stuck, running out, deadline.
- **Green** — success, positive, go-ahead.

Picking the same accent that other elements on the slide use ties the tile into the composition. Picking a different accent makes it the hero — use when it *is* the hero.

## Current tile catalogue (12)

| Name | What it shows |
|---|---|
| `designer` | Person at laptop with floating design tools |
| `programmer` | Dev working on multi-monitor setup |
| `team` | 3×3 grid of avatar circles |
| `server` | Rack + person walking by |
| `ideas` | Person sitting with lightbulb floating above |
| `data` | Person with data-viz dashboards |
| `mobile-apps` | Person with phone + app shapes |
| `chat` | Two people chatting with speech bubbles |
| `pie-chart` | Pie chart + small figure |
| `launching` | Rocket launching |
| `online-world` | Person browsing with a globe |
| `startup-life` | Office scene, people working |

Extend by editing `scripts/batch-undraw.mjs` and re-running.

## Honest limits

- **Style mix.** Even restyled, UnDraw tiles don't look like our hand-drawn marker aesthetic — they're flat illustrations. On a slide where everything else is marker + arrows, a tile is a *visual guest*. Works well when the tile *is* the slide; collides when it fights iso/marker elements for attention.
- **Palette remap preserves UnDraw's style.** It's not a style conversion — it's a palette change. The illustrations remain "obvious UnDraw" if you know the look. That's the price of quality content without drawing it yourself.
- **Accent remap only.** We swap `#6c63ff` and the structural dark/light colours. Secondary accents like UnDraw's pink (`#ff6584`) are also mapped (to `pink`). Skin tones (`#ed9da0`) map to `orange`. If a specific tile has off-palette colours (gradients, hard-coded greens), they'll still look native to UnDraw.
- **No rotation / facing.** UnDraw illustrations are single-angle. If you need a figure facing the other way, find a different tile that already faces that way.

## Checks

```sh
npm run check -- presentations/<id>.json       # validates every image src exists and renders
npm run snapshot -- presentations/<id>.json --scene N --beats
```

Open the PNG for each beat that uses a tile. Specifically ask: does the tile fit on the slide, or does it dominate? Does its accent colour fight anything else on the slide? Is it the right size — too big and it feels like an ad; too small and it loses detail.
