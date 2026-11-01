---
name: new-presentation
description: Create a new jz-motion presentation (an explainer drawn on the glowing marker board) from a topic, an outline or a script, and save it so it opens in the app. Use when asked to make, draft or write a presentation, explainer, video or slides in this repository.
---

# Make a new presentation

A presentation is one JSON file in `presentations/<id>.json`. The app (`npm run dev`, http://localhost:5173) lists every file in that folder on its home screen and opens one at `http://localhost:5173/#/p/<id>`. Write the file directly; the app needs no other registration.

## 1. Read the rules (every time; they change)

1. `docs/style.md`: how it should look and flow (board size, spacing, beats, colours, text styles).
2. `docs/format.md`: the exact JSON format: elements, beats, actions and their fields.
3. The library: run `npm run check -- --library` to list every icon, logo, clipart and 3D model you may use, including ones made in this app (`library/`). Use nothing else; there is no free drawing.
4. For a good example of the style, look at `src/examples/hardware.json` (one scene) or `src/examples/about-jz-motion.json` (ten scenes, screenshots, spotlights, speaker notes).

## 2. Plan before writing

- One scene per section or topic change, 3 to 7 beats per scene; a beat is one idea the presenter talks over.
- If the user gave a script, split it into beats and put the exact lines in each beat's `notes`. If not, write the notes yourself in the user's voice: first person, short sentences. They become the script and the teleprompter.
- Decide the 2–4 colours and what each one means before placing anything.

## 3. Write it

- Pick an id: lowercase words and dashes, e.g. `cdn-explained` (letters, digits, `-` and `_` only). Don't overwrite an existing file unless asked.
- Write `presentations/<id>.json` with `"version": 1`, a `"title"` and the scenes.
- Pictures: only reference files that exist. Screenshots the user gives you can be copied to `images/<name>.png` and used as `"src": "/images/<name>.png"`.

## 4. Check, look, fix

```sh
npm run check -- presentations/<id>.json      # must print ✓; fix every error it lists
npm run snapshot -- presentations/<id>.json   # PNG of every scene, fully drawn, in snapshots/<id>/
```

Open the snapshots and look at them: overlapping elements, labels running into each other, text off the board, arrows crossing things, too much on one scene. Fix and run both again. Use `--beats` to see each beat, `--scene N` for one scene.

## 5. Hand over

Tell the user the title, the scenes in one line each, and the link `http://localhost:5173/#/p/<id>` (start `npm run dev` if it isn't running). Suggest the next steps they can take in the app: adjust in the editor, then **Timing** to record the narration with the teleprompter.
