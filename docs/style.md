# Style guide

How a jz-motion presentation should look and flow. Every model that writes presentations reads this (the app sends it with every request, and the Claude Code skills read it), so the style stays the same whoever writes. The format itself is in [format.md](format.md); what can be drawn is in [library.md](library.md) plus your own `library/` (`npm run check -- --library` lists everything).

## The board

- The board is 1920×1080 at zoom 1, y pointing down. Keep each scene's main content inside it; zoom into details with a `camera` action and back out with `"focus": "all"`.
- Leave room: about 300 board units between icon centers, nothing overlapping. Icons of size 120–160 and text of 40–60 read well at zoom 1.
- When a scene continues from the previous one (`"inherit": true`), its old elements are still there: put new ones in free space, or `erase` / `move` what they would cover.

## Explaining

- 3 to 7 beats per scene. A beat is one idea the presenter talks over; give each a short title.
- Draw things in the order you explain them. Connect components with labelled arrows; use `flow` to show data moving.
- Put the exact words the presenter says during a beat in its `notes`. They are the script: the Timing window shows them as a teleprompter.
- Use numbers as charts and comparisons side by side. See below for drawing attention.

## Which action, when

Choose actions for what the viewer should do, not just to make things appear. Every beat answers "where should they look now?".

| The viewer should… | Use | Avoid |
|---|---|---|
| watch something being built, part by part | `draw`: components, arrows, diagrams, text you are explaining | `pop` or `fade-in` for things you talk through |
| see something arrive all at once (a result, an answer, a notification) | `pop`; `fade-in` for something calm in the background | drawing a punchline stroke by stroke |
| notice one thing already on the board | `circle` (stays until erased: the thing you'll keep talking about); `pulse` for a quick "this one" while you name it | circling several things in one beat; a circle and a pulse on the same thing |
| ignore everything else for a while | `spotlight`: `dark` on screenshots and busy boards, `fade` when the surroundings still matter. Turn it off (`"on": false`) when you move on | leaving it on for more than a few beats; a spotlight on something not drawn yet |
| follow data, requests or money moving | `flow` on the arrow; it keeps running while you talk. `"reverse": true` for the reply | drawing a second arrow for the way back when one with `flow` says it |
| see a change of state (healthy → failing, old → new) | `recolor`; `move` when the thing really goes somewhere | erasing and redrawing the same thing |
| see numbers change | `set-values` on a chart | a new chart for each number |
| look inside a 3D object | `explode`, then put it back with `"amount": 0`; `rotate` or `spin` to show its sides | spinning while you explain something else |
| look at a detail | `camera` with `focus`, then back with `"focus": "all"` | small text you never zoom into |
| clear space for the next idea | `erase` (feels like wiping the board); `fade-out` when it should leave quietly | a crowded board; erasing what the next sentence refers to |
| pause and take it in | a beat with no actions, or `wait` inside one | waits longer than a breath; let the narration set the pace |

### Pacing

- One emphasis per beat: a `circle`, `pulse`, `spotlight` or `camera` move, not several at once.
- Beats that belong to one sentence go together: use `"start": "with"` inside a beat, or `"auto": true` for a beat that should follow the previous one without a click.
- Speaker notes of one to three spoken sentences per beat (about 10–15 seconds). A beat with a long paragraph needs splitting; one with no notes usually belongs to the beat before.
- Build up, then focus: draw the parts first, then point at the one that matters. Finish a scene by pulling back (`"focus": "all"`), turning the spotlight off, or erasing to make room.

## Look

- Six marker colours: green, pink, yellow, cyan, orange, white. Use 2 to 4 per scene and keep their meaning consistent (for example one colour per kind of component).
- Text: `marker` (handwriting) for labels and sentences; `bold` for a scene's headline (short, a few words); `code` for code and JSON, several lines allowed.
- Only use icons, clipart and 3D models from the library; give icons a label. Lines: solid by default, `dashed` for optional or future paths, `dotted` for "not yet" or background links; `bold` arrows for the main path.
- Screenshots (`image`) sit under the drawing; frame app screenshots with `"frame": "browser"`, point at parts with an `area` plus `spotlight` and `circle`, and draw notes beside them.
