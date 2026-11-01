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

Open the printed URL. The home screen lists your presentations: create one (blank, from an example, **from a script** or **from a recording**), open, rename, duplicate or delete. They are saved as files in `presentations/` while `npm run dev` runs (in the browser otherwise), so you can keep them in git. Click the logo to get back home.

**Edit mode**

| Do | How |
|---|---|
| Select, move, resize | Click an element and drag it; drag a corner handle to resize. Shift+click selects several. |
| Edit text in place | Double-click a text, label or chart title on the board (or select the element and press Enter), type, Enter to keep, Esc to cancel. |
| Pan, zoom | Drag the empty board; scroll. |
| Add | Click an icon, logo, clipart, Text, Box, Chart or a 3D model in the library. **Arrow**: click it, then the start element, then the end element. **+ New icon or clipart with AI** draws a new one from your description and saves it to your library (`library/`). |
| Animate | **+ beat** under the board (it draws the selected elements), or **+ action** inside a beat. |
| Edit details | Properties panel on the right (colours are markers, chart types and layouts are pictures). The **JSON** tab shows this scene or the whole file, with colours, folding and full screen. |
| Delete, duplicate, undo | Delete key, Ctrl+D, Ctrl+Z / Ctrl+Shift+Z |

**AI tab**

**Chat** with a model about the open presentation: ask for changes ("add a database under the API") and they are applied right away (Ctrl+Z undoes them), or ask questions. **Compare models** sends one request to several models and shows their results side by side. Models are any OpenAI-compatible endpoint (OpenRouter, RunPod, ...) with its API key.

**From a script** (home screen): paste your script; a model turns it into scenes and beats with your lines as speaker notes; refine it in the chat, then create it.

**From a recording** (home screen): upload a video or audio recording. It is transcribed (any OpenAI-compatible speech-to-text service: OpenAI Whisper, Groq, a local Whisper server), a model builds a presentation whose beats are cued to when you say things, and the recording becomes its first take, ready to export as a video. Keys stay in your browser and go only to the model's API through the local dev server (`npm run dev` or `npm run preview`). To try it without a key: `npm run mock-llm`, then add the "Local mock" model.

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
