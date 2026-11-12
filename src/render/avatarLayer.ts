import type { AvatarFrame, Rect } from '../video/avatarPlan';
import { VideoStill } from '../engine/videoStill';

// Draws an avatar frame (src/video/avatarPlan.ts) in a 16:9 frame element: places the board's container and the
// avatar videos where the plan says (one, or two side by side in a podcast's `pair`), and shows the right moment of
// each. Used by the export's render page (every frame, waiting for each video to get there, then painting it on a
// canvas: videoStill.ts) and Timing's board (live, following the playhead).

const FRAME_COLOR = '#3ef0ff';
const pct = (r: Rect) => ({ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });
const full = (r: Rect) => r.x <= 0.001 && r.y <= 0.001 && r.w >= 0.999 && r.h >= 0.999;
type Shown = NonNullable<AvatarFrame['video']>;

/** One avatar video on the frame. */
class Slot {
  readonly video: HTMLVideoElement;
  private copy: VideoStill;
  private file = '';

  constructor(frame: HTMLElement, private src: (file: string) => string) {
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    Object.assign(this.video.style, { position: 'absolute', objectFit: 'cover', boxSizing: 'border-box', background: '#000', display: 'none', pointerEvents: 'none' });
    frame.appendChild(this.video);
    this.copy = new VideoStill(this.video);
    frame.appendChild(this.copy.canvas);
  }

  hide() {
    this.video.style.display = 'none';
    this.copy.hide();
    if (!this.video.paused) this.video.pause();
  }

  async show(shown: Shown, rect: Rect, opacity: number, z: string, opts: { exact?: boolean; playing?: boolean }) {
    const v = this.video;
    const look = { ...pct(rect), opacity: String(opacity), zIndex: z, outline: full(rect) ? 'none' : `4px solid ${FRAME_COLOR}` };
    Object.assign(v.style, look, { display: 'block' });
    // Export shows the canvas copy (painted below, once the video is at that moment); live, the video itself.
    if (opts.exact) Object.assign(this.copy.canvas.style, look);
    else this.copy.hide();
    if (this.file !== shown.file) {
      this.file = shown.file;
      v.src = this.src(shown.file);
      await new Promise<void>((ok) => { if (v.readyState >= 1) ok(); else v.addEventListener('loadedmetadata', () => ok(), { once: true }); v.addEventListener('error', () => ok(), { once: true }); });
    }
    const want = Math.min(shown.time, Math.max(0, (v.duration || Infinity) - 0.04));
    if (opts.exact) {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - want) > 0.004) {
        const seeked = new Promise<void>((ok) => v.addEventListener('seeked', () => ok(), { once: true }));
        v.currentTime = want;
        await Promise.race([seeked, new Promise((ok) => setTimeout(ok, 3000))]);
      }
      if (v.readyState < 2) await Promise.race([new Promise((ok) => v.addEventListener('loadeddata', ok, { once: true })), new Promise((ok) => setTimeout(ok, 3000))]);
      this.copy.paint();
      return;
    }
    // Holding a frame (the plan says so, or the file ends): paused on it. Before, a video whose file runs on past
    // the part its clip uses kept playing, was pulled back, played on again: a flicker at the end of the clip.
    const holding = !!shown.still || shown.time >= (v.duration || Infinity) - 0.06;
    if (Math.abs(v.currentTime - want) > (opts.playing && !holding ? 0.3 : 0.04)) v.currentTime = want;
    if (opts.playing && !holding && v.paused) void v.play().catch(() => undefined);
    if ((!opts.playing || holding) && !v.paused) v.pause();
  }
}

export class AvatarLayer {
  private main: Slot;
  private second: Slot;

  constructor(frame: HTMLElement, private board: HTMLElement, src = (file: string) => `/uploads/${file}`) {
    frame.style.position ||= 'relative';
    Object.assign(board.style, { position: 'absolute', boxSizing: 'border-box' });
    this.main = new Slot(frame, src);
    this.second = new Slot(frame, src);
  }

  /** The video elements (to listen for one that can't play). */
  get videos() { return [this.main.video, this.second.video]; }

  /** Places everything for `f`. `exact`: wait until each video shows that moment (export); otherwise it may drift a little while playing. */
  async show(f: AvatarFrame, opts: { exact?: boolean; playing?: boolean } = {}) {
    const boardFull = full(f.board);
    Object.assign(this.board.style, pct(f.board), { zIndex: f.avatarOnTop ? '1' : '2', outline: boardFull ? 'none' : `3px solid ${FRAME_COLOR}`, background: boardFull ? '' : '#000' });
    const z = f.avatarOnTop ? '2' : '1';
    await Promise.all([
      f.video && f.opacity > 0.001 ? this.main.show(f.video, f.avatar, f.opacity, z, opts) : this.main.hide(),
      f.second && f.second.opacity > 0.001 ? this.second.show(f.second.video, f.second.rect, f.second.opacity, z, opts) : this.second.hide(),
    ]);
  }

  /** What `f` looks like, to tell whether two export frames are the same picture. */
  static key(f: AvatarFrame): string {
    const r = (n: number) => Math.round(n * 1000);
    const rect = (x: Rect) => [x.x, x.y, x.w, x.h].map(r).join(',');
    const one = f.video && f.opacity > 0.001 ? `${f.video.file}@${Math.round(f.video.time * 30)}|${rect(f.avatar)},${r(f.opacity)}` : '-';
    const two = f.second && f.second.opacity > 0.001 ? `${f.second.video.file}@${Math.round(f.second.video.time * 30)}|${rect(f.second.rect)},${r(f.second.opacity)}` : '-';
    return `${one}|${two}|${rect(f.board)}`;
  }
}
