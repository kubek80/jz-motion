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
```

- One clip per sentence (the prompter's lines), cached in `tts/<id>/` so a sentence is paid for once; the app's **Generate voice** uses the same cache.
- The service comes from the environment: `OPENROUTER_API_KEY` (OpenRouter, Voxtral, voice `en_paul_neutral`), `OPENAI_API_KEY` (gpt-4o-mini-tts, `alloy`), or `TTS_BASE_URL`, `TTS_MODEL`, `TTS_VOICE`, `TTS_API_KEY`. In the app: Settings → Voice generation has the same presets. In a Claude cloud session where the key is a saved credential (the proxy adds it), run `OPENROUTER_API_KEY=proxy-injected NODE_USE_ENV_PROXY=1 npm run voice -- …`.
- `place` is how new scenes join a timed presentation (see the edit-presentation skill): the scene's narration goes where the scene plays, later clips and cues move on, so nothing else changes timing. Its clips are `uploads/generated-<scene-id>.webm`, kept in git (LFS) so they reach the person's computer; their own recordings stay local.

## Your part as the assistant

- Good notes make good narration: one or two spoken sentences per beat, in the user's voice. Use the edit-presentation skill to improve them.
- `docs/explainer-script.md` shows the expected shape of a script document if the user wants one.
- Export from the command line (automatic timing, or a take):

```sh
npm run export -- presentations/<id>.json                 # even pauses between beats, no sound
npm run export -- presentations/<id>.json --take <takeId> # a take's timing and sound (ls takes/); --raw-audio keeps the volume as recorded
```

Export needs FFmpeg and Playwright's Chromium (`npx playwright install chromium`). It takes roughly a minute per minute of video.
