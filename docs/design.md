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
| Export speed | Painting the glowing board in headless Chromium (no GPU) is ~95% of export time; FFmpeg encodes 15× faster than frames arrive. Frames where nothing can move (no tween in the span, no flow, spin, swaying clipart or playing recording) repeat the previous picture; pages draw frames in parallel, one per core (up to 8; 4 for 4K). | Narrated videos hold still a lot; repeating those frames costs nothing and changes no pixel. |
| Screen vs board | Elements can be `pinned`: drawn in a screen layer outside the camera. Recordings are WebM videos (APNG/GIF become WebM in the media library, so there is one way to play them), driven by the board's clock; export seeks each frame exactly and waits for it (`Stage.settled`). Their frames are the distinct pictures (FFmpeg `mpdecimate`, worked out by the server once), so `play` can go to or stop at "frame 5". | Explanations stay readable during zooms; screen recordings play deterministically in exports. |
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
| `src/engine/render.ts` | `Stage`: the board. Adds the editing view (`showLayout`, camera) to `StagePlayer` and hands the editor's helpers (selection, handles, hit-testing, in-place text) to `editing.ts`. |
| `src/engine/player.ts` | `StagePlayer`: the SVG layers and a GSAP timeline per scene; presenter navigation; frame-exact rendering for export; the per-frame redraw. |
| `src/engine/buildElement.ts`, `drawing.ts` | One element's SVG per type; the `stroke` and `write` primitives that record what a draw-on animates. |
| `src/engine/timelineOps.ts`, `sceneState.ts`, `stageNodes.ts` | Ops turned into tweens; a scene's start state and computed redraw; the per-element node types and small pure helpers. |
| `src/engine/animatedPictures.ts`, `spotlight.ts`, `boardBackground.ts` | Scheduling recordings' plays on the timeline (where each one starts, stops and what a cross-fade starts from); the spotlight's dimming; the glow, grain and board texture. |
| `src/engine/videoPictures.ts`, `videoClock.ts` | Recordings on pictures (muted `<video>`): live they play natively and stay in step with the clock; in export each frame is seeked exactly; frame lists from the server, stopping at a frame (`until`), and the cross-fade's second video (`goto` + `fade`). |
| `src/engine/library.ts`, `icons.generated.ts`, `icons.custom.json` | Icon library. `npm run icons` merges Tabler, Simple Icons and the hand-drawn JSON into `icons.generated.ts` and `docs/library.md`. |
| `src/engine/voiceover.ts` | Voice-over clips: reading the older single-recording shape as clips, total length, the clip under a time. |
| `src/app/Root.tsx`, `Home.tsx`, `StartBox.tsx`, `CreateWithAi.tsx`, `store.ts` | Home screen and its prompt box, making a presentation with a model, where presentations are kept (local server files, or browser storage), with stale-write protection. |
| `src/app/App.tsx` | `Editor`: the shell that holds an open presentation's state (undo history, saving, compile, the board) and lays out the parts in `editor/`. |
| `src/app/editor/` | The editor's parts: board mouse handling (`useBoardPointer`), shortcuts (`useEditorKeys`), editing actions (`useEditActions`), paste and drop (`usePictureInput`), in-place text (`InlineTextEditor`), element helpers (`elements.ts`), document operations (`doc.ts`), `SceneList`, `TopBar`, `ModeSwitch` (Edit / Play, above the beats), `PlayControls`, `RightPanel`, `EditorWindows`, the library palette, beats storyboard (`Beats`, `AddActionMenu`; every action's name, explanation and defaults in `actionInfo.ts`; in Play mode it follows the playback and `useLiveOutline` outlines what is animating), scene ask bar (`SceneAsk`: may add a scene after the current one; says what changed via `src/ai/changes.ts`; logs its outcome) and properties (`Inspector`, `ActionEditor` for an action, `Fields` + `fields/`: inputs, pickers, the position grid), `useElementInfo` (element colours and types), `FrameStepper` (under a selected recording: step through its frames, add a go-to or play-to-frame action). |
| `src/app/ContextMenu.tsx` | The right-click menu (scene list, Timing clips and beats). |
| `src/app/timing/` | The Timing window: `Timing.tsx` lays it out; hooks for the clock (`useClock`, `useClipMixer`), the board following it, waveforms and zoom, editing clips, dragging and tapping cues, notes, generated voice, recording narration, loading a voice-over and making a take, and keys; components for the header, script panel, controls, timeline and its minimap (`TimelineMinimap`); `useMissingUploads` finds clips whose recording isn't on this computer; `BeatDrawer` (a beat's options and actions without leaving Timing), `useCleanVoice` (Clean up voice: `server/cleanVoice.ts`, FFmpeg RNNoise with `server/models/`), `TranscriptWindow` transcribes clips (server: `transcribeKept` in `server/transcribe.ts`, kept as `uploads/<file>.transcript.json`) and lays the words out by beat. |
| `src/app/Script.tsx`, `tts.ts` | The Script page (all notes, sentence lengths); generated voice per sentence. |
| `src/app/LibraryManager.tsx`, `Creator.tsx`, `Chat.tsx`, `AiPanel.tsx`, `Activity.tsx`, `ModelSelect.tsx`, `ModelsEditor.tsx`, `Settings.tsx`, `settingsStore.ts` | Library window; making things with AI in a conversation; the AI tab; the live list of what a model did; model menus with recommendations; settings. |
| `src/app/MediaPanel.tsx`, `MediaDetail.tsx`, `MediaThumb.tsx`, `ScreenRecorder.tsx`, `media.ts`, `images.ts` | The Library window's Media section: the grid with filters, import (drop or pick files) and clean-up; recording the screen (browser picker, countdown, trim before keeping; the server trims while converting); the selected item's details, where it is used, rename and delete; tile previews; the client for `/api/media`. `images.ts`: pictures pasted, dropped or picked in the editor go into the media library. |
| `src/app/styles.css`, `styles/` | Styles, split by area into numbered files imported in order (order matters). |
| `src/ai/` | LLM work: `client.ts` (ask for JSON with repair loop and a trace), `agent.ts` (Claude Code agent mode), `prompt.ts` (docs as context), `assistant.ts` (chat, script, transcript, one new scene, change one scene), `iconPrompt.ts` (rules and checks for icons, clipart and 3D models), `recommend.ts` (which model for which job), `profiles.ts`. |
| `src/video/` | Performances (timing), layout over time, FFmpeg command builder (pure, tested). |
| `src/render/` | The page export drives: board only, frame by frame; it also says when a frame can't differ from the one before (`src/engine/stillness.ts`), so the exporter repeats it instead of photographing it. |
| `server/` | Local server API (Vite plugin, `api.ts`): the AI log (`aiLog.ts`, `logs/ai.jsonl`), presentations, library, images, uploads (voice-overs, served with range requests), LLM proxy (`claudeCode.ts`), agent mode (`claudeAgent.ts`), the media library (`mediaStore.ts`: convert on import, index, where used), transcription, generated voice (`tts.ts`), takes, audio auto-sync, export jobs. Command-line tools: `cli-export.ts`, `cli-check.ts`, `cli-snapshot.ts`, `cli-assets.ts`, `cli-media.ts`. |
| `scripts/` | `snap.mjs` and `record.mjs` (capture screenshots and scripted interactions of a web app; scenarios in `scenarios/`), `svg-to-clipart.mjs` and the UnDraw helpers, `import-icons.mjs`, `build-logo.mjs`, `mock-llm.mjs`. |
| `src/examples/*.json`, `public/examples/` | Example presentations loadable from the app, and their pictures. |
| `docs/style.md`, `docs/format.md`, `docs/library.md` | What models read: style, format, library. Keep them true. |
| `.claude/skills/`, `CLAUDE.md` | Instructions for Claude Code working in this repository. |

## Where to change what

| To change… | Look in |
|---|---|
| The format (a new element, action or field) | `src/engine/schema.ts`, then `compile.ts`, `buildElement.ts` / `timelineOps.ts`, and `docs/format.md` |
| How something is drawn or animated | `src/engine/buildElement.ts`, `drawing.ts`, `timelineOps.ts` |
| What models are told | `docs/style.md`, `docs/format.md`, `src/ai/prompt.ts`, `assistant.ts`; for agent mode, `.claude/skills/` |
| Mouse and keyboard on the board | `src/app/editor/useBoardPointer.ts`, `useEditorKeys.ts` |
| The properties panel | `src/app/editor/Inspector.tsx`, `ActionEditor.tsx` (an action), `Fields.tsx`, `fields/` |
| The actions offered and how they are explained | `src/app/editor/actionInfo.ts` (names, explanations, what they work on, defaults), `AddActionMenu.tsx` |
| The Timing window | `src/app/timing/` (start at `Timing.tsx`) |
| Deleting a scene in a timed presentation (closing the gap) | `src/app/editor/closeGap.ts` (used by `removeScene` in `useEditActions.ts`) |
| The media library (pictures, recordings, sounds) | `server/mediaStore.ts` (conversion, trim, index, where used, a recording's frames), `src/app/MediaPanel.tsx`, `MediaDetail.tsx`, `ScreenRecorder.tsx` (Record screen), `media.ts` |
| Export | `server/export.ts`, `src/render/page.ts`, `src/video/` |

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
| 7 | Narration tools: voice clips on two lanes (trim, split, move), generated voice for pacing, Script page | First version |
| Next | The rest of the media plan ([media-plan.md](media-plan.md)): voice clips in the library; image models (e.g. via fal.ai); scene transitions | |

## Known limits

- Arrows are placed from where their endpoints are at the start of the scene; they don't follow `move`.
- Text width for camera framing is estimated (the renderer measures the real width for writing).
- The board is 16:9, 1920×1080.
- Claude Code as a provider answers one request at a time per call and only on the computer it is installed on; it cannot transcribe audio.
