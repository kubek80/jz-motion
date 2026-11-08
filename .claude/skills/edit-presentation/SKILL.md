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
- **Beats** are clicks; `auto: true` makes a beat follow the one before. `cue` is seconds into the voice-over. Splitting or adding a beat inside a timed scene: leave the new beat without a cue (it follows the one before) and tell the user to place it in Timing. **Whole new scenes in a timed presentation are different**: see *New scenes in a timed presentation* below; never leave them without cues.
- Speaker `notes` are the script. When content changes, update the notes of the beats that changed.
- **A part of a scene in a scene of its own** ("make a new scene for the part about …"): add the new scene right after it, with a fresh id and title, and **move** that part of the speaker notes into the new scene's beats (take it out of the old beat, so it is said once). Draw what that part says (for "no Photoshop, After Effects or Premiere": the tools as logos or labelled icons, crossed out one by one with a `circle` or a marker line, then what is used instead). If you need a picture the library doesn't have, make it (the library-item skill) or use a labelled `box`. In a timed presentation, give it its generated voice on the timeline (*New scenes in a timed presentation*).

## New scenes in a timed presentation

A presentation is timed when it has a `voiceover` (the narration in Timing) and its beats have `cue`s. A new scene there without cues is a trap: Timing plays it after the scene before, so it starts later than the next scene's cue, and **Timing then ignores the cues after it**: everything that follows plays late against the recorded voice. So, for every new scene (added, split off, or a second version):

1. Write its `notes` (below), then time them: `npm run voice -- time presentations/<id>.json --scenes <scene-id>,…`. Each beat's words should take at least as long as its animation; shorten the animation or say more where they don't.
2. Put its generated narration on the timeline: `npm run voice -- place presentations/<id>.json --scenes <scene-id>,…`. For each scene it joins the sentences into one clip (`uploads/generated-<scene-id>.webm`), opens a gap where the scene plays, cues the scene's beats where their sentences start, and moves every later clip and cue on by the gap (a recording that runs across it is split), so the rest keeps its timing. It must end with "✓ every cue in order".
3. Commit `uploads/generated-*` with the presentation (they are kept in git, with LFS; the person's own recordings in `uploads/` are not). Tell the person to `git pull` and `git lfs pull`, and that the generated voice stands in until they record the scene themselves in Timing.

When the project has the person's voice (`voice/my-voice.json`), `npm run voice` speaks in it, so new scenes sound like them until they record. The service comes from the environment: `OPENROUTER_API_KEY` (Voxtral, about 2¢ per 1,000 characters), `OPENAI_API_KEY`, or `TTS_BASE_URL`/`TTS_MODEL`/`TTS_VOICE`/`TTS_API_KEY`. Without one, ask the person for a key (or to run the command themselves) rather than leaving the scenes untimed.

## A second version of a scene ("version B")

When asked for another version of a scene to compare:

- Add it **right after the original**: id `<original-id>-b`, title `<original title> (B)`. Leave the original exactly as it is.
- **Both play, one after the other**, each with its own voice: the original with the person's recording, the B with its generated voice (*New scenes in a timed presentation*). That is how they judge it: in Timing and Play all, on one timeline. Don't make a separate copy of the presentation for it, and don't leave the B out unless asked.
- **"Leave out of the video"** (`"skip": true` on a scene; right-click a scene in the app) takes a scene out of Timing, Play all, presenting and the export, without deleting it. When they have chosen, they leave out (or delete) the version they don't want and record the scene again in Timing.
- About apps and interfaces, build the B from real captures (the demo-interactions skill), not from older screenshots.

## Writing the script

The `notes` are what the person will say, read off the prompter.

- One idea per beat, one to three short sentences, in their voice ("I click…", "here's…"), not a description of the slide.
- Say what the viewer is looking at at that moment, and only that: if the sentence names it, the beat shows it (a caption, a zoom, a frame of the recording).
- Lead into the next scene; don't repeat what the scene before already said.
- Plain words; no lists read aloud, no headings spoken.
- Then time it (`npm run voice -- time`): a scene of five beats is usually 25–40 s in the generated voice; people often speak faster.

## Check and look

```sh
npm run check -- presentations/<id>.json
npm run snapshot -- presentations/<id>.json --scene N   # the scene you changed
```

Look at the pictures; fix overlaps and crowding. Then tell the user what changed, scene by scene, and that Ctrl+Z in the app does not undo edits made to the file (git does, if the file is committed).
