# jz-motion

<img src="docs/img/logo.png" alt="jz-motion logo" width="360">

A glowing blackboard for technical explainer presentations and videos. Scenes are JSON: clipart, logos, text, boxes, arrows, charts and isometric 3D objects drawn stroke by stroke in luminous marker colors, with flows, highlights and camera zooms, stepped through beat by beat. Edit them visually, or have an LLM write them.

![The example presentation](docs/img/board.png)

## Run it

```sh
npm install
npx playwright install chromium   # once, for video export
npm run dev
```

Video export also needs [FFmpeg](https://ffmpeg.org) (`brew install ffmpeg`), or set `FFMPEG_PATH` / `FFPROBE_PATH`.

Open the printed URL. New here? Start from the example **jz-motion: explainers, fast (about this app)**: ten scenes on what the app does, how it is built and why it is LLM first, with a ready voice-over in [docs/explainer-script.md](docs/explainer-script.md).

 The home screen has one prompt box in the middle: pick **Topic** (describe what to explain), **Script** (paste what you will say) or **Recording** (attach a video or audio file), pick the model for that kind of start (remembered per kind), and send. Below it are your presentations: open, rename, duplicate or delete; or start blank or from an example. **⚙ Settings** (home and editor) holds your models and API keys, the default model per kind of start, and the speech-to-text service. They are saved as files in `presentations/` while `npm run dev` runs (in the browser otherwise), so you can keep them in git. Click the logo to get back home.

**Edit mode**

| Do | How |
|---|---|
| Select, move, resize | Click an element and drag it; drag a corner handle to resize. Shift+click selects several. |
| Edit text in place | Double-click a text, label or chart title on the board (or select the element and press Enter), type, Enter to keep, Esc to cancel. Text has three styles: handwritten marker, **bold** outlined capitals and **code** (several lines; Ctrl+Enter keeps it). |
| Pan, zoom | Drag the empty board; scroll. **Reset view** (or 0) goes back to the scene's start view, **Fit all** (Shift+0) shows everything. |
| Add | Click an icon, logo, clipart, Text, Box, Chart or a 3D model in the library, or open the whole library with **⤢** (also **Library** on the home screen): big previews that draw in, details, and renaming, editing or deleting what you made. **New with AI** (in the library window, on the home screen too) is a conversation: describe the item, then ask for changes; every reply is a version with a preview, and you save the one you like. **Refine with AI** continues from one of your items, **Make a variation** from a built-in one. **Arrow**: click it, then the start element, then the end element. **+ New with AI** draws an icon, clipart or 3D model from your description and saves it to your library (`library/`). |
| Screenshots | Paste one (Ctrl+V), drop a picture on the board, or click **Image**. Pick a **frame** (none, or a browser window drawn in marker, with your own address) in its properties; the next picture uses the same frame. Pictures sit under the drawing, so you can draw on top of them. To point at part of it, select the picture and click **Area**, move and resize the dashed area over the part, then in the area's properties add a beat that spotlights and circles it (or zooms to it). A **spotlight** darkens or fades everything else until you turn it off. |
| Animate | The strip under the board shows the scene's beats left to right (one per click, or *auto*), each with its actions, colour-coded, the elements they act on and a small timeline. **+ beat** draws the selected elements; **+ action** offers draw, fade, pop, pulse, circle, camera, move, flow, erase or a pause for the selected elements. Drag actions to reorder them or move them to another beat. |
| Change a scene with AI | Type into the bar above the beats ("pulse the API after it is drawn"); only the open scene changes; Ctrl+Z undoes it. |
| Add a scene with AI | **+ scene with AI** next to the scenes: describe it, preview it, keep it. It goes after the open scene and continues from it. |
| Edit details | Properties panel on the right: position and size at the top like a drawing program (X, Y, W, H, size, rotation, corner radius; drag a label sideways to change the number, Shift for bigger steps), colours are markers, chart types, layouts, line styles (solid, dashed, dotted) and thickness are pictures; hover a **?** for help; ids and rarely needed fields are under *Advanced*, video settings under *Video export*). The **JSON** tab shows this scene or the whole file, with colours, folding and full screen. |
| Delete, duplicate, undo | Delete key, Ctrl+D, Ctrl+Z / Ctrl+Shift+Z |

**AI tab**

**Chat** with a model about the open presentation: ask for changes ("add a database under the API") and they are applied right away (Ctrl+Z undoes them), or ask questions. **Compare models** sends one request to several models and shows their results side by side. Models are any OpenAI-compatible endpoint (OpenRouter, RunPod, ...) with its API key.

**From a topic** (home screen): describe it; refine the draft in the chat, then create it.

**From a script** (home screen): paste your script; a model turns it into scenes and beats with your lines as speaker notes; refine it in the chat, then create it.

**From a recording** (home screen): upload a video or audio recording. It is transcribed (any OpenAI-compatible speech-to-text service: OpenAI Whisper, Groq, a local Whisper server), a model builds a presentation whose beats are cued to when you say things, and the recording becomes its first take, ready to export as a video. Keys stay in your browser and go only to the model's API through the local dev server (`npm run dev` or `npm run preview`). To try it without a key: `npm run mock-llm`, then add the "Local mock" model.

**Timing to a voice-over**

**Timing** (top bar) opens the voice-over timeline: load your narration (any audio or video file), and every click of the presentation appears on its waveform. Drag a click to move it, double-click it to let it follow the one before, or press **Tap to place**, play, and press **T** as each line starts. The board plays along, with the current and next script lines (speaker notes) beside it. **Make a take for export** turns it into a take with the voice-over as its sound; export it from the Video tab.

**Recording and video**

1. In **Play** mode press **● Record** (tick *camera* to film yourself) and present as usual: talk and click through the beats. Your voice, camera and the moment of every click are saved as a *take* (in `takes/`).
2. In the **Video** tab pick the take. Add a friend's recording with **+ add recording**, then line it up with **Auto-sync** (matches the sound; a clap at the start helps) or type its start time.
3. Choose where the camera goes per beat or per scene in the properties panel (`layout`: board, pip, pip-left, camera, side; `track`: which recording).
4. **Export MP4** (1080p or 4K, 30 or 60 fps). Without a take the video uses automatic timing with a pause between beats. Files land in `exports/`.

From the command line: `npm run export -- presentation.json [--take <id>] [--4k] [--fps 60] [--gap 1.5] [--out file.mp4]`.

**Play mode**

| Key | Does |
|---|---|
| → / space / Page Down / click the board | Next beat (finishes a running beat first) |
| ← / Page Up | Previous beat |
| F | Full-screen present mode |

## Other commands

| Command | Does |
|---|---|
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript |
| `npm run build` | Production build into `dist/` |
| `npm run export -- file.json` | Render a presentation (optionally with `--take <id>`) to MP4 |
| `npm run mock-llm` | A fake model on port 5199 for trying the AI tab without a key |
| `npm run logo` | Rebuild the logo files in `public/` and `docs/img/logo.png` from `scripts/build-logo.mjs` |
| `npm run icons` | Regenerate the icon library and `docs/library.md` (Tabler clipart, Simple Icons logos, `src/engine/icons.custom.json`) |

## Docs

- [Design and phases](docs/design.md)
- [Presentation format](docs/format.md): the reference for writing scenes, by hand or with an LLM
- [Element library](docs/library.md)
- [How we built it](docs/journey.md): the step-by-step story of this project

Clipart from [Tabler Icons](https://tabler.io/icons) (MIT), logos from [Simple Icons](https://simpleicons.org) (CC0). Logos are trademarks of their owners.
