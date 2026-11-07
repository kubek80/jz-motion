---
name: demo-interactions
description: Build scenes that walk through app or UI interactions (click, edit text, change colour, drag, play a recorded screen) using screenshots framed as a browser, camera zooms into details with pinned explanations that stay readable, and screen recordings (WebM video from the media library) played in sync with the narration, frame by frame when that reads better. Use when a presentation needs to show how to use an app or an interface.
---

# Showing how an app works

Explainers about software live or die on three things: *where the viewer is looking*, *is the thing they should notice visible right now*, and *does the recording match what you're saying*. This skill is the checklist for all three.

Read `docs/style.md` first (the big table of "which action, when" — the row for "watch something happen in an interface" and the one for "keep reading an explanation while the camera moves" are the two you'll use most). Read `docs/format.md` for the exact shape of `camera`, `play`, `pinned` and `image` elements.

## The three pieces

### 1. A screenshot of the app, framed

```json
{
  "id": "editor",
  "type": "image",
  "src": "/images/editor.png",
  "x": 960, "y": 540,
  "width": 1600, "height": 900,
  "frame": "browser",
  "url": "localhost:5173/#/p/<id>",
  "color": "cyan"
}
```

- `src` must be a file that exists in `images/` (user pastes/drops them in the editor; or copy a file there yourself). Never invent paths.
- `"frame": "browser"` makes it look like a window of your app, with the URL in the address bar — so the viewer knows what app this is.
- `color` is the frame colour; use the scene's accent.

### 2. A camera zoom into the detail

Place an `area` over the part of the screenshot you want to zoom to, then camera-focus on it:

```json
{ "id": "palette-area", "type": "area", "x": 1620, "y": 420, "width": 240, "height": 320, "color": "yellow" },

{ "do": "camera", "focus": "palette-area", "padding": 150 }
```

- Zoom in with a `camera` action naming the area id. Zoom back with `{ "do": "camera", "focus": "all" }`.
- `padding` controls breathing room (screen pixels). 150 for a tight look; 300 to keep more context.
- One zoom per beat. Build up (draw/circle) before zooming, not during.

### 3. Pinned explanations that survive the zoom

Anything *not* `pinned` lives on the board — when the camera zooms, it zooms out of view. If a title, caption, or hand-drawn note should stay readable during the zoom, pin it:

```json
{ "id": "head", "type": "text", "text": "EDIT & RECOLOUR", "x": 960, "y": 80, "size": 70, "color": "yellow", "style": "bold", "pinned": true },
{ "id": "note", "type": "text", "text": "double-click\nto edit text", "x": 220, "y": 520, "size": 40, "color": "white", "pinned": true }
```

Rules for `pinned: true`:
- `x`, `y` are now *screen* coordinates on 1920×1080, not board coordinates.
- A `camera focus` can't target a pinned element — pin only the things that frame the zoom, not what the viewer should look at.
- An arrow cannot join a pinned element to a non-pinned one. Pick one world or the other for a connected group.
- Pinned elements draw *above* any spotlight dimming.

## Capturing from a real app — don't hand-draw a UI you can open

Whenever the app being explained is reachable (local dev server, staging URL, public site), capture the real thing. Hand-drawn placeholders are for concepts the UI doesn't show, not for interactions you could record. Two tools live in `scripts/`:

### `npm run snap` — one static screenshot

```sh
# a full page
npm run snap -- 'http://localhost:5173/#/p/<id>' editor-open

# a single element (clipped to its bounding box)
npm run snap -- http://localhost:5173 home --selector '.start-box'

# flags: --size 1440x900 (viewport, default 1280×800), --wait 400 (ms before shot), --selector CSS
```

Keeps the raw PNG in `scratch/captures/` and adds a WebP copy to the media library; it prints the `/media/<hash>.webp` src. Reference it as that `src` in an `image` element with `"frame": "browser"` and the real URL in `url`.

### `npm run record` — a short recording of an interaction

```sh
npm run record -- 'http://localhost:5173/#/p/sandbox' edit-text scripts/scenarios/edit-text.mjs
# flags: --size 1280x800, --fps 15 (12 keeps files small)
```

Records the scenario, keeps the raw capture in `scratch/captures/`, adds it to the media library as WebM video and prints its `/media/<hash>.webm` src. Recordings in the media library are WebM video (`/media/<hash>.webm`, with a poster picture next to it; anything imported there, APNG and GIF included, is converted to that). The board plays it with the `play` action, muted (sound belongs to the narration). APNG and GIF files are not played on the board; put them in the media library and use the WebM it makes.

### **Always record against the sandbox presentation**

`presentations/sandbox.json` exists exactly for this: a scratch board with text elements the scenarios can click, retype and recolour. Point `record` at `http://localhost:5173/#/p/sandbox` — the scenario *will* save edits back to the file, so a real presentation would be modified. Reset the sandbox with `git checkout -- presentations/sandbox.json` after a session.

### Scenario files

Live in `scripts/scenarios/<name>.mjs`. Each exports `run(page)`; the browser is already at the URL you passed. Keep interactions short — 2–8 seconds — so the recording stays small and the beat it plays over doesn't drag.

### Pacing: slow is the point

A natural-speed interaction looks like a glitch on the board. The viewer has to see the cursor arrive, see the click, see the result. Make the scenario deliberately slow:

- **Hover before every click.** Move to the target, wait 300–500 ms so the pointer is visible, then click.
- **Pause after every change.** 600–1000 ms so the viewer registers the new state.
- **Type character by character** with `--delay 60–100 ms` for a readable typing cadence.
- **Prefer `--fps 10`** — more frames don't help if the interaction itself is paced right, and fewer keeps the capture small.
- **Keep the whole clip 6–12 seconds.** Two seconds of a hovering pointer is better than four seconds of a blur.
- **Recolour demos: pick single-colour elements.** Multi-colour clipart (icons with a `label`, logos) doesn't visibly change when the colour is swapped — the `color` field only affects uncoloured parts. Target plain `text` or a `box`.

### Chapter the clip with `circle` + `play`

A 10-second clip has 3–4 distinct steps. Give each its own beat, and before each `play on: true` chunk, `circle` the next click target on the board layer (pinned above the clip) so the viewer looks there *first*, then the click happens. Use `wait` with a specific `duration` to let the clip play just the right span before pausing with `play on: false` and moving on.

```js
// scripts/scenarios/edit-text.mjs
export async function run(page) {
  await page.waitForSelector('button:has-text("Script")', { timeout: 10000 });
  await page.click('button:has-text("Script")');
  await page.waitForSelector('.script-notes');
  await page.locator('.script-notes').first().click();
  await page.locator('.script-edit textarea').fill('Hi, I\'m Jakub.');
  await page.waitForTimeout(500);
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(600);
}
```

### Pointing a scene at the capture

```json
{
  "id": "editor",
  "type": "image",
  "src": "/images/editor-open.png",
  "x": 960, "y": 540,
  "width": 1600, "height": 900,
  "frame": "browser",
  "url": "localhost:5173/#/p/<id>",
  "color": "cyan"
}
```

For a recording, use the recording's `src` (a `/media/<hash>.webm` video) and drive playback with `play`:

```json
{ "do": "play", "target": "editor", "from": 0 }
```

Recordings of steps (a scenario that clicks, waits, clicks) are best shown **frame by frame**: a frame is one distinct picture of the recording, numbered from 1 (`curl localhost:5173/api/media/<file>/frames` lists when each starts). Move one step per beat:

```json
{ "do": "play", "target": "editor", "goto": 3, "fade": true, "duration": 0.6 }
{ "do": "play", "target": "editor", "until": 7, "duration": 2 }
```

The first jumps to frame 3 with a soft cross-fade and holds it while you talk; the second plays on to frame 7 in two seconds and holds it.

### When to snap, when to record

| Need | Use |
|---|---|
| "Here is the editor." | `snap` — one still frame of the open editor |
| "Click this button." | `snap` + `area` over the button + `circle` action |
| "Edit text, save it." | `record` — the real sequence of clicks/types |
| "Drag this to there." | `record` — the motion is the point |
| "Toggle a setting." | `snap` for before, `snap` for after; two images, same place, fade between them |

For something a scenario can't drive (another desktop app, a long manual walkthrough), Jakub records it himself with **Library → Media → ● Record screen** in the app; it lands in the media library like any other recording, so look for it there (`npm run assets`) before asking for a new one.

If a `snap` would show it clearly, do that first — static files are smaller, more reliable, and easier to re-shoot after a UI change. Record only when motion itself is what you're demonstrating.

### Dependencies

The record script uses `playwright` to screenshot in a loop and `upng-js` to stitch the raw capture (APNG, in `scratch/captures/`); the media library converts it to WebM with FFmpeg.

### Other apps (not jz-motion)

The scripts take any URL. For a presentation about another product:

1. Make sure both apps run — jz-motion on `localhost:5173` to build the deck, the target app wherever it lives (local dev, staging, or a public URL).
2. Capture against the target app's URL, with names like `<app>-<state>` so you can tell them apart in the media library.
3. Add a per-app scenarios folder if you need many: `scripts/scenarios/<app>/`.

### Save, don't paste

The two scripts put their results in the media library (`media/`, in git) so the files travel with the presentation. Dragging a file into the editor also works for one-off captures, but prefer `snap`/`record` for anything referenced from the JSON — the command is the regeneration recipe when the UI changes.

## Self-verify after every capture *and* every slide

The two most costly re-work loops both come from skipping a quick look.

### 1. Verify every capture before you use it

After `npm run snap` or `npm run record`, look at the result (the raw capture is in `scratch/captures/`, the library copy at the `/media/…` src it prints). Ask:

- Does the shot show what the beat needs? If the AI chat panel is empty because no model is set up, is that still useful?
- Is the window big enough that the detail is readable at a glance?
- Is the capture pre-cropped tight to the detail, or does it show the surrounding UI?

If it doesn't answer "yes" to the beat's job, re-snap with a different scenario / size / selector before writing the scene around it.

### 2. Prefer a full-page capture with camera zoom to the detail

A screenshot cropped tight to the AI bar (one 100-pixel strip) is a mystery — the viewer can't tell *where in the app* that bar lives. A **full-page capture** places the UI in context ("this is the home screen"), and a camera `focus` on an `area` placed over the bar zooms in when it's time to look at the detail. Reach for `--selector` only when the surrounding UI is irrelevant and the thing itself is what the viewer needs.

### 3. Verify every slide, not just captures

After writing or editing a scene that uses captures, run:

```sh
npm run snapshot -- presentations/<id>.json --scene N --beats
```

Open **every** beat PNG. For each, ask:

- Can the viewer see the thing this beat talks about?
- Is a pinned caption overlapping the content the camera just zoomed into?
- Did the camera zoom crop something important?
- Are there leftover emphases (circles, spotlights) from earlier beats clouding the view?

Fix each problem and re-run. Beat-level snapshots are cheap; a presentation that looks right only in your head is expensive.

## Rules of thumb learned the hard way

### Clean up emphases between beats

A `circle` leaves a persistent ring on the board. If beat 2 circles the sentence area and beat 3 circles the toolbar, both rings are still visible on beat 3. Give circles explicit `id`s and `erase` (or `fade-out`) the previous ring before adding the next, so the viewer sees one emphasis at a time:

```json
{ "do": "circle", "target": "a-sentences", "color": "yellow", "id": "ring-s" },
// next beat:
{ "do": "erase", "target": "ring-s" },
{ "do": "circle", "target": "a-durations", "color": "pink", "id": "ring-d" }
```

The same applies to `spotlight` — turn it off (`"on": false`) when the next beat moves to a different detail, not when the whole scene ends.

### Pinned captions must survive the zoom

Pinned `x`, `y` are *screen* coordinates — a pinned caption at `(200, 440)` stays at screen `(200, 440)` through every camera move. That means a caption perfectly placed at zoom 1 can land on top of the detail when the camera zooms in. Pick positions that stay clear:

- Top edge: `y ≈ 150–200` (below the header).
- Bottom edge: `y ≈ 950` (above anything else at the floor).
- A single corner (same corner for the whole scene is calmest).

Always check the beat snapshot where the camera is zoomed in, not just the first beat.

### Match the caption side to the detail side

If the thing the camera zooms into sits on the left of the screenshot, put the caption on the right (or opposite diagonal). Left-side caption + left-side zoom means the caption fights with the zoomed content.

### Pre-cropped shots can't be re-zoomed

Once you've snapped `.start-box` to a 100-pixel strip, you can't zoom into it further — it's already the whole image. If next time you want to zoom to a sub-region, you have to re-snap wider. **Default to full-page shots; let `camera focus` do the zoom.**

### Control playback with `play`

```json
{ "do": "play", "target": "demo", "on": true },           // start (or resume) at current position
{ "do": "play", "target": "demo", "on": true, "from": 0 }, // jump to the start and play
{ "do": "play", "target": "demo", "on": false },           // pause at the current frame
{ "do": "play", "target": "demo", "on": true, "speed": 0.5 } // play at half speed
```

- Without any `play`, the picture shows its first frame — a static shot of the app.
- A playing clip keeps running between beats (like `flow`), so set `on: false` the beat you want to stop and talk over the frame.
- `"loop": true` on the image repeats it; useful for a background hum, not for explaining a step.
- `from` lets you replay from the start if the viewer missed something.

### A typical "demonstrate a feature" rhythm

1. **Set the scene.** Draw the browser-framed clip (static first frame) and a pinned title/caption.
2. **Narrate the setup.** One beat talking over the first frame while the viewer orients.
3. **Play.** `play on: true, from: 0` — the clip runs through the interaction, voice-over describing it.
4. **Pause on the result.** `play on: false` on a frame that shows the outcome.
5. **Zoom in.** `camera focus` on an `area` over the piece that changed; `circle` it. Pinned caption on the side.
6. **Pull back.** `camera focus: "all"`, next scene.

## Patterns for one-off interactions (no recording needed)

Half the time you want to show an interaction without recording anything, because the drawing explains it faster. These are hand-drawn demos; follow `docs/style.md`.

### Before and after (edit text, rename, retype)

Two text elements at the same `x, y`. Fade out the old, fade in the new.

```json
{ "id": "word1", "type": "text", "text": "coffee", "x": 960, "y": 520, "size": 150, "color": "cyan" },
{ "id": "word2", "type": "text", "text": "espresso", "x": 960, "y": 520, "size": 150, "color": "cyan" },

{ "do": "fade-out", "target": "word1" },
{ "do": "fade-in", "target": "word2", "start": "with" }
```

### Click or focus (dashed box)

A pinned `box` with `line: "dashed"` around what you clicked, drawn with `draw` so the strokes appear.

```json
{ "id": "cursor", "type": "box", "x": 960, "y": 520, "width": 620, "height": 190, "line": "dashed", "color": "pink" }
```

### A palette or tool tray (change colour, pick an icon)

Row of small `box` swatches with equal `width`/`height` and `radius = width / 2` to make circles. `pop` them in with a `stagger`, `circle` the chosen one, then act on the thing: `recolor`, `swap`, etc.

```json
{ "id": "sw-pink", "type": "box", "x": 1600, "y": 820, "width": 72, "height": 72, "radius": 36, "color": "pink", "weight": "bold" },

{ "do": "pop", "target": ["sw-cyan", "sw-pink", "sw-yellow"], "stagger": 0.15 },
{ "do": "circle", "target": "sw-pink", "color": "pink" },
{ "do": "recolor", "target": "word2", "color": "pink" }
```

### Dragging or moving

`move` the element from A to B. If the drag reveals something underneath, `fade-in` that underneath right after.

## Common mistakes

| Mistake | Fix |
|---|---|
| Explaining a UI with no screenshot or sketch, just text. | Even a hand-drawn `box` labelled "editor" beats pure prose. |
| Zooming into a screenshot but the title fell off the board. | `"pinned": true` on titles, notes and arrows into the zoomed area. |
| Camera zoom and `circle`/`pulse` in the same beat. | Zoom one beat, circle the next. One emphasis per beat. |
| `play` fires before the viewer knows what to look at. | Draw and label the clip first; `play` only when you start describing the interaction. |
| Clip keeps looping while you narrate the next step. | `{ "do": "play", "target": "...", "on": false }` on the beat where it should hold. |
| Arrow joining a pinned caption to a board element. | Pick one world; often, pin both ends (`pinned: true` on the caption and a pinned area over the target). |
| Pinned title overlaps the viewer's attention point. | Pin to a corner the zoom leaves free — look at the snapshot after each change. |

## Checks

```sh
npm run check -- presentations/<id>.json      # unknown elements, pinned-vs-board arrows, etc.
npm run snapshot -- presentations/<id>.json --scene N --beats
```

Look at each beat. Watch for:
- The thing the beat describes being visible (not covered, not off-camera).
- Pinned titles sitting over the zoom's focus or over a swatch they shouldn't cover.
- The animated clip's first frame showing the right starting state before `play`.
