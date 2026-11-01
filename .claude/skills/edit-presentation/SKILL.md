---
name: edit-presentation
description: Change an existing jz-motion presentation in presentations/ (add or rework scenes, beats, elements, timing, speaker notes, style). Use when asked to edit, fix, extend or restyle a presentation or one of its scenes.
---

# Change a presentation

Presentations are `presentations/<id>.json` (`ls presentations`, or find the title with `grep -l '"title"' presentations/*.json`). The format is in `docs/format.md`, the house style in `docs/style.md`, the library via `npm run check -- --library`. Read them before editing.

## Before you edit

- **The app may have it open.** The editor keeps its own copy and saves over the file on its next change. Ask the user to go back to the home screen (click the logo) while you edit, and to reload the page afterwards.
- Keep what you weren't asked to change exactly as it is, including ids, `cue`s (voice-over timing), `notes` and `voiceover`.

## Things to know

- **ids** are references: arrows (`from`/`to`), actions (`target`, `focus`) and later scenes that `inherit` use them. Renaming one means renaming every reference, in this scene and in scenes that inherit from it.
- **`inherit: true`** makes a scene start with the previous scene's visible elements. Inserting or deleting a scene in front of an inheriting scene changes what it inherits; check the scenes after it.
- **Beats** are clicks; `auto: true` makes a beat follow the one before. `cue` is seconds into the voice-over: if you add or split beats in a timed presentation, leave the new beats without a cue (they follow the one before) and tell the user to place them in the Timing window.
- Speaker `notes` are the script. When content changes, update the notes of the beats that changed.

## Check and look

```sh
npm run check -- presentations/<id>.json
npm run snapshot -- presentations/<id>.json --scene N   # the scene you changed
```

Look at the pictures; fix overlaps and crowding. Then tell the user what changed, scene by scene, and that Ctrl+Z in the app does not undo edits made to the file (git does, if the file is committed).
