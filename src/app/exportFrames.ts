import { stateAt, type Performance } from '../video/performance';

// The small sums behind looking at an exported video frame by frame (ExportViewer.tsx): frame numbers and times,
// which scene and beat a moment of the video shows, and a note written as a line to share.

/** The frame shown at `t` seconds (0 = the first). */
export const frameOf = (t: number, fps: number) => Math.max(0, Math.floor(t * fps + 1e-6));
/** A time inside frame `frame` (its middle, so seeking never lands on the edge of the one before). */
export const timeOfFrame = (frame: number, fps: number) => (Math.max(0, frame) + 0.5) / fps;

/** "1:23.45" */
export const clock = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

export interface Where { scene: number; sceneTitle: string; beat: number; beatTitle: string }

/** Scenes and beats by name, and where each beat starts: a compiled presentation, or what an export kept of it. */
export interface Outline { scenes: { id: string; title?: string; beats: { title?: string; start: number }[] }[] }

/** The scene and beat the video shows at `t`, from the timing it was exported with. */
export function whereAt(p: Outline, perf: Performance, t: number): Where | null {
  if (!perf.events.length) return null;
  const st = stateAt(perf, t);
  const scene = p.scenes[st.scene];
  if (!scene) return null;
  const beat = Math.max(0, scene.beats.reduce((at, b, i) => (b.start <= st.time + 1e-3 ? i : at), 0));
  return { scene: st.scene, sceneTitle: scene.title ?? scene.id, beat, beatTitle: scene.beats[beat]?.title ?? `beat ${beat + 1}` };
}

export interface FrameNote { frame: number; t: number; scene?: string; beat?: string; text: string }

/** A note as a line to paste into a message: where it is, and what was seen. */
export const noteLine = (n: FrameNote) => `- ${clock(n.t)} · frame ${n.frame}${n.scene ? ` · ${n.scene}${n.beat ? ` › ${n.beat}` : ''}` : ''}: ${n.text}`;

/** Every note of a video, in order, with a heading naming the video and how its frames are counted. */
export const notesText = (file: string, fps: number, notes: FrameNote[]) =>
  [`Notes on ${file} (${fps} fps, frames counted from 0):`, ...[...notes].sort((a, b) => a.frame - b.frame).map(noteLine)].join('\n');
