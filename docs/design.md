# jz-motion design

A web app for technical explainer presentations and videos: a dark blackboard, luminous marker drawings, animated clipart, arrows, flows, charts and a moving camera. Aimed at app and AI development topics. Later it records explainer videos, with camera footage of the presenters.

## Decisions so far

| Topic | Decision | Why |
|---|---|---|
| Platform | Web app first (Vite + React + TypeScript). Electron later only if needed. | Familiar stack; can go online later. |
| What content is | A JSON presentation (scenes, elements, beats), validated by a schema. | Editable field by field; the same format for the editor, the player and LLMs. |
| Rendering | SVG plus GSAP timelines, outside React. | Sharp at any zoom, stroke draw-on is native, timelines can seek, and GSAP is what HyperFrames uses for video export later. |
| Board model | One board per scene; a scene can `inherit` the previous scene's visible elements and camera. | Covers both "slides" and "one big board". |
| Marker colors | green, pink, yellow, cyan, orange, white, referenced by name. | Recoloring is one field; consistent look. |
| Clipart | Stroke icons from Tabler (MIT), plus hand-drawn ones in `icons.custom.json` (hardware so far). More are added as needed. | Single-line paths draw on perfectly. |
| Logos | Brand logos from Simple Icons (CC0), drawn as a thin neon outline with a faint fill. OpenAI is hand-drawn (not in Simple Icons). | Recognisable, still in the board style. |
| 3D | `iso` elements: three.js does the 3D math and isometric projection; faces are drawn as SVG paths filled with the board color. | 3D objects glow, draw on and zoom exactly like the rest; no second rendering style. |
| Glow | Tight inner glow plus a dimmed soft halo, crisp stroke on top; handwriting at weight 700. | Saturated colors without blurring text. |
| LLMs | Any OpenAI-compatible endpoint; the system prompt is `docs/format.md` + `docs/library.md`; compile errors go back to the model. Calls go through the dev server's `/api/llm` proxy. | One code path for OpenRouter, RunPod and self-hosted; docs stay the single source of truth. |
| Timing | Beats. One beat is one presenter click. In video mode beats play back to back. | One data model for live presenting and video. |

## Concepts

```
Presentation
 └─ Scene            a board with elements
     ├─ elements     icon, text, box, arrow, iso (3D), chart
     ├─ camera       x, y, zoom (where the viewer looks)
     └─ beats        ordered steps; each has timed actions
```

- **Elements** are placed in board units. The board is 1920×1080 at zoom 1.
- **Actions** target elements by id: draw, fade, pop, erase, pulse, move, recolor, circle, flow, camera, wait.
- **Arrows and camera targets refer to ids**, not coordinates, so moving an element keeps the scene consistent. Arrows pick the facing sides of what they connect unless an anchor is given (`"db.top"`).
- **Flows** (dots travelling along an arrow) keep running while the presenter pauses between beats.

## Code layout

| Path | What |
|---|---|
| `src/engine/schema.ts` | The format (zod). Source of truth. |
| `src/engine/compile.ts` | Validates and turns a presentation into a timed plan per scene (pure, unit tested). |
| `src/engine/geometry.ts` | Bounds, anchors, arrow paths, camera framing. |
| `src/engine/chart.ts` | Bar, line and pie charts, redrawn from animated values. |
| `src/engine/iso.ts`, `iso-models.json` | Isometric 3D: projection, hidden faces, paint order; preset models. |
| `src/engine/render.ts` | `Stage`: builds SVG, the glow and board texture, and a GSAP timeline per scene; presenter navigation. |
| `src/engine/library.ts`, `icons.generated.ts`, `icons.custom.json` | Icon library. `npm run icons` merges Tabler, Simple Icons and the hand-drawn JSON into `icons.generated.ts` and `docs/library.md`. |
| `src/app/` | App: Edit and Play modes, JSON tab, undo/redo, present mode. |
| `src/ai/` | LLM generation: system prompt built from the docs, client with repair loop, model profiles. |
| `src/app/editor/` | Editor: document edit operations (`doc.ts`), schema-generated property forms, library palette, beats editor. |
| `src/examples/*.json` | Example presentations, loadable from the app. |

## Phases

| # | Goal | Status |
|---|---|---|
| 0 | Format + renderer: draw-on, arrows, flows, camera, glow; JSON playground | Done |
| 1 | Library v1: more clipart (made together as needed), groups, reusable composite elements | |
| 2 | Editor: place and move elements on the board, property panel, beat timeline editing | Done (first version) |
| 3 | Present mode polish: speaker notes view, scene transitions | Basic version done |
| 4 | Charts (bars grow, line draws, counters) and hand-drawn custom clipart | Charts done (bar, line, pie, set-values) |
| 5 | LLM docs and generation: a model writes scenes that load; model switching via OpenRouter / RunPod | First version: AI tab, compare, repair loop |
| Later | Video: export through HyperFrames, presenter camera overlays, layouts (picture-in-picture, side by side) | |

## Known limits (phase 0)

- Arrows are placed from where their endpoints are at the start of the scene; they don't follow `move`.
- Text width for camera framing is estimated (the renderer measures the real width for writing).
- The board is 16:9, 1920×1080.
