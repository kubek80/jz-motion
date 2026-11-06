// Videos on the board (WebM, MP4, MOV; screen recordings from the media library): a muted <video> in place of
// the picture, driven by the same play state as animated pictures. Live, it plays natively at the play's speed
// and the clip follows the video's own time (re-synced when it drifts from the clock). In export (manual
// frames), it is seeked to the exact clip time of every frame, and `settled()` waits until that frame is shown.
import { svgEl } from './dom';
import type { ImageNodes, VideoNodes } from './stageNodes';
import { advanceClip, drift, posterOf, seekTime } from './videoClock';

/** How far (seconds) the video may run ahead of or behind the board's clock before it is moved back in step. */
const MAX_DRIFT = 0.15;
const LOAD_TIMEOUT = 15_000;

export class VideoPictures {
  private videos = new Set<VideoNodes>();
  /** Whether the last frame was drawn for export (seek every frame) rather than live. */
  private manual = false;

  /** Forgets the previous scene's videos (the board is being rebuilt) and lets go of their files. */
  reset() {
    for (const v of this.videos) {
      v.video.pause();
      v.video.removeAttribute('src');
      v.video.load();
    }
    this.videos.clear();
  }

  /**
   * Swaps the picture for a video showing its first frame. Resolves with its nodes once the first frame is
   * there (or with nothing if it can't be played, leaving the poster picture in place).
   */
  async watch(image: ImageNodes, src: string, o: { x: number; y: number; width: number; height: number; clipId: string; loop: boolean; state?: number | null }, current: () => boolean): Promise<VideoNodes | undefined> {
    // Until the video has a frame (or if it never does), the picture shows the recording's poster.
    const poster = posterOf(src);
    if (poster) image.img.setAttribute('href', poster);
    const video = document.createElement('video');
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.loop = o.loop;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.style.cssText = 'width:100%;height:100%;display:block;object-fit:cover';
    const box = svgEl('foreignObject', { x: o.x, y: o.y, width: o.width, height: o.height, 'clip-path': `url(#${o.clipId})` }) as SVGForeignObjectElement;
    box.appendChild(video);
    video.src = src;
    const ok = await new Promise<boolean>((resolve) => {
      const done = (r: boolean) => { clearTimeout(timer); resolve(r); };
      const timer = setTimeout(() => done(false), LOAD_TIMEOUT);
      video.addEventListener('loadeddata', () => done(true), { once: true });
      video.addEventListener('error', () => done(false), { once: true });
    });
    if (!ok || !current()) {
      video.removeAttribute('src');
      video.load();
      return undefined;
    }
    image.fx.appendChild(box);
    const v: VideoNodes = {
      video, box, loop: o.loop, duration: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity,
      state: { speed: o.state ?? 0, epoch: 0, seekTo: 0 }, epoch: 0, planned: { epoch: 0, seekTo: 0 }, clip: 0, target: -1, busy: null,
    };
    // The first frame is decoded; make sure it is on screen before the picture underneath goes.
    v.busy = shown(video, () => undefined).finally(() => { v.busy = null; });
    await v.busy;
    if (!current()) return undefined;
    image.img.style.display = 'none';
    image.video = v;
    this.videos.add(v);
    if (this.manual) this.seek(v);
    return v;
  }

  render(dt: number, manual: boolean) {
    this.manual = manual;
    for (const v of this.videos) {
      let jumped = false;
      if (v.state.epoch !== v.epoch) {
        v.epoch = v.state.epoch;
        v.clip = Math.min(v.state.seekTo, v.duration);
        jumped = true;
      }
      v.clip = advanceClip(v.clip, dt, v.state.speed, v.duration, v.loop);
      if (manual) this.seek(v);
      else this.follow(v, jumped);
    }
  }

  /** Live: lets the video play by itself, keeping it (and the clip) in step with the board's clock. */
  private follow(v: VideoNodes, jumped: boolean) {
    const video = v.video;
    const speed = v.state.speed;
    // A video that has played to its end stops there (playing it again would start it over).
    if (speed > 0 && !v.loop && video.ended && !jumped) v.clip = v.duration;
    const ended = !v.loop && v.clip >= v.duration;
    const off = drift(video.currentTime, v.clip, v.duration, v.loop) > MAX_DRIFT;
    if (speed > 0 && !ended) {
      if (video.playbackRate !== speed) video.playbackRate = speed;
      // While it seeks or waits for data, the clock carries the clip; once it plays, the video's time is the clip.
      const ready = !video.paused && !video.seeking && video.readyState >= 3;
      if (jumped || (off && (ready || video.paused))) video.currentTime = v.clip;
      else if (ready) v.clip = video.currentTime;
      if (video.paused) void video.play().catch(() => undefined);
    } else {
      if (!video.paused) video.pause();
      if (jumped || off) video.currentTime = Math.min(v.clip, v.duration);
    }
  }

  /** Export: shows exactly the frame at the clip time. */
  private seek(v: VideoNodes) {
    const t = seekTime(v.clip, v.duration);
    if (Math.abs(t - v.target) < 1e-6) return;
    v.target = t;
    if (!v.video.paused) v.video.pause();
    const before = v.busy ?? Promise.resolve();
    const job: Promise<void> = before.then(() => (v.target === t ? shown(v.video, () => { v.video.currentTime = t; }) : undefined));
    v.busy = job;
    void job.finally(() => { if (v.busy === job) v.busy = null; });
  }

  /** Resolves when every video shows the frame asked for (export waits for this). */
  async settled() {
    for (const v of this.videos) while (v.busy) await v.busy;
  }
}

/**
 * Runs `change` (a seek, or nothing) and resolves once the video has the new frame and it has been put on
 * screen: the `seeked` event, then the next presented frame where the browser can say (with time limits, so
 * a hidden video, which presents nothing, doesn't stall the export).
 */
function shown(video: HTMLVideoElement, change: () => void): Promise<void> {
  const seeking = new Promise<void>((resolve) => video.addEventListener('seeked', () => resolve(), { once: true }));
  const presented = new Promise<void>((resolve) => {
    if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(() => resolve());
    else resolve();
  });
  const before = video.currentTime;
  change();
  const seeked = video.seeking || video.currentTime !== before ? limit(seeking, 5000) : Promise.resolve();
  return seeked.then(() => limit(presented, 250));
}

const limit = (p: Promise<void>, ms: number) => Promise.race([p, new Promise<void>((resolve) => setTimeout(resolve, ms))]);
