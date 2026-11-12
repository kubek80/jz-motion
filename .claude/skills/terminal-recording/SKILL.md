---
name: terminal-recording
description: Record a terminal session (commands typed and run for real, or an asciinema recording of an interactive session such as Claude Code) as a sharp screen recording in the media library, and use it in a scene. Use when an explainer needs to show commands, a CLI, an install, logs, or Claude Code working in a terminal.
---

# Recording a terminal

`npm run terminal` films a terminal session as a WebM screen recording in the media library: drawn by xterm.js in JetBrains Mono (the same look on every computer), sharp enough for camera zooms, and played in a scene like any recording (`play`, `goto`, `until`; see the demo-interactions skill for playing recordings in step with the narration). It runs on the person's own computer as well as in a cloud session: on theirs, commands run in their shell, with their tools, files and paths.

```sh
npm run terminal -- <steps.json|steps.mjs> <name> [--cols 100] [--rows 28] [--font 18] [--scale 2] [--fps 24]
npm run terminal -- <session.cast> <name> [same options]     # an asciinema recording
```

It prints the `/media/<hash>.webm` src to use. The session is also kept as `scratch/captures/<name>.cast`: to change the size, font or width, draw it again from that file (nothing runs again).

## Two ways to get a session

**1. Steps: commands typed and run for you** (repeatable: change a step, record again). A JSON file (or a `.mjs` whose default export is the same object), e.g. `scripts/terminal/example.json`:

```json
{
  "title": "jz-motion",
  "cwd": ".",
  "cols": 92, "rows": 22,
  "steps": [
    "# Is the presentation valid?",
    "npm run check -- presentations/9df1df97.json",
    { "pause": 1 },
    "git log --oneline --color=always -5",
    { "type": "git push", "run": false, "output": "Everything up-to-date" }
  ]
}
```

| Step | What happens |
|---|---|
| `"npm test"` | typed at the prompt at a natural pace, then run for real in a pseudo-terminal (colours, progress bars) |
| `"# a comment"` | typed in grey, not run: a caption inside the terminal |
| `{ "type": "…", "run": false, "output": "…" }` | typed, shown with this output instead of running it (something you can't or shouldn't run: a deploy, a push, a slow job) |
| `{ "type": "…", "maxPause": 4 }` | a wait in its output shortened to at most 4 s (default `maxPause` for all, 1.5 s: a 30 s install doesn't stall the clip) |
| `{ "keys": "y" }` | typed, no Enter |
| `{ "pause": 1.2 }` | nothing for 1.2 s (time for the narration) |
| `{ "clear": true }` | a clear screen |

Options at the top: `cwd` (where the commands run; a typed `cd <dir>` moves it), `cols`/`rows` (the terminal's size), `typing` (characters a second, default 22), `prompt` (default a green arrow and the folder's name; `{dir}` stands for it), `shell`, `env`. Each command runs on its own (in the session's folder), so state from one command, other than `cd`, doesn't carry to the next: chain with `&&` in one step when it must.

**2. A real interactive session, recorded by hand: `asciinema`.** For anything that waits for keys or redraws the screen (Claude Code itself, `htop`, a REPL, an editor), the person records it in their own terminal, then draws it:

```sh
asciinema rec scratch/captures/claude-demo.cast     # do it, then exit (Ctrl+D) to stop
npm run terminal -- scratch/captures/claude-demo.cast claude-demo --cols 110
```

(`brew install asciinema` on a Mac. Set the terminal to the size you pass with `--cols`/`--rows`, or pass the size it was recorded at: the `.cast` header says it.) Long pauses in a hand recording stay as they were: `asciinema rec --idle-time-limit 1.5` caps them while recording.

When the person wants their real terminal app (its own theme, tabs, window), not a drawn one, use the app instead: **Media → Record screen** and pick the terminal window.

## In a scene

```json
{ "id": "term", "type": "image", "src": "/media/<hash>.webm", "x": 960, "y": 560, "width": 1200, "height": 697, "frame": "window", "url": "~/dev/jz-motion" }
```

- **Size:** keep the recording's shape: the command prints its pixel size and the height to use for a width of 1200 (92×22 at 18 px films 2076×1206, so 1200 × 697).
- **Frame:** `"frame": "window"` (the dark Mac window, with the folder or the program in `url`) suits a terminal best; the marker `browser` frame looks like a web page.
- **Playing in step:** `play` with `until` frames lands each command's output on the words that talk about it (`npm run media -- frames /media/<hash>.webm` lists the frames). Zoom the camera into a line of output with an `area` over it, as for any recording.
- **Readable on a 1080p board:** 92–110 columns at 18 px reads well at 1200 px wide; for a zoom into a line, more is fine (it's filmed at 2× by default). Fewer, larger columns (`--cols 80 --font 22`) for a short command shown full size.

## Checks

- Watch the recording before using it: `ffmpeg -ss <t> -i media/<hash>.webm -frames:v 1 /tmp/x.png` at a few moments (the commands typed, output complete, nothing cut off at the right edge).
- Nothing secret on screen: tokens, keys, private paths. Use `"run": false` with an `output` for commands whose real output shouldn't be shown.
- A step that fails still records (its exit code is printed): check the output says what the scene says.
- `npm run check -- presentations/<id>.json`, then `npm run snapshot` and look at the scene.
