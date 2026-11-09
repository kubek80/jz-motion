import type { AvatarFrame, Rect } from '../video/avatarPlan';

// Draws an avatar frame (src/video/avatarPlan.ts) in a 16:9 frame element: places the board's container and your
// avatar's video where the plan says, and shows the right moment of the video. Used by the export's render page
// (every frame, waiting for the video to get there) and Timing's board (live, following the playhead).

const FRAME_COLOR = '#3ef0ff';
const pct = (r: Rect) => ({ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });
const full = (r: Rect) => r.x <= 0.001 && r.y <= 0.001 && r.w >= 0.999 && r.h >= 0.999;

export class AvatarLayer {
  readonly video: HTMLVideoElement;
  private file = '';

  constructor(frame: HTMLElement, private board: HTMLElement, private src = (file: string) => `/uploads/${file}`) {
    frame.style.position ||= 'relative';
    Object.assign(board.style, { position: 'absolute', boxSizing: 'border-box' });
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    Object.assign(this.video.style, { position: 'absolute', objectFit: 'cover', boxSizing: 'border-box', background: '#000', display: 'none', pointerEvents: 'none' });
    frame.appendChild(this.video);
  }

  /** Places everything for `f`. `exact`: wait until the video shows that moment (export); otherwise it may drift a little while playing. */
  async show(f: AvatarFrame, opts: { exact?: boolean; playing?: boolean } = {}) {
    const boardFull = full(f.board);
    Object.assign(this.board.style, pct(f.board), { zIndex: f.avatarOnTop ? '1' : '2', outline: boardFull ? 'none' : `3px solid ${FRAME_COLOR}`, background: boardFull ? '' : '#000' });
    const v = this.video;
    if (!f.video || f.opacity <= 0.001) {
      v.style.display = 'none';
      if (!v.paused) v.pause();
      return;
    }
    const avatarFull = full(f.avatar);
    Object.assign(v.style, pct(f.avatar), { display: 'block', opacity: String(f.opacity), zIndex: f.avatarOnTop ? '2' : '1', outline: avatarFull ? 'none' : `4px solid ${FRAME_COLOR}` });
    if (this.file !== f.video.file) {
      this.file = f.video.file;
      v.src = this.src(f.video.file);
      await new Promise<void>((ok) => { if (v.readyState >= 1) ok(); else v.addEventListener('loadedmetadata', () => ok(), { once: true }); v.addEventListener('error', () => ok(), { once: true }); });
    }
    const want = Math.min(f.video.time, Math.max(0, (v.duration || Infinity) - 0.04));
    if (opts.exact) {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - want) > 0.004) {
        const seeked = new Promise<void>((ok) => v.addEventListener('seeked', () => ok(), { once: true }));
        v.currentTime = want;
        await Promise.race([seeked, new Promise((ok) => setTimeout(ok, 3000))]);
      }
      return;
    }
    const holding = f.video.time >= (v.duration || Infinity) - 0.06;
    if (Math.abs(v.currentTime - want) > (opts.playing && !holding ? 0.3 : 0.04)) v.currentTime = want;
    if (opts.playing && !holding && v.paused) void v.play().catch(() => undefined);
    if ((!opts.playing || holding) && !v.paused) v.pause();
  }

  /** What `f` looks like, to tell whether two export frames are the same picture. */
  static key(f: AvatarFrame): string {
    const r = (n: number) => Math.round(n * 1000);
    return f.video && f.opacity > 0.001 ? `${f.video.file}@${Math.round(f.video.time * 30)}|${[f.avatar.x, f.avatar.y, f.avatar.w, f.avatar.h, f.board.x, f.board.y, f.board.w, f.board.h, f.opacity].map(r).join(',')}` : `-|${[f.board.x, f.board.y, f.board.w, f.board.h].map(r).join(',')}`;
  }
}
