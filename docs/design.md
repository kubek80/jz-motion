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
| `src/engine/videoPictures.ts`, `videoClock.ts`, `videoStill.ts` | Recordings on pictures (muted `<video>`): live they play natively and stay in step with the clock; in export each frame is seeked exactly to where the plays put the clip at that moment (`clipAtTime`, from every play scheduled, never from the frames a page drew before, so export pages drawing every few frames agree) and painted on a canvas over the video (`VideoStill`: a video frame may not be on screen yet when the picture is taken; the avatar layer does the same); frame lists from the server, stopping at a frame (`until`), and the cross-fade's second video (`goto` + `fade`). |
| `src/engine/library.ts`, `icons.generated.ts`, `icons.custom.json` | Icon library. `npm run icons` merges Tabler, Simple Icons and the hand-drawn JSON into `icons.generated.ts` and `docs/library.md`. |
| `src/engine/voiceover.ts` | Voice-over clips: reading the older single-recording shape as clips, total length, the clip under a time. |
| `src/app/Root.tsx`, `Home.tsx`, `StartBox.tsx`, `CreateWithAi.tsx`, `store.ts` | Home screen and its prompt box, making a presentation with a model, where presentations are kept (local server files, or browser storage), with stale-write protection. |
| `src/app/route.ts` | Where you are, in the address (`#/p/<id>/timing/script?scene=5&tab=video&t=65.9&at=5.2`): the windows open over the editor, the scene, the right panel's tab, Timing's playhead and the Script's beat; read when the editor opens (a reload lands where you were), written as you move (`replaceRoute`, no new history entries; `useAddress` for the editor's part). Tested. |
| `src/app/App.tsx` | `Editor`: the shell that holds an open presentation's state (undo history, saving, compile, the board) and lays out the parts in `editor/`. |
| `src/app/editor/` | The editor's parts: board mouse handling (`useBoardPointer`), shortcuts (`useEditorKeys`), editing actions (`useEditActions`), paste and drop (`usePictureInput`), in-place text (`InlineTextEditor`), element helpers (`elements.ts`), document operations (`doc.ts`), `SceneList`, `TopBar` (with the app's full screen button; `src/app/fullscreen.ts` tells it from presenting the board), `ModeSwitch` (Edit / Play, above the beats), `PlayControls`, `RightPanel`, `EditorWindows`, the library palette, beats storyboard (`Beats`, `AddActionMenu`; every action's name, explanation and defaults in `actionInfo.ts`; in Play mode it follows the playback and `useLiveOutline` outlines what is animating), scene ask bar (`SceneAsk`: may add a scene after the current one; says what changed via `src/ai/changes.ts`; logs its outcome) and properties (`Inspector`, `ActionEditor` for an action, `Fields` + `fields/`: inputs, pickers, the position grid), `useElementInfo` (element colours and types), `FrameStepper` (under a selected recording: step through its frames, add a go-to or play-to-frame action). |
| `src/app/ContextMenu.tsx` | The right-click menu (scene list, Timing clips and beats). |
| `src/app/timing/` | The Timing window: `Timing.tsx` lays it out; hooks for the clock (`useClock`, `useClipMixer`), the board following it, waveforms and zoom, editing clips, dragging and tapping cues, notes, generated voice, recording narration, loading a voice-over and making a take, and keys; components for the header, script panel, controls, timeline and its minimap (`TimelineMinimap`); `useMissingUploads` finds clips whose recording isn't on this computer; `BeatDrawer` (a beat's options and actions without leaving Timing), `useCleanVoice` (Clean up voice: `server/cleanVoice.ts`, FFmpeg RNNoise with `server/models/`), `TranscriptWindow` transcribes clips (server: `transcribeKept` in `server/transcribe.ts`, kept as `uploads/<file>.transcript.json`) and lays the words out by beat. `ClipDetail` is a clip's window (double-click): it works on the whole recording, the clip and the pieces it was cut into (`clipChain.ts`: finding them, removing a part with or without closing the gap, tested); `ClipWave` (its wave on a decibel scale with loudness over time, its average and the target, beat marks, selection, loop, a player for it alone), its loudness (`server/loudness.ts`, FFmpeg loudnorm analysis) and volume (`gain`, applied by the mixer and the export), its actions, `MicCheck` (`useMicLevel`: the chosen input's level live; `micDevice.ts` keeps the choice, used by every recording) and recording it again (`useRerecord`: the take, and `replaceTake` fitting it into the timeline) or generating it again (`/api/voice/join` in `server/voiceJoin.ts`: several beats' lines as one clip, shared with `npm run voice`), `AvatarBoard` (Timing's board with your avatar, drawn as the export draws it: `src/video/avatarPlan.ts` works out where it and the board are at any moment, gliding between layouts and holding the last frame, `src/render/avatarLayer.ts` places them; the export's render page uses the same two), `src/app/AvatarVideo.tsx` (an avatar video, or why it can't play: not downloaded, missing), `avatarJobs.ts` (avatars being made, followed for Timing: each lands on its clip when ready, window open or not), `AvatarDrawer` (a video-lane block clicked: the avatar and where it shows, the scene's layout), `AvatarLane` (the video lane: each avatar under its clip, out-of-date ones marked, scenes waiting for one), `src/app/editor/AvatarStill.tsx` (a still of it on the editor's board), and `AvatarSection` (your avatar saying the clip: `server/avatar.ts` makes it on fal.ai as a job the window polls, remembered per clip so closing the window doesn't lose it; `makeTake` turns the clips' avatars into one camera track, `buildAvatarTrack`). Clip-window changes go through `onTimeline` (clips and cues as one change, one undo). `src/app/AvatarWindow.tsx` (🧑 Avatar): your avatars, each with its voice, and the one in use (`/api/me`: `readAvatars`, `useAvatar`, `newAvatar`, `renameAvatar`, `deleteAvatar` in `server/avatar.ts`; choosing one writes its voice to `voice/my-voice.json`, and saving the voice remembers it on the avatar in use, `rememberVoice`), with `MyAvatar` and `MyVoice` embedded as its Look and Voice tabs. `src/app/MyAvatar.tsx`: the avatar in use (its picture, a styled version made by an image model, how it moves), with `server/myAvatarRoutes.ts` (its routes, the styling, jobs) and `server/avatar.ts` (`voice/my-avatar.json`, making talking-head videos on fal.ai, a take's avatar track). `src/app/MyVoice.tsx`: the voice sample cloning copies (record it from a suggested text, hear it, choose the model), kept with the project by `server/myVoice.ts` (`voice/my-voice.json`, the sample in `uploads/voice-sample-*`), which `npm run voice` uses by default. |
| `src/app/Script.tsx`, `ScriptSceneVoice.tsx`, `ScriptCast.tsx`, `sceneVoice.ts`, `tts.ts` | The Script page (all notes, sentence lengths; opened from Timing at the beat at the playhead, `at`) with each scene's voice beside it (play, Generate, Generate again: `generateSceneVoice` in `sceneVoice.ts`, also used by Timing's `useSceneVoice`; `/api/voice/scene`, `server/sceneVoice.ts`, shared with `npm run voice`); generated voice per sentence; `[directions]` for the voice in notes (`withoutDirections`: left out wherever the script is shown; `server/tts.ts` sends them only to models that follow them); `VoiceDirections.tsx` explains them with samples to listen to (`directionSampleList.ts` lists them; `server/directionSamples.ts` makes them in the voice in use: `/api/voice/direction-samples`, `voice/direction-samples.json`, `uploads/direction-sample-*.mp3`). A podcast's cast (`ScriptCast.tsx`: the people, each one of your avatars, and a speaker label on each scene and beat; the compiled beat's `speaker`); `voicerFor` in `server/sceneVoice.ts` speaks each run of beats in its speaker's avatar voice, one clip per run with its `speaker`, and avatar videos use that speaker's avatar (`startAvatar`, `server/avatar.ts`). |
| `src/app/LibraryManager.tsx`, `Creator.tsx`, `Chat.tsx`, `AiPanel.tsx`, `Activity.tsx`, `ModelSelect.tsx`, `ModelsEditor.tsx`, `Settings.tsx`, `settingsStore.ts` | Library window; making things with AI in a conversation; the AI tab; the live list of what a model did; model menus with recommendations; settings. |
| `src/app/MediaPanel.tsx`, `MediaDetail.tsx`, `MediaThumb.tsx`, `ScreenRecorder.tsx`, `media.ts`, `images.ts` | The Library window's Media section: the grid with filters, import (drop or pick files) and clean-up; recording the screen (browser picker, countdown, trim before keeping; the server trims while converting); the selected item's details, where it is used, rename and delete; tile previews; the client for `/api/media`. `images.ts`: pictures pasted, dropped or picked in the editor go into the media library. |
| `src/app/styles.css`, `styles/` | Styles, split by area into numbered files imported in order (order matters). |
| `src/ai/` | LLM work: `client.ts` (ask for JSON with repair loop and a trace), `agent.ts` (Claude Code agent mode), `prompt.ts` (docs as context), `assistant.ts` (chat, script, transcript, one new scene, change one scene), `iconPrompt.ts` (rules and checks for icons, clipart and 3D models), `recommend.ts` (which model for which job), `profiles.ts`. |
| `src/video/` | Performances (timing; scenes left out with `skip` take no time), layout over time, FFmpeg command builder, making room on the voice-over timeline for a new scene (`makeRoom.ts`), recordings that belong to scenes (`sceneTimeline.ts`: lays playing scenes out again with their clips and cues when scenes move, are left out or put back; hides left-out scenes' clips) (pure, tested). |
| `src/render/` | The page export drives: board only, frame by frame; it also says when a frame can't differ from the one before (`src/engine/stillness.ts`), so the exporter repeats it instead of photographing it. |
| `server/` | Local server API (Vite plugin, `api.ts`): the AI log (`aiLog.ts`, `logs/ai.jsonl`), presentations, library, images, uploads (voice-overs, served with range requests), LLM proxy (`claudeCode.ts`), agent mode (`claudeAgent.ts`), the media library (`mediaStore.ts`: convert on import, index, where used), transcription, generated voice (`tts.ts`: any /audio/speech service; a voice sample for cloning models, a style, PCM-only models converted, busy answers retried), takes, audio auto-sync, export jobs. Command-line tools: `cli-export.ts`, `cli-check.ts`, `cli-snapshot.ts`, `cli-assets.ts`, `cli-media.ts`, `cli-avatar.ts` (your avatar's picture, optionally styled; talking-head videos for scenes' clips), `cli-voice.ts` (generated speech: time a scene's words, place new scenes' narration on the timeline, rebuild the whole voice-over one clip per scene, say a changed scene again in place). |
| `scripts/` | `snap.mjs` and `record.mjs` (capture screenshots and scripted interactions of a web app; scenarios in `scenarios/`), `terminal.mjs` (films a terminal session: `terminalSession.mjs` runs steps in a pseudo-terminal or reads an asciinema `.cast`, xterm.js draws it; examples in `terminal/`), `screencast.mjs` (filming a page and adding the video to the media library, shared by `record` and `terminal`), `svg-to-clipart.mjs` and the UnDraw helpers, `import-icons.mjs`, `build-logo.mjs`, `mock-llm.mjs`. |
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
| How recordings follow their scenes (moved, left out, put back) | `src/video/sceneTimeline.ts`, called from `update` in `src/app/App.tsx`; Timing's view of it in `EditorWindows.tsx` (`shownVoiceover`, `withVoiceover`) |
| Deleting a scene in a timed presentation (closing the gap) | `src/app/editor/closeGap.ts` (used by `removeScene` in `useEditActions.ts`) |
| The media library (pictures, recordings, sounds) | `server/mediaStore.ts` (conversion, trim, index, where used, a recording's frames), `src/app/MediaPanel.tsx`, `MediaDetail.tsx`, `ScreenRecorder.tsx` (Record screen), `media.ts` |
| Export | `server/export.ts`, `src/render/page.ts`, `src/video/` |
| Looking at an exported video frame by frame, notes on frames | `src/app/ExportViewer.tsx` (the window), `src/app/exportFrames.ts` (frames, times, scene and beat at a moment, notes as text; tested), `server/exportFiles.ts` (the list, seeking, `exports/<file>.json`: an export's timing and scenes, written when it is made; `exports/<file>.notes.json`) |

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
