# jz-motion

Jakub's personal studio for technical explainer videos and presentations: a dark board with glowing marker drawings (icons, clipart, charts, isometric 3D, screenshots), animated beat by beat, written mostly by LLMs and exported to MP4. It runs locally (`npm run dev`) for one person; it is not a hosted service.

## Using it (making presentations)

Skills in `.claude/skills/` cover the work you'll be asked for. Use them:

| Skill | For |
|---|---|
| `new-presentation` | Make a presentation from a topic, outline or script |
| `edit-presentation` | Change an existing one |
| `library-item` | Draw a new icon, clipart or 3D model |
| `voiceover-and-video` | Narration, timing, takes, MP4 export |
| `demo-interactions` | Explainers about an app or UI: real screenshots and APNG recordings, camera zooms, pinned explanations |
| `external-clipart` | Import SVG illustrations from external libraries (UnDraw today), restyled to our palette, as scene `image` elements |

The rules every generator follows (the app's own models too) are in `docs/style.md`, `docs/format.md` and `docs/library.md`. Four commands keep you honest:

```sh
npm run check -- presentations/<id>.json          # valid? (also library/<name>.json; --library lists what can be drawn)
npm run snapshot -- presentations/<id>.json       # PNGs of each scene in snapshots/<id>/ — look at them
npm run snap -- <url> <name>                      # scripts/snap.mjs: capture a static UI screenshot into images/<name>.png
npm run record -- <url> <name> <scenario.mjs>     # scripts/record.mjs: capture an interaction as APNG into images/<name>.apng
```

Explainers about *any* app (including jz-motion itself) use `snap` and `record` to pull real UI into `images/`, rather than hand-drawing boxes. The target app can be anywhere reachable (local dev, staging URL, public site); scenario files live in `scripts/scenarios/`. See the `demo-interactions` skill for the shape of a scenario and when to snap vs. record. No FFmpeg needed — the recorder uses `playwright` + `upng-js` to stitch PNG frames into APNG, both already in `devDependencies`.

## Where things live

| Folder | What | In git |
|---|---|---|
| `presentations/` | One JSON file per presentation, `<id>.json` | yes (user data) |
| `library/` | Icons, clipart, 3D models made in the app | yes |
| `images/` | Screenshots and pictures used on boards | yes |
| `uploads/`, `takes/`, `exports/`, `snapshots/` | Recordings, voice-overs, takes, videos, previews | no |
| `src/examples/` | Example presentations shipped with the app (`public/examples/` holds their pictures) | yes |

## Working on the code

Read `docs/design.md` first: architecture, decisions and the code map. Essentials:

- `src/engine/schema.ts` (zod) is the format's source of truth. Any change to it must be reflected in `docs/format.md` in the same change: models learn the format from that document.
- Every LLM output goes through `askJson` (`src/ai/client.ts`): ask for JSON, check it, send the errors back, at most twice. New AI features use it too.
- The board (`src/engine/render.ts`, SVG + GSAP) also renders every export frame, so what the editor shows is what the video shows.
- Models are any OpenAI-compatible endpoint, or the local `claude` command (`server/claudeCode.ts`, "Claude Code (my subscription)"); see `docs/models.md`. With that provider the app runs Claude Code in this repository in agent mode (`server/claudeAgent.ts`): **the skills in `.claude/skills/` are what it follows**, on draft files in `presentations/.drafts/`. When you change a skill, you change what the app's AI does.

Checks before committing: `npm test`, `npm run typecheck`, `npm run build`. UI changes are checked in a real browser with Playwright (Chromium is preinstalled in Claude cloud sessions; `npm run mock-llm` gives a fake model on port 5199 for AI flows).

### Conventions

- Plain, specific words in the UI and docs; explain what something does, not what it is called internally.
- After each piece of work, add a step to `docs/journey.md` (what was asked, what was built, bugs found, how it was checked) with screenshots in `docs/journey/NN-name.jpg`. Show the user screenshots of UI changes for approval.
- Work on a branch, open a PR to `main`, merge it when checks pass (the user wants everything in `main`).
- Never put model names or ids in commits, PRs or code comments.
