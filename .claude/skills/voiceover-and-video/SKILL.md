---
name: voiceover-and-video
description: Time a jz-motion presentation to a narration and export it as an MP4 (voice-over, takes, recording, camera layouts, the export command). Use when asked to make the video, export, time beats to audio, prepare a teleprompter script, or explain how recording works.
---

# From presentation to video

## How timing works

- A presentation is played as **clicks**: each beat (plus the `auto` beats after it) starts on a click.
- A **take** (`takes/<id>/`) is one performance: when each click happened, plus recorded tracks (voice, camera). Export renders the board frame by frame to that timing and mixes the tracks.
- A beat's `cue` is seconds into the presentation's voice-over timeline: `voiceover.clips`, recordings in `uploads/` placed on two lanes, each with an offset and a trimmed part of its file (see docs/format.md). A cue earlier than the previous animation's end cuts that animation short, like an early click. The Timing window owns `voiceover` and the cues: don't edit them by hand; when you add or split beats, leave the new ones without a cue.

## Ways to get the timing (all in the app, `npm run dev`)

1. **Record narration with the teleprompter:** open the presentation → **Timing** → **● Record narration**. Read the current line (the beat's `notes`), press → when you start each next line (Space holds the prompter, Esc stops). This adds a voice clip from the playhead and places every beat; recording again later adds another clip, which can be trimmed, split (S) or moved.
2. **Pacing first (optional):** **Generate voice** makes a text-to-speech clip per sentence of the notes (Settings → Voice generation), so the prompter and the **Script** page show how long each line takes.
3. **An existing narration file:** **Timing** → **Load a voice-over…**, then drag beats onto the waveform, or **Tap to place** and press T as each line starts.
4. **Present live:** Play mode → **● Record** (optionally with camera); your clicks are the timing.

From 1 or 3: **Make a take for export** in the Timing window. Then the **Video** tab → choose the take, layouts per beat or scene (`layout`: board, pip, pip-left, camera, side), **Export MP4** (files in `exports/`). Noisy narration can be cleaned per clip first (Timing → right-click a clip → Clean up voice; local RNNoise, the original is kept). The sound is evened out to a standard loudness (-16 LUFS) by default, so a quiet recording comes up; untick *even out volume* to keep it exactly as recorded. Export time goes into painting frames: frames where nothing moves are reused, so long still stretches are cheap, and constant motion (flows left on, swaying clipart, recordings playing) makes every frame cost.

## Generated voice from the command line

```sh
npm run voice -- time  presentations/<id>.json [--scenes id,id]   # per beat: animation vs. how long its words take
npm run voice -- place presentations/<id>.json --scenes id,id     # new scenes in a timed presentation: their generated voice on the timeline
npm run voice -- rebuild presentations/<id>.json                  # the whole voice-over again: one generated clip per playing scene
npm run voice -- again presentations/<id>.json --scenes id,id     # a scene's notes changed: its clip said again in place, what follows moves on
```

- One clip per sentence (the prompter's lines), cached in `tts/<id>/` so a sentence is paid for once; the app's **Generate voice** uses the same cache.
- The service comes from the environment: `OPENROUTER_API_KEY` (OpenRouter, Voxtral, voice `en_paul_neutral`), `OPENAI_API_KEY` (gpt-4o-mini-tts, `alloy`), or `TTS_BASE_URL`, `TTS_MODEL`, `TTS_VOICE`, `TTS_API_KEY`. In the app: Settings → Voice generation has the same presets. `TTS_INSTRUCTIONS` gives a style ("calm, clear narrator") to models that take one; `TTS_SAMPLE=<upload>[@start-end]` with a cloning model (`TTS_MODEL=fish-audio/s2.1-pro` or `heygen/heygen-voice-1`) speaks in the person's voice, copied from that part of one of their recordings (10–30 s of clear speech; transcribe it first for a closer copy). When `voice/my-voice.json` exists (the person's voice, kept with the project, with its speaking style in `instructions`: keep it, it is how they want to sound), `npm run voice` uses it by default: generated lines are in their voice (`TTS_MY_VOICE=0` for another one). In the app the person sets it in **🎙 My voice** (home screen, Timing or Settings: records a sample reading a suggested text, which is then sent as its transcript). Prefer their voice when they have set one, so a new scene sounds like the rest until they record it. In a Claude cloud session where the key is a saved credential (the proxy adds it), run `OPENROUTER_API_KEY=proxy-injected NODE_USE_ENV_PROXY=1 npm run voice -- …`.
- `place` is how new scenes join a timed presentation (see the edit-presentation skill): the scene's narration goes where the scene plays, later clips and cues move on, so nothing else changes timing. Its clips are `uploads/generated-<scene-id>.webm`; everything in `uploads/` is kept in git (LFS) so it reaches the person's computer.
- `rebuild` replaces the whole voice-over: one clip per playing scene from its notes, one scene after another, each beat cued where its words start; where a beat's animation outlasts its words (and the wordless `auto` beats after it), the pause after them grows. Scenes left out lose their cues. Use it when asked to re-create the narration; when the person recorded short clips, transcribe them (Timing → Transcribe, or `POST /api/transcribe?upload=<file>`) and write the notes from what they *said*, tidied (fix misheard names), not from the old script. A beat they said nothing for becomes `auto` without notes.

In the app, a clip's window (double-click it in Timing) has **✨ Generate again**: the same thing for that one clip, from the current notes, as a new file (`uploads/generated-<scene>-<id>.webm`, so Undo still has the old one). Joined clips are levelled to -16 LUFS, the level the video aims for.

## Your avatar

The person's avatar is app-level, like their voice: `voice/my-avatar.json` (for every presentation) holds the picture it was made from (`uploads/avatar-source-*`), the style it was redrawn in (`style`: by default a flat retro cartoon talking head in a home YouTube studio, the look Jakub chose), the photo in use (`uploads/avatar-photo-*`, 16:9), the fal.ai model that makes it speak (Kling AI Avatar v2 Standard, about 6¢ a second; Pro about 11.5¢), the movement prompt and `calm` (a quieter, evened-out copy of the voice drives the face: small mouth movements, which is how he wants it). Each video is `uploads/avatar-*.mp4`, named on its clip (`avatar`); the export, Timing's board and a still on the editor's board show it where the scene's or beat's `layout` shows the camera: `camera` (full frame) or `side` (the avatar on the left half, the board on the right) for an intro or ending, `pip` in a corner elsewhere.

In the app: **🧑 My avatar** (home screen, Timing, Settings) sets the picture, a styled version of it (an image model through OpenRouter redraws it from the style text, about 14¢), the model, the movement and the fal.ai key. In Timing, **right-click a clip → Make my avatar for this clip**, or its window's **My avatar**; the **video lane** under the voice lanes shows each avatar under its sound (⚠ when the clip changed since, dashed where a scene shows the camera but has no avatar, ⏳ while one is being made).

```sh
npm run avatar -- photo <picture> [--style default|"…"]                        # the avatar's picture; --style: a styled version (OPENROUTER_API_KEY)
npm run avatar -- make presentations/<id>.json --scenes id,id --layout camera  # each scene's clip said by the avatar (FAL_KEY)
```

- Make avatars only for the scenes the person names: they cost money. Tell them the estimate the command prints.
- After a scene's voice changes (`npm run voice -- again`, Generate again, a new take), its avatar says the old words: make it again (`npm run avatar -- make … --scenes id`; the app does it itself after Generate again).
- Changing the look (a new picture or style) doesn't change avatars already made; ask before remaking them all.
- Ask the person before changing their avatar's picture, style or model: it is theirs, like their voice.
- In a Claude cloud session: `FAL_KEY=proxy-injected OPENROUTER_API_KEY=proxy-injected NODE_USE_ENV_PROXY=1 npm run avatar -- …`; fal's files come from `fal.media` hosts, which the environment must allow.

## Recordings belong to scenes

Every clip names its scene (`scene` on the clip): recording in Timing tags it with the scene playing at that moment, re-recording keeps it, `place` and `rebuild` set it. When scenes are moved, added, deleted, left out or put back, the app lays the playing scenes out again in their order, each keeping its own timing inside and the pauses between them, and moves each scene's clips and cues with it; the clips of a left-out scene stay in the file but are not on the timeline. Prefer one clip per scene: a clip that runs across two scenes moves with the first. Older presentations without `scene` on their clips keep the absolute timeline (nothing moves by itself).

## Your part as the assistant

- Good notes make good narration: one or two spoken sentences per beat, in the user's voice. Use the edit-presentation skill to improve them.
- `docs/explainer-script.md` shows the expected shape of a script document if the user wants one.
- Export from the command line (automatic timing, or a take):

```sh
npm run export -- presentations/<id>.json                 # even pauses between beats, no sound
npm run export -- presentations/<id>.json --take <takeId> # a take's timing and sound (ls takes/); --raw-audio keeps the volume as recorded
```

Export needs FFmpeg and Playwright's Chromium (`npx playwright install chromium`). It takes roughly a minute per minute of video.
