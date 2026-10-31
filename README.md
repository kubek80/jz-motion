# jz-motion

A glowing blackboard for technical explainer presentations and videos. Scenes are JSON: clipart, logos, text, boxes, arrows, charts and isometric 3D objects drawn stroke by stroke in luminous marker colors, with flows, highlights and camera zooms, stepped through beat by beat. Edit them visually, or have an LLM write them.

![The example presentation](docs/img/board.png)

## Run it

```sh
npm install
npm run dev
```

Open the printed URL. The example presentation explains this project; more are under **JSON → Load example**. Your work is kept in the browser.

**Edit mode**

| Do | How |
|---|---|
| Select, move | Click an element and drag it. Shift+click selects several. |
| Pan, zoom | Drag the empty board; scroll. |
| Add | Click an icon, Text, Box, Chart or a 3D model in the library. Select two elements, then **Arrow** to connect them. |
| Animate | **+ beat** under the board (it draws the selected elements), or **+ action** inside a beat. |
| Edit details | Properties panel on the right. |
| Delete, duplicate, undo | Delete key, Ctrl+D, Ctrl+Z / Ctrl+Shift+Z |

**AI tab**

Add a model (OpenRouter, RunPod or any OpenAI-compatible endpoint, with its API key), tick the models to compare, describe the presentation or the change, and pick a result. Keys stay in your browser and go only to the model's API through the local dev server (`npm run dev` or `npm run preview`). To try it without a key: `npm run mock-llm`, then add the "Local mock" model.

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
| `npm run mock-llm` | A fake model on port 5199 for trying the AI tab without a key |
| `npm run icons` | Regenerate the icon library and `docs/library.md` (Tabler clipart, Simple Icons logos, `src/engine/icons.custom.json`) |

## Docs

- [Design and phases](docs/design.md)
- [Presentation format](docs/format.md): the reference for writing scenes, by hand or with an LLM
- [Element library](docs/library.md)
- [How we built it](docs/journey.md): the step-by-step story of this project

Clipart from [Tabler Icons](https://tabler.io/icons) (MIT), logos from [Simple Icons](https://simpleicons.org) (CC0). Logos are trademarks of their owners.
