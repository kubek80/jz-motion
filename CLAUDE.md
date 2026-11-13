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
| `demo-interactions` | Explainers about an app or UI: real screenshots and screen recordings (WebM video), camera zooms, pinned explanations |
| `external-clipart` | Import SVG illustrations from external libraries (UnDraw today), restyled to our palette, as scene `image` elements |
| `terminal-recording` | Film a terminal session (commands run for real, or an asciinema recording of Claude Code or any interactive program) as a screen recording for a scene |

The rules every generator follows (the app's own models too) are in `docs/style.md`, `docs/format.md` and `docs/library.md`. Four commands keep you honest:

```sh
npm run check -- presentations/<id>.json          # valid? (also library/<name>.json; --library lists what can be drawn)
npm run snapshot -- presentations/<id>.json       # PNGs of each scene in snapshots/<id>/ — look at them
npm run snap -- <url> <name> [--phone]            # scripts/snap.mjs: screenshot a web page into the media library (WebP); prints its /media/… src; --phone: as on a phone, for the "phone" frame
npm run record -- <url> <name> <scenario.mjs> [--phone]  # scripts/record.mjs: record a scripted interaction into the media library (WebM video)
npm run terminal -- <steps.json|session.cast> <name>  # scripts/terminal.mjs: film a terminal session (commands typed and run, or an asciinema recording) into the media library
npm run media -- import <file…>                   # add any picture, recording or sound to the media library (converted); prints its /media/… src
npm run media -- frames <file>                    # a recording's frames (its distinct pictures), for play's goto / until
npm run assets                                    # what's in media/, images/ and uploads/, how big, and which presentations use it
npm run voice -- time|place|rebuild|again <presentation> [--scenes id,…]  # generated speech: time the words per beat; put new scenes' voice on the timeline; one clip per scene for all; say changed scenes again
npm run avatar -- photo <picture> [--style …] | make <presentation> --scenes id,… [--layout camera|pip]  # your avatar: its picture (styled); talking-head videos of scenes' voice clips
```

Explainers about *any* app (including jz-motion itself) use `snap` and `record` to pull real UI into the media library, rather than hand-drawing boxes. The target app can be anywhere reachable (local dev, staging URL, public site); scenario files live in `scripts/scenarios/`. See the `demo-interactions` skill for the shape of a scenario and when to snap vs. record. The raw captures stay in `scratch/captures/` (not in git); the media library keeps converted copies.

## Where things live

| Folder | What | In git |
|---|---|---|
| `presentations/` | One JSON file per presentation, `<id>.json` | yes (user data) |
| `library/` | Icons, clipart, 3D models made in the app | yes |
| `media/` | The media library: pictures (WebP), screen recordings (WebM video + poster), sounds, with `index.json` (names, sizes) | yes, with Git LFS (`git lfs install` once per computer; `index.json` is plain text) |
| `images/` | Older pictures, from before the media library (migrated; `npm run media -- migrate` moves any new ones in) | yes |
| `scratch/` | Raw captures and files moved out of the way (`migrate` puts unused pictures here); safe to delete | no |
| `uploads/` | Voice recordings: narration, re-takes, generated narration (`generated-*`), Jakub's voice sample (`voice-sample-*`), with their transcripts; his avatar's photo and talking-head videos (`avatar-*`) | yes, with Git LFS (transcripts plain text); video uploaded to start a presentation is not |
| `takes/`, `exports/`, `snapshots/` | Takes, videos, previews | no |
| `voice/` | `my-voice.json`: Jakub's own voice for generated speech (the sample, which part, what is said in it, the cloning model, how to speak: a neutral British accent; never a key). `npm run voice` speaks in it by default. `my-avatar.json`: his avatars, for every presentation, and the one in use (each: the picture it comes from, its style: a cartoon talking head in a home studio, the photo, the fal.ai model, how it moves, and its voice; choosing one copies its voice into `my-voice.json`; set in 🧑 Avatar; a podcast's guests are avatars too, marked `guest`) | yes |
| `logs/` | `ai.jsonl`: every AI request, its reply and what came of it (read it when an AI change didn't do what was asked) | no |
| `src/examples/` | Example presentations shipped with the app (`public/examples/` holds their pictures) | yes |

## Working on the code

Read `docs/design.md` first: architecture, decisions, the code map and a **where to change what** table; use it to go straight to the right file instead of exploring. Essentials:

- `src/engine/schema.ts` (zod) is the format's source of truth. Any change to it must be reflected in `docs/format.md` in the same change: models learn the format from that document.
- Every LLM output goes through `askJson` (`src/ai/client.ts`): ask for JSON, check it, send the errors back, at most twice. New AI features use it too.
- The board (`Stage` in `src/engine/render.ts`, built on `player.ts`; SVG + GSAP) also renders every export frame, so what the editor shows is what the video shows.
- Models are any OpenAI-compatible endpoint, or the local `claude` command (`server/claudeCode.ts`, "Claude Code (my subscription)"); see `docs/models.md`. With that provider the app runs Claude Code in this repository in agent mode (`server/claudeAgent.ts`): **the skills in `.claude/skills/` are what it follows**, on draft files in `presentations/.drafts/`. When you change a skill, you change what the app's AI does.

Checks before committing: `npm test`, `npm run typecheck`, `npm run build`. UI changes are checked in a real browser with Playwright (Chromium is preinstalled in Claude cloud sessions; `npm run mock-llm` gives a fake model on port 5199 for AI flows).

### Conventions

- Plain, specific words in the UI and docs; explain what something does, not what it is called internally.
- Keep files focused and under about 350 lines; when one grows past that, split it by responsibility (as `editor/`, `timing/` and the engine are) and update the code map in `docs/design.md`.
- After each piece of work, add a step to `docs/journey.md` (what was asked, what was built, bugs found, how it was checked) with screenshots in `docs/journey/NN-name.jpg`. Show the user screenshots of UI changes for approval.
- Work on a branch, open a PR to `main`, merge it when checks pass (the user wants everything in `main`).
- Never put model names or ids in commits, PRs or code comments.
