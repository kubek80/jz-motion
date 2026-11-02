# jz-motion design

A local web app for making technical explainer presentations and videos: a dark board, luminous marker drawings (icons, clipart, charts, isometric 3D, screenshots), arrows, flows, spotlights and a moving camera, stepped through beat by beat and exported to MP4 with narration and camera footage. Built for one person (Jakub) to run on his own computer; LLM first: models write most of the content, held to one style by shared rules and checks.

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
| LLMs | Any OpenAI-compatible endpoint, or the local `claude` command with the user's own subscription (`server/claudeCode.ts`). The system prompt is `docs/style.md` + `docs/format.md` + `docs/library.md` (+ items made in the app); errors go back to the model. Calls go through the local server's `/api/llm`. | One code path for every provider; the docs are the single source of truth for app models and for Claude Code skills alike. |
| Video | A *performance* (when each beat started, recorded from the presenter's clicks or generated) fully determines every frame. Export renders frames exactly in headless Chromium and FFmpeg composites camera tracks and mixes audio. | Natural timing from talking; no screen recording; same output every time. |
| Presentations | A home screen of presentations, each a JSON file in `presentations/` (via the local server), or browser storage without it. Takes remember which presentation they were recorded from. | Organise many videos; files are easy to keep in git. |
| Library | Icons (single-colour line art, 24×24), logos and clipart (multi-colour `parts` drawn in order, any size). Items made in the app are saved in `library/` and loaded at runtime, and listed to the LLM. | One drawing model for everything on the board; AI-made items work everywhere, including export. |
| AI features | One loop for all of them: ask for JSON, check it (compile for presentations, drawing rules for icons), send problems back. Chat edits the open presentation; scripts and transcripts become new presentations; beats get `cue`s from a transcript's timestamps. | Every model output is validated before it touches the board. |
| Timing | Beats. One beat is one presenter click. A video's timing is a *take* (recorded clicks) or beat `cue`s placed on a voice-over in the Timing window (recorded there with a teleprompter, or loaded). An early cue cuts the previous animation short, like an early click. | One data model for live presenting, narration and video. |
| Agent mode | For the Claude Code provider, the app runs Claude Code in the repository with the skills on a draft file and streams every step (`server/claudeAgent.ts`, `src/ai/agent.ts`). One-request models record a trace of what was sent and received (`askJson`). | The same context and loop as Claude Desktop gives the same quality; seeing each step makes skills and prompts tunable. |
| Screen vs board | Elements can be `pinned`: drawn in a screen layer outside the camera. Animated pictures are decoded frame by frame (WebCodecs `ImageDecoder`) into a canvas, driven by the board's clock; export waits for each frame (`Stage.settled`). | Explanations stay readable during zooms; screen recordings play deterministically in exports. |
| Working outside the app | `CLAUDE.md` and skills in `.claude/skills/` let a fresh Claude Code conversation make and change presentations and library items as files; `npm run check` and `npm run snapshot` let it verify and look at its work. | The app is for one person; Claude Code with their subscription is a second, equally capable way in. |

## Concepts

```
Presentation
 ├─ voiceover        optional narration that beat cues refer to
 └─ Scene            a board with elements
     ├─ elements     icon, text, box, arrow, iso (3D), chart, image, area
     ├─ camera       x, y, zoom (where the viewer looks)
     └─ beats        ordered steps; each has timed actions
```

- **Elements** are placed in board units. The board is 1920×1080 at zoom 1.
- **Actions** target elements by id: draw, fade-in, pop, fade-out, erase, pulse, move, recolor, circle, flow, set-values, rotate, spin, explode, spotlight, camera, wait.
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
| `src/engine/render.ts` | `Stage`: builds SVG, the glow and board texture, and a GSAP timeline per scene; pictures in their own layer under the glow; the spotlight; presenter navigation; frame-exact rendering for export. |
| `src/engine/library.ts`, `icons.generated.ts`, `icons.custom.json` | Icon library. `npm run icons` merges Tabler, Simple Icons and the hand-drawn JSON into `icons.generated.ts` and `docs/library.md`. |
| `src/app/` | `Root` (home or an open presentation), `Home` (prompt box `StartBox`), `Timing` (voice-over timeline, narration recording, teleprompter), `images.ts` (paste, drop, upload), `Settings` + `settingsStore.ts` (models, model per start mode, transcription), `Creator` (scene / icon / clipart / 3D with AI), `LibraryManager` (full-screen library), `confirm.tsx` (in-app confirmations), `Editor` (Edit and Play modes, JSON tab, undo/redo, present mode), `store.ts` (files or browser storage). |
| `src/ai/` | LLM work: `client.ts` (ask for JSON with repair loop), `prompt.ts` (docs as context), `assistant.ts` (chat, script, transcript, one new scene, change one scene), `iconPrompt.ts` (rules and checks for icons, clipart and 3D models), model profiles. |
| `src/app/editor/` | Editor: document edit operations (`doc.ts`), schema-generated property forms, library palette, beats editor. |
| `src/video/` | Performances (timing), layout over time, FFmpeg command builder (pure, tested). |
| `src/render/` | The page export drives: board only, frame by frame. |
| `server/` | Local server API (Vite plugin, `api.ts`): presentations, library, images, uploads (voice-overs, served with range requests), LLM proxy (`claudeCode.ts` for the subscription provider), transcription, takes, audio auto-sync, export jobs. Command-line tools: `cli-export.ts`, `cli-check.ts`, `cli-snapshot.ts`. |
| `src/examples/*.json`, `public/examples/` | Example presentations loadable from the app, and their pictures. |
| `docs/style.md`, `docs/format.md`, `docs/library.md` | What models read: style, format, library. Keep them true. |
| `.claude/skills/`, `CLAUDE.md` | Instructions for Claude Code working in this repository. |

## Phases

| # | Goal | Status |
|---|---|---|
| 0 | Format + renderer: draw-on, arrows, flows, camera, glow | Done |
| 1 | Library: clipart, logos, 3D models; items made with AI in a conversation; library window | Done; grows with use |
| 2 | Editor: board editing, properties like a drawing program, beats storyboard, in-place text, screenshots and areas | Done |
| 3 | Presenting: present mode, speaker notes, teleprompter in the Timing window | Basic; no separate presenter screen yet |
| 4 | Charts and data | Done (bar, line, pie, set-values) |
| 5 | LLM first: generation from topic, script or recording; chat, scene ask, repair loop; Claude Code subscription; skills | Done |
| 6 | Video: takes, narration with teleprompter, timing to a voice-over, camera layouts, MP4 export | Done |
| Next | Screen-recording clips on the board, generated narration (text to speech), image models (e.g. via fal.ai), scene transitions | |

## Known limits

- Arrows are placed from where their endpoints are at the start of the scene; they don't follow `move`.
- Text width for camera framing is estimated (the renderer measures the real width for writing).
- The board is 16:9, 1920×1080.
- Claude Code as a provider answers one request at a time per call and only on the computer it is installed on; it cannot transcribe audio.
