# jz-motion

A glowing blackboard for technical explainer presentations and videos. Scenes are JSON: clipart, text, boxes and arrows drawn stroke by stroke in luminous marker colors, with flows, highlights and camera zooms, stepped through beat by beat.

![The example presentation](docs/img/board.png)

## Run it

```sh
npm install
npm run dev
```

Open the printed URL. The example presentation explains this project. Edit the JSON on the right and the board updates as you type (your draft is kept in the browser).

| Key | Does |
|---|---|
| → / space / Page Down / click the board | Next beat (finishes a running beat first) |
| ← / Page Up | Previous beat |
| F | Full-screen present mode |

## Other commands

| Command | Does |
|---|---|
| `npm test` | Unit tests for the compiler |
| `npm run typecheck` | TypeScript |
| `npm run build` | Production build into `dist/` |
| `npm run icons` | Regenerate the icon library and `docs/library.md` (Tabler clipart, Simple Icons logos, `src/engine/icons.custom.json`) |

## Docs

- [Design and phases](docs/design.md)
- [Presentation format](docs/format.md): the reference for writing scenes, by hand or with an LLM
- [Element library](docs/library.md)

Clipart from [Tabler Icons](https://tabler.io/icons) (MIT), logos from [Simple Icons](https://simpleicons.org) (CC0). Logos are trademarks of their owners.
