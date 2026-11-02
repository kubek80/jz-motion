# How we built jz-motion

A running log of how this project is made: a person (Jakub) and an AI coding agent (Claude Code, in a cloud session) working in a chat. Each step records what was asked, what was decided, what was built, how it was checked, and what was approved. It is kept up to date as we go, as material for the video about making this project.

## How we work

The loop we settled into:

1. **Talk first.** Jakub describes the goal in plain words. Claude proposes an approach and asks only the questions that change what gets built.
2. **Decide.** Jakub answers; decisions go into [design.md](design.md).
3. **Build in small steps** on a branch, with unit tests for the logic.
4. **Look at it.** Claude runs the app in a headless browser and takes screenshots of real frames. Several bugs were caught this way that tests did not catch.
5. **Approve.** Screenshots are sent to Jakub for each visible change; he approves or asks for changes.
6. **Commit and push**, then log the step here.

## Step 1: The idea (planning chat)

**Ask:** a desktop app, maybe Electron, for making technical explainer YouTube videos: blackboard-style animations (chalk or saturated markers) that are easy to edit, camera video of himself and a friend (picture in picture, side by side), and switchable AI models (OpenRouter, RunPod) to generate the animations. The first video should be about this project itself.

**Claude's proposal:**
- The key decision: the AI should write **editable scene data**, not pixels or video, so changing a word is a form field, not a regeneration. A small library of drawable components; scenes as JSON; the model fills in the JSON.
- Record each person as a separate track so layouts can change afterwards; sync tracks by audio.
- Models through OpenAI-compatible endpoints, so OpenRouter, RunPod and a self-hosted gateway are one code path, with a side-by-side compare mode.
- Phases: scene engine first, then AI, then camera and timeline.

## Step 2: Looking at the competition

Jakub pointed to an inspiration video (YouTube was blocked from the cloud environment, so Claude could not watch it), then to **Claude Motion** (Anthropic's animation feature for teams) and **HyperFrames** (HeyGen's open-source HTML-to-video renderer). Claude researched both:

- Both confirm the approach: an AI writes code or data that draws the video; no generated footage.
- HyperFrames uses HTML + GSAP timelines rendered frame by frame with a headless browser and FFmpeg. So we chose **GSAP** for animation, which keeps HyperFrames export open for later.

## Step 3: The pivot to a web app

**Ask:** start instead with a **web app**: a blackboard with **luminous markers**, multiple slides, animated hand-drawn clipart (apps, users, infrastructure, equipment), animated arrows, charts, zoom in and out, camera moves, flow animations. A reusable element library. Good documentation so an LLM can write slides later. Focus: app and AI development topics.

**Claude's plan:** presentation → scenes → elements + camera + **beats** (one beat = one presenter click; in video mode beats play back to back). Arrows and camera targets refer to element **ids**, not coordinates. SVG for sharp zooms, GSAP for seekable timelines, a zod schema as the single source of truth for the format and its docs.

**Decisions** (Jakub's answers):
1. One board per scene, with an option to carry elements over from the previous scene.
2. Marker colors: green, pink, yellow, cyan, orange, white.
3. Clipart made together as needed; no hand drawing for now.
4. Build in the `jz-motion` repo.

## Step 4: Phase 0, the engine

Built: the JSON format, a compiler that validates it and turns beats into a timed plan (with readable errors like `scenes.0.beats.2.actions.1: unknown element "db"`), an SVG + GSAP renderer (stroke-by-stroke drawing, handwriting reveal, neon glow, board texture, dots flowing along arrows, camera framing by id), and a player with a live JSON editor and full-screen present mode. 18 icons imported from Tabler by a script. An example presentation about the project itself.

**Checked by:** unit tests, then screenshots of real frames in a headless browser. The screenshots caught three bugs the tests could not see: arrowheads appearing before the line finished drawing, slanted arrows from labelled icons, and loose highlight circles. Also checked: stepping back to a beat gives a pixel-identical frame to arriving fresh.

![First board](journey/01-first-board.jpg)

![Bugs fixed: sequencing, straight arrows, tight circles](journey/02-bugs-fixed.jpg)

Jakub asked for animated previews; Claude rendered the timeline frame by frame (not a screen recording, so motion is smooth) and encoded APNGs and GIFs:

![First animation](journey/01-first-animation.gif)

## Step 5: Feedback round: glow, logos, hardware, 3D

**Ask:** saturated colors but not so much glow that text is unreadable; logos of the main LLM labs (Anthropic, OpenAI, Google, Qwen, DeepSeek); hardware (GPU, Mac, DGX Spark); stretch goal: isometric 3D with three.js in the same style. And: **send screenshots of everything new for approval.**

- **Glow:** tight inner glow + dimmed halo with the crisp stroke on top; bolder handwriting.

  ![Glow before and after](journey/03-glow-before-after.jpg)

- **Logos:** from Simple Icons (CC0), drawn as a neon outline with a faint fill. OpenAI's logo is not in that set, so Claude drew it: six rounded links rotated around a center, with an over-under weave computed by hiding each link where the next one crosses it. Four variants were rendered; the cyclic weave was picked.

  ![OpenAI weave variants](journey/04-openai-weave-variants.jpg)

- **Hardware:** hand-drawn GPU, Mac Studio, Mac mini and DGX Spark in a slight 3D box style. The first versions were too small next to the other icons and the Spark's foam front clumped into a solid block, so they were redrawn (dot grille for the foam).

  ![Library](journey/05-library.jpg)

- **Examples:** "Who builds the models" and "Where do models run". A screenshot showed dashed boxes cut off at the top-left (the default SVG mask region was too small), fixed.

  ![AI labs](journey/06-ai-labs.jpg)
  ![Hardware](journey/07-hardware.jpg)

- **3D:** three.js does the 3D math and the isometric projection; the faces are drawn as SVG paths filled with the board color, so 3D objects glow, draw on and zoom exactly like everything else. New actions: rotate, spin, explode. A screenshot of an exploded GPU cluster showed cubes hidden under their base plate (sorting by center depth fails for big flat parts), fixed with a proper isometric paint order and a test for it.

  ![3D paint-order bug](journey/10-3d-paint-order-bug.jpg)
  ![3D stack](journey/08-3d-stack.jpg)
  ![3D infra](journey/09-3d-infra.jpg)

**Approved:** glow level, the hand-drawn OpenAI logo, the hardware drawings, the 3D look.

## Step 6: Into `main`, and this log

Jakub asked to put everything on `main` (pull request #1, merged), to keep this log of the steps, and to build next: (1) a visual editor, (2) LLM generation with switchable models, (3) charts.

## Step 7: The editor

Built an **Edit** mode next to **Play**:
- The board shows every element of a scene fully drawn. Click to select, shift+click for several, drag to move, scroll to zoom, drag the empty board to pan.
- A library palette (searchable icons with previews, text, box, 3D models); "Arrow" connects two selected elements.
- Beats as cards under the board: add, reorder, delete beats and actions; clicking an action highlights its targets on the board.
- A properties panel **generated from the schema** (zod → JSON Schema), so new fields and element types appear in the editor without extra work. Renaming an element updates every reference to it; deleting one also removes its arrows and its mentions in beats.
- Undo/redo for every change. The JSON stays the single source of truth, so the JSON tab and the visual editor are always in sync.

**Checked by:** unit tests for the edit operations (rename, delete, unique ids), and a browser script that selects, drags, adds a GPU, connects it with an arrow, adds a beat, undoes three times and switches to Play. The first screenshot showed an empty, mis-framed board: in development React mounts components twice, and the discarded board finished loading later and stored a bogus camera. Fixed by ignoring results from a board that is no longer current.

![Camera bug](journey/12-editor-camera-bug.jpg)
![Editor](journey/11-editor.jpg)

## Step 8: Generating scenes with LLMs

Built an **AI** tab:
- **Models** are any OpenAI-compatible endpoint: presets for OpenRouter and RunPod (vLLM), plus custom. Tick several to compare them on the same request.
- **The prompt is our own docs**: `docs/format.md` and the generated `docs/library.md` go into the system prompt, so keeping the docs accurate is what keeps generation accurate.
- **Repair loop:** the reply is compiled; if it does not load, the compiler's readable errors go back to the model, up to two times.
- **Results** show a live preview, time, tries, tokens and cost (OpenRouter reports cost); "Use this" replaces the presentation, and undo brings the old one back.
- Requests go through a small proxy in the local dev server (browsers can't call most model APIs directly), so API keys stay in the browser and on this machine.

**Checked by:** unit tests with a fake model (repair loop, giving up, edit mode, failures) and an end-to-end browser run against a **mock model server** (`npm run mock-llm`, also useful for trying the flow without keys). The unit tests found a real bug: an arrow pointing at an invalid element made the compiler throw instead of listing the error, which would have sent the model a confusing message. The compiler now never throws.

No real model has been tried yet: there are no API keys in the cloud environment. That is the next thing for Jakub to try.

![AI compare](journey/13-ai-compare.jpg)

## Step 9: Charts

Added a `chart` element (bar, line, donut pie) and a `set-values` action:
- `draw` writes the title, draws the axes, then grows the bars, traces the line or sweeps the slices while the values count up.
- `set-values` animates to new numbers, for "before / after" moments. The compiler sizes the value axis to fit every value the chart shows in the scene, so bars never overflow.
- Like the 3D objects, charts are redrawn every frame from a few animated numbers, so scrubbing and stepping back stay exact.
- The editor got a "Chart" button; data is edited in the properties panel (switching bar → line is one dropdown).

**Checked by:** tests for the value animation, axis rounding and errors (wrong number of values, set-values on a non-chart), and screenshots of each chart while drawing and after a change.

![Charts](journey/14-charts.jpg)

## Step 10: Into `main` again

The editor, LLM generation and charts went to `main` as pull request #2. Next for Jakub: try the AI tab with real models (OpenRouter or RunPod keys), and decide what the first real video covers.

## Step 11: Videos: export, recording, camera layouts

Jakub asked for the three pieces that turn a presentation into a YouTube video.

- **A performance** is the list of moments when a beat started (and what it played), recorded from the presenter's clicks or generated with even pauses. Given one, every frame of the video is fully determined, so exporting is exact and repeatable.
- **Export:** a hidden render page (`/?render`) draws any moment of a presentation. Playwright steps it frame by frame and pipes JPEGs into FFmpeg, which encodes H.264, lays out camera tracks and mixes the audio. There's a button in the new **Video** tab and `npm run export` on the command line.
- **Recording:** **● Record** in Play mode saves microphone, camera and every click as a *take* on disk, with a live camera preview while presenting.
- **Layouts per beat or scene:** board, pip, pip-left, camera (board small), side (two people). A friend's recording is added to a take and lined up by matching the sound of the two tracks.

**Checked by:** tests for timing, layouts over time, the FFmpeg command and the sound matching; a full run in a browser with Chromium's fake camera and microphone (record, add a "friend" track, export, check a frame of each layout); auto-sync found a 2.00 s offset as 1.97 s.

**What the measurements changed:** the first export took 8× real time. Timing it showed that drawing a frame takes 3 ms but taking the screenshot 170 ms, and most of that was the board's static texture (noise and a large blur) being re-filtered every frame. The texture is now painted once into a bitmap (same look, also lighter for live playback), and frames render in parallel browser pages: 34 s of video went from 273 s to 112 s on the 4-core cloud machine.

![First MP4 frames](journey/17-first-mp4-frames.jpg)
![Recording](journey/16-recording.jpg)
![Layouts](journey/15-video-layouts.jpg)

## Step 12: A logo

Jakub asked for a more fun logo. Three design rounds, each a sheet of options rendered in the board's own style:

1. Four directions: JZ with an orbiting swoosh, a hand-drawn play button, a marker drawing a squiggle, JZ as a node diagram.

   ![Round 1](journey/18-logo-round1.jpg)

2. Jakub: big outlined JZ with a smaller handwritten "motion". Three placements of "motion": a signature underneath, written across, side by side.

   ![Round 2](journey/19-logo-round2.jpg)

3. Jakub: between the first two placements, letters bolder and closer, "motion" bigger and overlapping. Chunky slanted letters with the J overlapping the Z, in three treatments: neon tube, 3D shadow, both.

   ![Round 3](journey/20-logo-round3.jpg)

Jakub picked **C** (neon tube + shadow, white "motion", green arrow). `npm run logo` now builds every size from one script: the full logo and JZ mark as SVG ("motion" converted from the Caveat font to outlines, so it needs no fonts), app icons, and favicons that drop the shadow and glow at 16 to 48 px so they stay crisp. The app header and browser tab use it.

![Final logo set](journey/21-logo-final.jpg)

## Step 13: Presentations, and editor fixes from real use

Jakub tried the app and asked for:
- **Presentations as the top level.** A home screen of cards with a live preview of each presentation; new (blank or from an example), open, rename, duplicate, delete. Presentations are JSON files in `presentations/`, saved half a second after each edit (browser storage when there is no local server). The address (`#/p/<id>`) keeps a presentation open across reloads, takes remember which presentation they belong to, and the old single browser draft became the first presentation.
- **Colors as a palette**: swatches instead of a dropdown.
- **"I can't add an arrow."** The button only worked after a hidden shift+click on two elements. It is now a tool: click Arrow, click the start, click the end.
- **Resize handles**: corner handles on the selected element; icons, text and 3D models keep their proportions, boxes and charts stretch (Shift keeps proportions).

**Checked by:** browser scripts for each (resize an icon and a box, pick a swatch, connect two elements, create / rename / duplicate / delete presentations and check the files on disk). The first resize and arrow run failed while the same checks passed afterwards; logging every pointer event showed the code was right and the page had loaded mid-change, so the checks were repeated twice more to rule out flakiness.

![Home](journey/22-home.jpg)
![Resize, swatches, arrow tool](journey/23-resize-swatches-arrow.jpg)

## Step 14: Markers instead of dots

Jakub liked the palette but wanted the actual marker tips instead of circles. Colors are now a tray of markers (chisel tip, collar, a colour band on the body): the chosen one stands up out of the tray and glows in its ink, and a marker lifts halfway when hovered. One detail found by the screenshots: the tray hides the markers' lower halves, and a hidden-overflow box can still be scrolled (the test tool scrolled it while hovering), which shifted every marker; `overflow: clip` can't be scrolled.

![Marker tray: at rest, and hovering pink](journey/24-marker-tray.jpg)

## Step 15: JSON editor, clipart, and working with LLMs everywhere

Jakub's next list: a nicer JSON view (full screen, folding, colours, this scene or the whole file), presentations from a script and from a recording, clipart including the jz-motion logo, chart types as icons, creating icons and clipart by describing them to a model (with the rules shown), and chatting with a model inside the editor.

- **JSON editor:** CodeMirror with the board's colours, folding, search and syntax errors marked inline; a switch between the open scene and the whole file (a scene's edits apply as soon as they are valid); full screen.
- **Pictures instead of names** for chart types, camera layouts, text alignment and arrowheads.
- **Clipart:** library items can now be multi-coloured drawings (`parts`, each with its own marker colour, width and fill). The logo build script also writes the jz-motion logo as clipart, so the board version always matches the real logo.
- **Making icons and clipart with AI:** describe it; the rules sent to the model are shown (grid, stroke-only, drawing order, allowed colours); the reply is checked against them and sent back if it breaks them; compare drawings from several models and save one to `library/`. Saved items work on the board, in exports, and are listed to models writing presentations.
- **Chat in the editor:** the AI tab is now a conversation that changes the open presentation (undoable) or answers questions; comparing several models stays as a second mode.
- **From a script / from a recording** on the home screen: a chat that builds a draft presentation with a live preview. Recordings are transcribed through any OpenAI-compatible speech-to-text service; the model gives each beat a `cue` from the timestamps, and the recording becomes the presentation's first take, timed to the speech.
- Every AI feature goes through one loop: ask for JSON, check it, send the problems back.

**Bugs found on the way:**
- Drawing the logo showed two old bugs: a dot at the start of every line before it is drawn (the dash pattern was one unit short), and paths made of several pieces (letters of a word, logos) drawing all their pieces at once (a dash pattern restarts on every piece). Paths are now split into pieces drawn in turn; tested.
- The home dialogs crashed in the browser: `scrollTo()` returns a promise in current Chrome, and a one-line React effect returned it as if it were a cleanup function.

**Checked by:** 45 unit tests, and a browser run of every new flow against an extended mock model (chat, icons, clipart, transcription), including undoing a chat change and checking the files in `library/` and the take's cue timing.

![JSON editor](journey/25-json-editor.jpg)
![Pictures for choices](journey/26-icon-choices.jpg)
![The logo as clipart, drawing in](journey/27-logo-clipart.jpg)
![AI features](journey/28-ai-features.jpg)

## Step 16: Editing text on the board

Jakub wanted to edit text and labels where they are. Double-clicking a text, a label (icon, box, arrow, 3D) or a chart title (or pressing Enter with the element selected) opens a text box exactly over it, in the same handwriting, colour and size, following the zoom; Enter keeps it, Esc cancels, clicking away keeps it. An element without a label gets one; clearing a label removes it. The renderer now marks which piece of text belongs to which field, so the editor knows where each one is on screen.

**Checked by:** a browser run that edits a title, edits a label while zoomed in, cancels with Esc, removes and re-adds a label with the keyboard, and checks the saved file after each step.

![Editing text in place](journey/29-inline-edit.jpg)

## Step 17: A prompt box home, settings, and AI inside each scene

Jakub's next list: a home screen like Gemini or Lovable (one chat box in the middle that switches between a topic, a script and a recording, with a model chosen per kind), a place for API keys (and the question whether a Claude subscription could be used), a smoother first animation for bar and line charts, clearer scene properties, adding scenes, clipart and 3D models with AI, and asking AI to change the open scene.

- **Home:** "What do you want to explain?" over one prompt box with Topic / Script / Recording chips, an attach button for recordings and a model picker that remembers its choice per kind. Sending opens the draft chat with the request already sent (or the recording already transcribing). Presentations are listed below with a search box.
- **Settings** (gear on home and in the editor): models and their API keys, the default model per kind of start, the speech-to-text service. On the subscription question: a claude.ai subscription can't be used as an API key by another app; use an Anthropic API key or OpenRouter.
- **Chart intro:** the title, axes and labels used to take most of the draw time, so the bars appeared in a rush at the end, one strictly after another. Now the growing gets about 60% of the time, bars overlap and ease out, and the line is traced smoothly with its dots popping in as the line reaches them.
- **Clearer properties:** every field has a plain name and a **?** with help ("continue from previous scene" instead of `inherit`, "start view" with *Use current view* / *Whole board* instead of camera numbers, "play automatically", "speaker notes"); video settings are grouped under *Video export* with a track picker (me / friend / other); ids and rarely needed fields are under *Advanced*.
- **Creating with AI** is now one dialog for a scene, an icon, clipart or a 3D model: the rules are shown, the reply is checked and repaired, previewed, then kept. A new scene goes after the open one (after any scenes that continue from it, so they don't lose their elements) and opens. 3D models are saved to the library like icons and listed to models writing presentations.
- **Ask about this scene:** a bar above the beats sends "change only scene N" with the whole presentation; the change is undoable and the editor stays on the scene.

**Bugs found on the way:** a new scene inserted between a scene and one that continues from it broke the second one ("unknown element"); fixed and tested. After adding a scene the editor reopened the old one; it now opens the new one.

**Checked by:** 47 unit tests and browser runs of every flow against the mock model: home topic/script/recording with the remembered models, settings, *Use current view*, scene ask with undo, a scene and a 3D model made with AI.

![Home prompt box](journey/30-home-prompt.jpg)
![Settings](journey/31-settings.jpg)
![Chart intro, frame by frame](journey/32-chart-intro.jpg)
![Scene properties](journey/33-scene-properties.jpg)
![A scene with AI](journey/34-scene-with-ai.jpg)
![A 3D model with AI](journey/35-3d-with-ai.jpg)
![Asking AI to change the open scene](journey/36-scene-ask.jpg)

## Step 18: Safer deleting, a beats storyboard, and a library window

Jakub found that deleting the open scene blanked the whole app, that confirmations used the browser's own dialog, that beats and actions were hard to read, and asked for a proper place to manage icons, clipart and 3D models.

- **The blank screen:** after deleting the last scene the editor still pointed at a scene number that no longer existed, and the first panel to read it crashed React. The open scene is now always kept within the scenes that exist, and deleting moves to the scene before.
- **In-app confirmations:** one small dialog (title, what goes with it, Cancel / a red Delete; Enter and Esc work) replaces every browser `confirm()`: scenes, presentations, takes, recordings, replacing with an example, and the library.
- **Beats as a storyboard:** beats run left to right with how each starts (on click or auto) and how long it takes. Each action shows a coloured verb (green reveals, pink hides, yellow draws attention, cyan moves, orange camera), chips for the elements it acts on in their own marker colours, and a small bar showing when it runs inside the beat, so "together with the previous one" is visible at a glance. The compiler now reports each action's start and end for this. **+ action** opens a menu of the common actions for the selected elements, and actions can be dragged to reorder them or to another beat.
- **Library window** (⤢ next to the library search, and **Library** on the home screen): everything by group with counts (icons, logos, clipart, 3D models, made by me), search, large tiles, and a side panel that draws the selected item in on a small board (click to replay, try marker colours), its description and tags, and the JSON to use it. Things you made can be renamed, re-described and deleted there, and "New with AI" makes icons, clipart and 3D models without leaving it.

**Checked by:** 48 unit tests (new: action timing) and browser runs: deleting the open last scene (cancel, delete, undo), adding actions from the menu and dragging one to another beat, and in the library making a 3D model with AI, renaming it, deleting it, and double-clicking a built-in model onto the board.

![Confirmation](journey/37-confirm-dialog.jpg)
![Beats storyboard](journey/38-beats-storyboard.jpg)
![Adding an action](journey/39-add-action-menu.jpg)
![Library window](journey/40-library.jpg)
![Managing your own items](journey/41-library-mine.jpg)

## Step 19: Talking an item over until it's right

Jakub wanted to create items from the library too, and to chat about an element until he's happy with it before it goes into the library.

- **Making something with AI is now a conversation.** Describe it and send; the reply appears as *Version 1* with a preview. Then ask for changes ("make the body pink", "add a fan on top"); each reply is the next version. Click any version to look at it large, and save the one you like under a name. You can switch models between replies, and a reply that breaks the rules even after the automatic repairs says so and you just ask again.
- Under the hood, every follow-up sends the first request, then each version and the change asked of it, and the model replies with the whole item again under the same rules, so every version is checked the same way (tested).
- **From the library window, everywhere:** "New with AI" (icon, clipart, 3D model) now works from the home screen's library too. **Refine with AI** on your own items starts the conversation from the saved version and saves over it; **Make a variation with AI** on a built-in item starts from it and saves a new one (named `my-<original>`).
- Scenes made with AI ("+ scene with AI" in the editor) use the same conversation.

**Checked by:** 49 unit tests and browser runs against the mock model: a clipart made in three versions with a model switch, saving an earlier version; refining it from the library; a variation of a built-in 3D model; a scene refined once and added.

![A conversation about a clipart](journey/42-chat-about-clipart.jpg)
![A variation of a built-in 3D model](journey/43-variation-3d.jpg)
![A scene made in a conversation](journey/44-chat-scene.jpg)

## Step 20: Drawing-program polish

Jakub's notes: scrollbars too big, position and size fields that don't look like a drawing program, text getting selected while moving a box, and a more graphical choice of border and arrow styles (with dotted, and a big arrow).

- **Scrollbars** are thin (6 px) and nearly invisible until hovered, everywhere.
- **Position and size** sit at the top of an element's properties as a compact grid: X, Y, W, H, a size or scale field, rotation and corner radius, each with a small letter or picture inside the field. Dragging a label sideways changes the number (Shift for steps of 10); a drag is one undo step.
- **No more selecting text while dragging:** the board can't start a text selection, and nothing on the page gets selected while something is being moved.
- **Line styles:** boxes and arrows take `line` (solid, dashed, dotted) and `weight` (normal, bold; a bold arrow also gets a bigger head), picked from pictures. Dots are zero-length dashes with round ends, drawn in through the same mask as dashes. Older files with `"dashed": true` still work, and choosing a style tidies that away.

**Checked by:** 49 unit tests and a browser run that drags a box across the board (checking nothing gets selected), sets a box to dotted and bold, drags its W label, and makes an arrow dashed and bold, checking the saved file each time.

![Position and size](journey/45-position-size.jpg)
![Line styles](journey/46-line-styles.jpg)

## Step 21: Tidier left panel

"+ New scene" and "✦ New scene with AI" now sit on their own lines under the scenes, and the Icons / Logos / Clipart / 3D headings have a little space above and below so they read as headings over their pictures.

![Left panel](journey/47-left-panel.jpg)

## Step 22: Screenshots, areas and a spotlight

For explainer videos Jakub wanted to paste a screenshot of an interface and draw on it, optionally framed as a browser window in the app's style, circle part of it, and darken or fade everything else to focus attention.

- **`image` element:** paste a screenshot (Ctrl+V), drop a picture on the board, or click **Image**. The local server keeps pictures in `images/`, named by their content, so pasting the same one twice stores it once; with no server the picture is kept inside the presentation. The picture fits the current view and resizes keeping its proportions.
- **Browser frame:** `"frame": "browser"` draws a window around the picture in marker: rounded outline, bar, three dots and an address field with your text. It draws in stroke by stroke, then the screenshot is revealed left to right. The next picture remembers the frame you chose.
- **Pictures stay crisp under the drawing.** The glow filter works on the whole drawing layer, and a blurred halo around a screenshot looked wrong, so pictures live in their own layer underneath; every frame each picture copies its element's position, scale and opacity, so moving, popping, fading and erasing work as for anything else.
- **`area` element:** an invisible rectangle or ellipse marking part of a screenshot (a dashed outline while editing). Select a picture and click **Area** to put one over its middle. Its properties offer one-click beats: spotlight and circle it, spotlight it, circle it, zoom to it.
- **`spotlight` action:** everything outside the target goes darker (`dark`) or fades into the board (`fade`), by `amount`, in the area's shape; it stays on between beats, a new spotlight slides the light to new targets, and `"on": false` turns it off. Anything drawn while it is on (the circle, a note, an arrow) is kept above the dimming, so annotations stay bright.
- Exports wait for every picture to load before the first frame.

**Checked by:** 52 unit tests (new: spotlight on/move/off and what stays above it, a spotlight without a target, framing a framed screenshot) and browser runs: pasting a screenshot, choosing the browser frame and address, adding an area over it and a spotlight-and-circle beat, and playing a scene through draw, spotlight (dark and fade) and lights back on.

![Screenshot drawn in, spotlight dark, spotlight fade, and the editing view](journey/48-screenshot-spotlight.jpg)
![Area with one-click beats](journey/49-area-quick-beats.jpg)
![Picture properties](journey/50-image-properties.jpg)

## Step 23: Reset view, text styles, colourful tools

- **Reset view:** panning and zooming can lose the board, so the board has **Reset view** (back to the scene's start view, key 0) and **Fit all** (everything on it, Shift+0) in its corner.
- **Text styles:** `marker` (the handwriting so far), `bold` (chunky outlined capitals with an offset echo, in the spirit of the JZ in the logo; Bungee font) and `code` (JetBrains Mono). Text can now have several lines; code keeps its indentation and its lines line up on the left wherever the block is placed. Code is edited in place in a box that takes new lines (Ctrl+Enter keeps it), and in the properties in a monospace box where Tab indents. Exports load the new fonts before the first frame.
- **Tools with colour:** Text, Box, Chart, Arrow, Image and Area each have a small line picture in their own marker colour, with a faint tint and glow; "New scene with AI" and "New with AI" have a pink sparkle.

![Text styles, and editing code in place](journey/51-text-styles.jpg)
![Tools](journey/52-tool-icons.jpg)
![Text properties](journey/53-text-properties.jpg)

## Step 24: An explainer about jz-motion, made in jz-motion

Jakub asked for a template that explains the app itself (features, screenshots, architecture, why it is LLM first) and a script to read over it. The pitch: he built it to make explainers and presentations quickly because he never has time to publish; it is designed so cheaper models (Claude Haiku) and specialised ones (image models via fal.ai) can take over parts of the work; and a library that grows with every explainer lowers the cost of the next one. Everything is LLM first, with every generation held to one style. Inspiration: IBM Technology's lightboard explainers.

- **The example** `src/examples/about-jz-motion.json`, ten scenes and 46 beats: title; why (ideas that never become videos, the IBM inspiration); starting from a sentence (home screenshot, spotlighting the prompt, the three ways in and the model picker); the editor (storyboard, ask bar, properties); LLM first (format and library in, JSON out, check and repair loop, then the board, and a zoom into the JSON); one style for everything (icon, clipart, 3D, chart in the same markers, then the AI creator conversation); the library and a falling cost per explainer; architecture (browser, local server, swappable models, fal.ai next); the right model for each job; recording and publishing.
- It uses this round's features throughout: screenshots in browser frames with areas, spotlights and circles; bold headlines; code text; camera moves; flows; set-values.
- **Screenshots** of the current app were captured with Playwright (against the mock model) and ship in `public/examples/about/`, so the example works anywhere, exports included.
- **The script** is the beats' speaker notes (about 840 words, 6 to 7 minutes), collected in `docs/explainer-script.md` with recording steps and a ready title, description and chapter list for publishing.
- **Bug found by it:** a line chart's last point and value never appeared: points popped in only after the line had passed them, and the line never passes its last point. Points now pop in as the line arrives.

![The about template, scene by scene](journey/54-about-template.jpg)

## Step 25: Timing to a voice-over

Jakub wanted more control over timing, so a presentation can follow a voice-over. Beats could already carry a `cue` (seconds into a recording), but only presentations made from a recording had them, and there was no way to see or change them.

- **Timing window** (top bar): the narration's waveform with a time ruler, and every click of the presentation (a beat plus the auto beats after it) as a marker in its scene's colour, with a bar showing how long its animation runs. Solid markers sit on their cue; dashed ones have none and follow the click before; red ones have a cue earlier than the previous click finishes.
- **Placing clicks:** drag a marker (snaps to 0.05 s), double-click it to clear its cue, or switch on **Tap to place**, play, and press T as each line starts: each tap places the next click. Everything goes through undo.
- **Reading along:** the board plays in sync with the audio, and beside it the current beat's speaker notes (the script line) and the next one with its time.
- **Voice-over** is any audio or video file, stored by the local server (`uploads/`, served with range requests so the player can seek) and named in the presentation's new `voiceover` field. Without one, the same timeline runs on a silent clock for rehearsing.
- **Make a take for export** builds a take from the cues, with the voice-over (copied, so the presentation keeps it) as its sound, and opens it in the Video tab.
- The cue logic moved into one function (`cueClicks`) that both the export and the window use, so what you see is what exports.

**Checked by:** unit tests (which clicks sit on a cue, which come too early) and a browser run on the about template with a generated 60-second voice-over: loading it, dragging a click to 20.5 s, tapping three clicks while it plays, and making a take that opens in the Video tab.

![Timing window](journey/55-timing.jpg)

## Step 26: My Claude subscription, skills for fresh conversations, and a teleprompter

Jakub builds jz-motion for himself and wants to run it locally on his Claude subscription; to have documentation and skills good enough that a fresh Claude conversation can work with the project without any history; and to use the Timing window as a teleprompter. He was also unsure whether screen recordings would make the project too complicated.

- **Claude Code as a model provider.** The local server can answer model requests by running the `claude` command on the same computer (`claude -p`, JSON output, tools, settings and plugins off), with the person's own login: no API key. Conversations are passed as a transcript and the reply goes through the same checks as any model. Settings finds Claude Code and offers **Add Sonnet and Haiku** in one click. It is meant for personal local use only. Checked for real: Haiku through the subscription drafted a four-scene CDN explainer from one sentence in 18 seconds, in the house style.
- **One style guide.** The rules the app sent to models lived in a code string; they are now `docs/style.md`, which the app's prompts and the Claude Code skills both read (plus a new rule after the CDN test: when a scene continues from the previous one, don't put new things on top of old ones).
- **Skills and CLAUDE.md.** `.claude/skills/` has `new-presentation`, `edit-presentation`, `library-item` and `voiceover-and-video`; `CLAUDE.md` explains the project, the folders and the conventions. Two new commands give a model something to verify with: `npm run check` (validates a presentation or library item with the app's own rules; `--library` lists everything that can be drawn) and `npm run snapshot` (PNGs of every scene, so it can look at what it made). Tested with a fresh Claude Code conversation with no context: asked for an HTTP caching explainer, it found the skill, read the rules, wrote the file, checked it, looked at the snapshots, fixed a crowded scene and handed over the link.
- **Docs rewritten** to match the app: README (setup with the subscription, three ways to make a presentation, editor, AI, screenshots, narration and video, commands), `docs/models.md` (providers, which model for which job, transcription), `docs/design.md` (decisions, code map, phases), `docs/format.md` (cues).
- **Teleprompter and narration recording.** The Timing window can record the narration itself: the script (speaker notes) shows large, you read, and press → or Space as you start each next line, which places that beat at that moment; ← takes back an early press, Esc stops. One read-through gives the voice-over and the timing. **Prompter** shows the script large at any time.
- **Early cues.** Pressing → before the previous animation had finished used to be ignored. Now an early cue starts its beat on time and the previous animation jumps to its end, like an early click when presenting live.

**Checked by:** 55 unit tests (new: early cues), the real Claude Code calls above, a narration recording with a simulated microphone (placing, taking back and re-placing lines, then saving the voice-over), and the Settings offer in the browser.

![Settings offers the Claude subscription](journey/56-claude-subscription.jpg)
![Recording narration with the teleprompter](journey/57-prompter.jpg)
![Made by a fresh Claude Code conversation using the skills](journey/58-fresh-conversation.jpg)
![Drafted by Haiku through the subscription](journey/59-haiku-subscription.jpg)

## Step 27: Which action, when

Jakub asked whether the docs tell models *when* to use things like a circle. Barely: `format.md` says what each action does, and the style guide had three one-line hints. Models used actions correctly but rarely chose between them, so most beats were plain `draw`.

- `docs/style.md` gained **Which action, when**: a table from what the viewer should do (watch something being built, notice one thing, ignore the rest, follow data moving, see a change of state, see numbers change, look inside a 3D object, look at a detail, clear space, pause) to the action for it (`draw`, `pop`, `circle`, `pulse`, `spotlight` dark or fade, `flow`, `recolor`, `move`, `set-values`, `explode`, `rotate`, `camera`, `erase`, `fade-out`, `wait`) and what to avoid. Plus **pacing**: one emphasis per beat, `start: "with"` and `auto` beats for things that belong together, one to three spoken sentences of notes per beat, build up then focus, and end a scene by pulling back.
- Because the app's models and the Claude Code skills both read the style guide, both get the guidance.

**Checked by:** the same request as in step 26 (a two-scene HTTP caching explainer) to a fresh Claude Code conversation. Before: twelve draws, one circle, one flow, one recolor, two fade-outs. After: requests shown moving with `flow` while they are talked about and switched off when moving on, one point per beat, and the "or a new file" ending as a `pop`. It still drew rather than `recolor`ed the copy going stale, so the guide helps but doesn't do the director's job for it.

![The HTTP caching explainer after the guide (beats 3, 5, 6 and 7)](journey/60-which-action.jpg)

## Step 28: Which model for which job

Jakub asked whether Opus should be available, and then for the model menus to recommend a model that is sufficient for the job at hand, for example when drawing a logo.

- **Recommendations everywhere a model is picked.** Each menu knows its job (an icon, clipart, a 3D model, a change to one scene, a new scene, chat about the whole presentation, a presentation from a topic, a script or a recording) and the size of model it needs. Models are sorted into small, medium and large, guessed from their names (haiku, mini, flash; sonnet; opus, gpt-5, gemini pro) or set in Settings. The menu marks the smallest one that is enough as **★ recommended**, the others as *enough*, *works, smaller than ideal*, *may struggle* or *more than needed*, and a line under it says why ("A small, fast model is enough for an icon: a few strokes, and the rules and checks keep it on style").
- **Defaults follow the recommendation** until you choose: Haiku for icons, 3D models and scene edits, Sonnet for clipart, new scenes, chat and presentations from a topic, Opus for presentations from a script or a recording. A choice you make is remembered for that job. Settings' "model for each way of starting" shows the recommendation as its default.
- **Opus**: the subscription offer now adds Opus, Sonnet and Haiku (Opus unticked so Compare doesn't use it unasked), with a **+ Claude Opus** button for anyone who added the other two before. Models show a size badge in Settings and can be given a size by hand.
- The logic lives in one place (`src/ai/recommend.ts`) with tests (sizes from names, the smallest model that fits, falling back to the biggest there is and saying so, remembered choices).
- Found on the way: "gemini" contains "mini", so Gemini Pro was first guessed as a small model.

**Checked by:** 59 unit tests and a browser run with Opus, Sonnet and Haiku through the subscription: the home box (topic → Sonnet, script → Opus), New with AI (icon and 3D → Haiku, clipart → Sonnet, a choice of Opus for icons remembered), and Settings.

![Recommendations on the home screen, in New with AI and in Settings](journey/61-model-recommendations.jpg)

## Step 29: An LLM Lab explainer, from a script

Jakub gave a five-minute script for a video about LLM Lab, his prototype for choosing AI models with the team's own data and rules, and asked for a template made from it, with the screenshots, icons and animations it needs. He also asked to expand on RAG and on why the lab tests the models it does: only models that are worth fine-tuning.

- **The example** `src/examples/llm-lab.json`, 17 scenes and 78 beats, the script's lines as speaker notes: opening (a new "#1" every week, three questions, the title); how models get chosen (leaderboard, sales deck, first team's pick); someone else's test (a chart whose bars swap from English to Polish tickets, two points for thirty times the price, nobody re-checks); our data, our criteria, our decision, then each one in detail; **new:** where the four kinds of model sit in RAG (documents → chunking → embedding → index; question → classification → embedding → top 50 → reranking → top 5 → answer); **new:** why these four (big general models are prompted, not tuned; narrow, high-volume building blocks are worth fine-tuning, so they are worth testing, with the ModernBERT cost numbers); then the walkthrough on screenshots (the four categories in the sidebar, three numbers and four answers, quality vs cost and the quality bar, the ModernBERT row, intents only, ties and ± ranges, test and training sets); why it matters; close.
- **RAG in 3D** (asked for after the first version): an isometric scene of the three retrieval models at work. A document stack explodes into pieces as the chunking model cuts it; the chunks go through a spinning embedding chip into a 3D vector index, which turns to show its points; the question takes the same embedding model to the index; four result cards pop up, the reranking chip scores them, and the best one turns green and swaps places to the front before the top five go to the answer. Each model gets a yellow "we test:" note (does each piece stand alone? is the right chunk in the top 10? is the best one first?). Two new 3D models for it: `document-stack` and `vector-index`.
- **Screenshots** of LLM Lab in its dark theme, taken with Playwright from the addresses in the script's recording notes, ship in `public/examples/llm-lab/`. Areas over them drive the spotlights and circles.
- **Thirteen new built-in drawings**, all in `src/engine/icons.custom.json` and `iso-models.json` so the bundled example works anywhere: `trophy`, `coin`, `stopwatch`, `balance-scale`, `scissors`, `tag`, `magnifier`, `rerank-list`, `flask`, `target`, `id-card`, `checklist`, `vector-space`, and the 3D models `podium`, `document-stack` and `vector-index`.
- **The script** with recording notes is in `docs/llm-lab-script.md` (about 1,180 words, generated from the speaker notes).
- **Bug found by it:** `npm run snapshot` never loaded `library/`, and only ignored "unknown icon" errors, so a presentation using your own icon in an arrow or a beat failed with "unknown element". It now loads the library before checking, like `npm run check` and the page do.

**Checked by:** `npm run check` and snapshots of every scene and beat (fixed on the way: spotlights on sidebar rows lit two rows until the padding was cut, a circle around the whole quality line, cost values rounded to 0.0 until shown in cents, a podium that read best turned by −30°), 60 unit tests (including every bundled example compiling), and opening the example from the home screen in the browser with no errors.

![LLM Lab template, six of its sixteen scenes](journey/62-llm-lab-template.jpg)
![Opened from the home screen in the editor](journey/63-llm-lab-in-editor.jpg)
![RAG in 3D: chunking, embedding, the question, reranking](journey/64-rag-3d.jpg)

## Step 30: Keeping the audience's eyes in the right place

Jakub asked for another pass on the LLM Lab template so that camera moves, areas and circles keep attention where the narration is. The first version mostly drew things at full-board size and lit screenshots with spotlights, which left the screenshots' text too small to read in a video.

- **The camera follows the explanation.** Diagrams are taken one part at a time: the benchmark chart, then each column of *our data / criteria / decision*, each row of the RAG pipeline, and each stage of the 3D scene (the document and chunker, the embedder and index, a close-up of the index as it turns, the reranker and its cards). Each scene pulls back to the full board at the end.
- **Screenshots are read up close.** On the Recommendations page the camera zooms into one card's three numbers, then into the row of four answers. On Classification it zooms into the chart while the "better" arrow is drawn and the quality bar label is circled. On the ModernBERT row it takes the row, then its price with the note, then the personal-data warning with its note. On intents it shows the tab with its note, then the cards. On embedding it shows the ± scores, then the circled tie. On training sets it shows the overlap column. Notes that would sit off-screen during a zoom are written when the camera pulls back, as a summary.
- **One emphasis per beat.** Circles now mark the one thing you'll keep talking about (the price claim, "nobody checks", the classifier at the front door, the quality bar, the personal-data minimum, the tie). Each circle is erased before the next one when they would compete.

**Checked by:** snapshots of all 78 beats (a frame that went past the board's right edge was replaced by the full view), `npm run check`, 60 unit tests, typecheck and build.

![Zoomed beats: the benchmark chart, the classifier, the turning index, the quality bar, the personal-data minimum, the tie](journey/65-attention-pass.jpg)

## Step 31: The app's AI works like Claude Desktop, shows its steps; fixed-on-screen elements; animated screenshots

After making a template with Claude Desktop (the whole repository as context), Jakub noticed it gave much better results than the AI inside the app, that the app gave no feedback while a model worked beyond "thinking", that explanation text should stay visible while the camera zooms into a screenshot, and asked whether animated screenshots (APNG) could be played and stopped on cue.

- **Why the difference:** the app sent a model one request (the style guide, the format and the library) and asked for JSON in one go. Claude Desktop reads the examples, writes the file, runs the check, looks at snapshots and fixes what looks wrong.
- **Agent mode** for **Claude Code (my subscription)**: the app now runs Claude Code in the repository (`claude -p`, streaming), with the project's skills, on a draft copy of the presentation in `presentations/.drafts/`. It may read files, write files, use skills and run `npm run check` and `npm run snapshot`; nothing else. When it finishes, the app loads the draft, checks it again and applies it (undoable). A conversation keeps its session, and the command to continue it in a terminal is shown. Tested for real: Sonnet made a vector-database explainer in 38 seconds, reading the style guide, the format and an example, checking and looking at its snapshot. The first run tried shell commands it isn't allowed and had to retry; telling it its tools up front fixed that. Per model it can be switched off for the quick one-request mode.
- **Seeing what happens:** every AI request (draft chat, AI tab, scene ask bar) shows its steps live (for agents: using a skill, reading a file, writing the draft, running the check, looking at a snapshot; for one-request models: what was sent, what came back, what the check found), each with a **view** of the full text, so prompts and skills can be tuned.
- **One-request models** now also get a finished example presentation with the rules (the hardware scene, which gained speaker notes).
- **Fixed on screen** (`pinned`): any element can be drawn in a screen layer outside the camera, so it keeps its place and size while the camera zooms, and stays above spotlights. Ticking it keeps the element exactly where it looks at that moment (its position and size are converted through the current view). The camera can't zoom to a pinned element, and an arrow can't join something pinned to something on the board; the check says so in plain words.
- **Animated pictures** (APNG, GIF, animated WebP) are decoded frame by frame with the browser's own decoder into a canvas. A new **play** action starts, pauses (`"on": false`), jumps (`from`) and speeds up (`speed`); a picture's `loop` repeats it; without `play` it shows its first frame. It keeps playing between beats, driven by the same clock as flows, so exports are exact; the exporter waits for each frame to be drawn.
- **Bugs found:** an instant switch (flow, spin, play) that ended a beat sat exactly where the timeline stopped, so it never switched; such switches now take 2 ms. A pause first reset the animation to its start: only a play with `from` jumps now.

**Checked by:** 63 unit tests (new: pinned elements, play), real agent-mode runs through the subscription, a scene where the camera zooms into a screenshot under a pinned title and note, an APNG test pattern (a running counter) rendered frame by frame through the export page (still at 0 before play, 1 s when paused, 1.5 s after jumping to 0.5 s at double speed), and the same picture playing live in Play mode.

![Agent mode: Claude Code working in the project, step by step](journey/66-agent-mode.jpg)
![Fixed on screen: the camera zooms into the storyboard, the title and note stay](journey/67-fixed-on-screen.jpg)
![An animated screenshot: before playing, playing, paused, and after jumping](journey/68-animated-screenshot.jpg)
