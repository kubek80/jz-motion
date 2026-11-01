# Explainer script: jz-motion, explainers fast

The voice-over for the **"jz-motion: explainers, fast (about this app)"** example (home screen → *Start from an example…*). Every paragraph below is also the speaker note of its beat (in the beat's properties, and as the tooltip of each beat in Play mode). Bold words are the beat titles: click once per paragraph.

About 839 words, roughly 6–7 minutes at a relaxed pace.

## Recording it

1. Open the example, switch to **Play**, tick *camera*, press **● Record**.
2. Read each paragraph, then click (→ or space) for the next beat. Pauses are fine; the take keeps your timing.
3. **Video** tab → pick the take → layout `pip` (camera bottom right) → **Export MP4**.

## Script

### 1. jz-motion

**Logo** · Hi, I'm Jakub. This is jz-motion: the little studio I built to make explainer videos like this one.

**What it is** · Everything you'll see here was drawn by it: a glowing marker board, animated beat by beat, with an LLM doing most of the work.

### 2. Why I built it

**Ideas** · I have far more ideas than videos. I write notes, sometimes a full script…

**The gap** · …and then it stops. Recording, drawing, editing, publishing: I never have the time, so the video never happens.

**Inspiration** · My inspiration was IBM Technology's lightboard explainers: one person, a glass board, neon diagrams. Clear, calm, and fast to follow.

**The idea** · So the question became: what if the board could draw itself, and a model could help me write it?

### 3. Start with a sentence

**Home** · It starts like a chat. One box in the middle of the screen.

**Prompt** · I type what I want to explain, one sentence is enough, and a model drafts the whole presentation: scenes, drawings, beats and speaker notes.

**Three ways in** · I can start from a topic, from a script I already wrote, or from a recording: then it transcribes me and cues every beat to the moment I say it.

**Model per job** · And each way of starting can use a different model. More on why that matters in a minute.

### 4. Edit like a whiteboard

**Editor** · The draft opens in the editor. The board in the middle, the library on the left, properties on the right.

**Beats** · Under the board is the storyboard. Each card is a beat: one click while I present, with its actions on a small timeline.

**Ask** · Above it I can just ask: 'split this beat in two', 'zoom into the database first'. Only this scene changes, and undo always works.

**Properties** · And everything has properties, with positions and sizes like a drawing program, colours as marker tips, styles as little pictures.

### 5. LLM first

**LLM first** · Under the hood, jz-motion is LLM first. A presentation is not pixels: it's one JSON document.

**Context** · Every request sends the model the format reference, the drawing rules and the whole library: every icon, logo, clipart and 3D model it may use.

**Check** · What comes back is checked against the schema: unknown icons, missing elements, wrong colours…

**Repair** · …and if anything is wrong, the exact errors go back to the model to fix. That loop is why even small, cheap models produce something that loads.

**Board** · Only valid JSON reaches the board, and from there it's all deterministic drawing.

**The JSON** · And because it's plain JSON, I can read it, diff it, keep it in git, or edit it by hand.

### 6. One style for everything

**Same markers** · The other promise is consistency. Whatever a model makes has to look like it came from the same set of markers.

**Everything** · Icons, clipart, isometric 3D, charts, text: the same six colours, the same stroke, drawn in the order a person would draw them.

**Make your own** · When the library doesn't have something, I describe it, and the model draws it under the same rules. The rules are shown, and every reply is checked.

**Versions** · It's a conversation: every reply is a version. 'Make it pink', 'add a fan on top'… until I like one.

**Keep it** · Then I save it, and from then on it's part of the library, for me and for every model that writes a presentation.

### 7. A library that lowers the cost

**Library** · All of that lives in the library: built-in icons, logos and models, and everything I've made.

**Mine** · What I make is saved next to my presentations, with a description the models read to decide when to use it.

**Reuse** · And this is the long game. Every explainer adds a few drawings…

**Cost** · …so the next one needs fewer new ones. Reusing is free; generating costs tokens. The library makes every explainer cheaper than the one before.

### 8. Architecture

**Overview** · Here's how it fits together.

**Browser** · In the browser: a React editor, and the board itself, which is plain SVG animated with GSAP. That's also what renders every video frame.

**Server** · Next to it, a small local server: it keeps presentations, the library and images as plain files, proxies the model calls, transcribes recordings and exports MP4s with Playwright and FFmpeg.

**Models** · And the models are swappable: Claude, or anything OpenAI-compatible through OpenRouter or my own GPUs.

**Next** · Next on the list: image models through fal.ai, for the few things markers can't draw.

### 9. The right model for each job

**Right job** · Because every request is checked and repaired, I don't need the biggest model for everything.

**Story** · A strong model writes the story: the structure, the scenes, the words.

**Small edits** · Small edits, like changing a beat, work fine with a fast, cheap model like Haiku.

**Drawings** · Icons, charts and 3D models are small, strict JSON. Haiku plus the rules is enough, and the library means most are never generated twice.

**Images** · And for real illustrations, a specialised image model, later.

**Settings** · It's one setting: a model per way of starting, and any model for chat or drawings.

### 10. Publish more

**Record** · And the last mile: I click Record and present, like I'm doing now. My voice, my camera and every click are saved as a take.

**Export** · It exports straight to an MP4, with my camera in the corner or side by side with a friend. Or I record first, and it builds the presentation from the transcript.

**Thanks** · That's jz-motion: explainers in minutes, in one consistent style, a little cheaper every time. Thanks for watching.

## For publishing

**Title:** I built an AI studio that draws my explainer videos (jz-motion)

**Description:**
I have more ideas than time to publish them, so I built jz-motion: an LLM-first studio for explainer videos on a glowing marker board, inspired by IBM Technology's lightboard explainers. Describe a topic, paste a script or upload a recording; a model drafts the scenes, drawings and beats; I adjust it like a whiteboard, record myself presenting, and export an MP4.

Everything is one JSON document checked against a schema, so small models like Claude Haiku can do most of the work, and a growing library of icons, clipart and 3D models makes every explainer cheaper than the last.

**Chapters:**
- jz-motion
- Why I built it
- Start with a sentence
- Edit like a whiteboard
- LLM first
- One style for everything
- A library that lowers the cost
- Architecture
- The right model for each job
- Publish more

**Credit:** inspiration from IBM Technology's lightboard explainer videos (youtube.com/@IBMTechnology). Their channel image appears in scene 2; check you're happy with how it's used before publishing.
