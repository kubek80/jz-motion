# Pictures, recordings and voice: a plan

**Status:** built: the media library with conversion (`npm run media`), captures into the library, recordings as video on the board, the Media tab, **Record screen** in the app (with a trim before keeping), the migration of `images/`, and Git LFS for `media/` (done). Still open: moving voice clips into the library. This started as a proposal from an audit of the repository (`npm run assets` shows the current state at any time).

## Where we are

| What | Where | In git | Problem |
|---|---|---|---|
| Screenshots | `images/*.png` | yes | 46 files, 14 MB, of which **39 files (11 MB) are used by nothing**: debugging and trial captures (`jzm-idle-*`, `jzm-libman-*`, …) that landed in the same folder as real assets. PNG is 3–6× bigger than it needs to be (WebP at quality 90 is visually identical on the board). |
| Screen recordings | `images/*.apng`, made by `npm run record` | yes | APNG stores every frame as a full picture: 0.84 MB for 12 frames at 1440×900. The same recording as WebM video is 0.14 MB (6× smaller), and longer recordings grow linearly (a minute would be tens of MB). Recording needs a hand-written Playwright scenario; there is no way to record your screen from the app. |
| Voice-overs and narration clips | `uploads/*.webm` | **no** (ignored) | Presentations point at them (`voiceover.clips[].upload`), so a presentation opened on another computer or a fresh clone has **no sound**: 18 clips used by "about this app, with edit demo" exist only on the computer that recorded them. |
| Generated voice (TTS) | `tts/<presentation>/*.mp3` | no (ignored) | Regenerable from the notes, so ignoring it is fine. |
| Clipart from UnDraw | `library/*.json`, plus 4 SVGs referenced as `/images/undraw-*.svg` | JSON yes, **SVGs missing** | The SVGs were never added, so the Sandbox presentation shows empty frames elsewhere. |
| Journal screenshots | `docs/journey/*.png, *.jpg, *.gif` | yes | 16 MB; some near-duplicates (`tts2-*`, `tts3-*`). |
| Stray files | `screenshot.png`, `isometric_ref/`, `scripts/undraw-*.png` | yes | Working files in the repository root and among the scripts. |

Git keeps every version of every binary forever, so the repository is already 24 MB packed and grows with each re-capture.

## What we want

1. **Recording a demo is one action in the app**, not a script: pick a window or tab, click Record, do the thing, stop. It appears in the library, ready to drop on the board.
2. **Small files**: video for recordings, WebP for screenshots, Opus for voice. Converted on import, automatically.
3. **One place to see and manage everything**: what each file is, how big, which presentations use it, and a safe "remove what nothing uses".
4. **A presentation travels with its media**: open it on another machine (or after a fresh clone) and the screenshots, recordings and voice are there.
5. **Exports stay exact**: every frame of a recording is the right one, as with APNG today.

## Proposal

### One media library: `media/`

- Every picture, recording and voice clip goes into `media/`, named by its content hash (as `images/` already does), with a small index, `media/index.json`, holding a readable name, kind (screenshot, recording, voice, clipart), original file name, size, dimensions, duration and when it was added.
- **Import converts**: PNG/JPEG → WebP (quality 90, at most 2560 px wide); APNG/GIF/MOV/MP4/WebM screen recordings → WebM (VP9) plus a poster frame; voice → Opus in WebM. The server already has FFmpeg for exports.
- Existing `images/…` and `uploads/…` references keep working; a one-off migration command converts them and rewrites the presentations.

### Recordings as video on the board

- An `image` whose file is a video plays through a `<video>` element, with the same `play` action as animated pictures today (on/off, `from`, `speed`, `loop`). Editing and presenting play it normally; export seeks it to each frame's exact time and waits until that frame is shown, so videos are as exact as APNGs are now.
- APNG/GIF stay supported for tiny loops and stickers.

### Record from the app

- **Library → Record screen**: the browser's own screen picker (a window, a tab or the whole screen), a countdown, Stop. Saved straight to `media/` as WebM, with a quick trim (start/end) before keeping it.
- `npm run record` (scripted Playwright captures) stays for repeatable demos of jz-motion itself, but saves WebM instead of APNG.

### Managing it: a "Media" tab in the Library window

- A grid with previews (recordings play on hover), name, kind, size, length, and **used in**: the presentations that reference it, clickable.
- Rename, replace (keeps references), trim a recording, delete. **Clean up** lists everything nothing uses, with the total it frees, and deletes after a confirmation.
- The same information from the command line: `npm run assets` (exists now), and `npm run assets -- --unused`.

### Keeping it in git

- **Git LFS for `media/`** (set up in `.gitattributes`; the existing files are converted once with `git add --renormalize media`; `docs/journey/` stays in plain git for now): the repository stays small, files still travel with `git clone` / `git pull`, and old versions don't bloat every checkout. It needs `git lfs install` once per computer and LFS storage on GitHub (1 GB free).
- Voice clips move from the ignored `uploads/` into `media/`, so presentations carry their sound. Raw recordings for transcription stay in `uploads/` (temporary).

## Decisions for you

1. ~~**Git LFS** for media~~: decided, set up for `media/`.
2. **Delete the unused captures** in `images/` (11 MB) and the stray root files, or move them to an ignored `scratch/` folder?
3. **Screen recording in the app** first (bigger usability win), or the video element and conversion first (bigger size win)? They build on each other; I'd do video + conversion + Media tab first, then Record screen.
4. **Voice clips into git** (via LFS), yes or no?
