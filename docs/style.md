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
- Use numbers as charts, comparisons side by side, and a `circle` or `spotlight` for the one thing to look at.

## Look

- Six marker colours: green, pink, yellow, cyan, orange, white. Use 2 to 4 per scene and keep their meaning consistent (for example one colour per kind of component).
- Text: `marker` (handwriting) for labels and sentences; `bold` for a scene's headline (short, a few words); `code` for code and JSON, several lines allowed.
- Only use icons, clipart and 3D models from the library; give icons a label. Lines: solid by default, `dashed` for optional or future paths, `dotted` for "not yet" or background links; `bold` arrows for the main path.
- Screenshots (`image`) sit under the drawing; frame app screenshots with `"frame": "browser"`, point at parts with an `area` plus `spotlight` and `circle`, and draw notes beside them.
