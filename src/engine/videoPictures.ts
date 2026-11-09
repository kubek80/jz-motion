// Recordings on the board (WebM, MP4, MOV; screen recordings from the media library): a muted <video> in place of
// the picture, driven by the play state animatedPictures.ts schedules. Live, it plays natively at the play's speed
// and the clip follows the video's own time (re-synced when it drifts from the clock). In export (manual
// frames), it is seeked to the exact clip time of every frame and that frame is painted on a canvas over it
// (videoStill.ts), and `settled()` waits until it is.
// A play can stop at a frame (`until`), and a jump can cross-fade: a second video shows the picture it fades from.
import { svgEl } from './dom';
import type { ImageNodes, VideoNodes } from './stageNodes';
import { advanceClip, clipAtTime, drift, posterOf, seekTime } from './videoClock';
import { VideoStill } from './videoStill';

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
      for (const video of [v.video, v.fade?.video]) {
        if (!video) continue;
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
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
    // A frame for the video and, during a cross-fade, the one it fades from on top.
    const holder = document.createElement('div');
    holder.style.cssText = 'position:relative;width:100%;height:100%';
    holder.appendChild(video);
    const copy = new VideoStill(video);
    Object.assign(copy.canvas.style, { position: 'absolute', left: '0', top: '0' });
    holder.appendChild(copy.canvas);
    box.appendChild(holder);
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
    const still = { epoch: 0, seekTo: 0, seq: 0, stopAt: -1, arrive: 0 };
    const v: VideoNodes = {
      src, video, copy, box, loop: o.loop, duration: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity,
      state: { speed: o.state ?? 0, ...still }, planned: { speed: o.state ?? 0, ...still, t: 0, clip: 0, holding: false },
      plays: [], epoch: 0, seq: 0, clip: 0, stopAt: -1, speedTo: null, fades: [], target: -1, busy: null,
    };
    v.plays.push({ ...v.planned });
    // The first frame is decoded; make sure it is on screen before the picture underneath goes.
    v.busy = shown(video, () => undefined).finally(() => { v.busy = null; });
    await v.busy;
    if (!current()) return undefined;
    if (this.manual) copy.paint();
    image.img.style.display = 'none';
    image.video = v;
    this.videos.add(v);
    if (this.manual) this.seek(v);
    return v;
  }

  /** The recording's frame list from the media library (once); other videos count 30 frames a second. */
  loadFrames(v: VideoNodes): Promise<void> {
    if (v.frames) return Promise.resolve();
    const known = framesLoading.get(v.src) ?? fetchFrames(v.src);
    framesLoading.set(v.src, known);
    return known.then((times) => { v.frames = times; });
  }

  /** `now` is the timeline's time, for cross-fades. */
  render(dt: number, manual: boolean, now: number) {
    this.manual = manual;
    for (const v of this.videos) {
      if (!manual) {
        v.copy.hide();
        v.fade?.copy.hide();
      }
      let jumped = false;
      if (v.state.epoch !== v.epoch) {
        v.epoch = v.state.epoch;
        v.clip = Math.min(v.state.seekTo, v.duration);
        jumped = true;
      }
      if (v.state.seq !== v.seq) {
        // A new play: where it stops (only ahead of the clip), and the speed that gets it there in time.
        v.seq = v.state.seq;
        v.stopAt = v.state.stopAt >= 0 && v.clip <= v.state.stopAt + 1e-6 ? v.state.stopAt : -1;
        v.speedTo = v.stopAt >= 0 && v.state.arrive > 0 ? Math.max(0, (v.stopAt - v.clip) / v.state.arrive) : null;
      }
      const holding = v.stopAt >= 0 && v.clip >= v.stopAt - 1e-6;
      const speed = holding ? 0 : v.speedTo ?? v.state.speed;
      v.clip = advanceClip(v.clip, dt, speed, v.duration, v.loop);
      if (v.stopAt >= 0) v.clip = Math.min(v.clip, v.stopAt);
      // Export: the clip from the plays themselves, not from the frames this page happened to draw before.
      if (manual) v.clip = clipAtTime(v.plays, now, v.duration, v.loop);
      if (manual) this.seek(v);
      else this.follow(v, jumped, speed);
      if (v.stopAt >= 0) v.clip = Math.min(v.clip, v.stopAt);
      this.crossFade(v, now, manual);
    }
  }

  /** During a cross-fade, the picture it fades from lies on top, fading out (from the timeline's time, so it scrubs). */
  private crossFade(v: VideoNodes, now: number, manual: boolean) {
    // Strictly after it starts: standing exactly on the jump (the end of the beat before), nothing has changed yet.
    const f = v.fades.find((x) => now > x.t + 1e-6 && now < x.t + x.dur);
    if (!f) {
      if (v.fade) {
        v.fade.video.style.display = 'none';
        v.fade.copy.hide();
      }
      return;
    }
    const fade = v.fade ?? this.makeFade(v);
    fade.video.style.display = 'block';
    fade.video.style.opacity = fade.copy.canvas.style.opacity = String(Math.max(0, 1 - (now - f.t) / f.dur));
    const t = seekTime(f.from, v.duration);
    if (Math.abs(t - fade.target) < 1e-6) return;
    fade.target = t;
    const before = fade.busy ?? fade.ready.then(() => undefined);
    const job: Promise<void> = before.then(() => (fade.target === t ? shown(fade.video, () => { fade.video.currentTime = t; }, !manual).then(() => { if (manual) fade.copy.paint(); }) : undefined));
    fade.busy = job;
    void job.finally(() => { if (fade.busy === job) fade.busy = null; });
    if (!manual) fade.video.pause();
  }

  private makeFade(v: VideoNodes) {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('muted', '');
    video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:none;object-fit:cover';
    video.src = v.src;
    v.video.parentElement?.appendChild(video);
    const copy = new VideoStill(video);
    v.video.parentElement?.appendChild(copy.canvas);
    const ready = new Promise<boolean>((resolve) => {
      video.addEventListener('loadeddata', () => resolve(true), { once: true });
      video.addEventListener('error', () => resolve(false), { once: true });
      setTimeout(() => resolve(false), LOAD_TIMEOUT);
    });
    v.fade = { video, copy, target: -1, busy: null, ready };
    return v.fade;
  }

  /** Live: lets the video play by itself, keeping it (and the clip) in step with the board's clock. */
  private follow(v: VideoNodes, jumped: boolean, speed: number) {
    const video = v.video;
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
    const job: Promise<void> = before.then(() => (v.target === t ? shown(v.video, () => { v.video.currentTime = t; }, false).then(() => { v.copy.paint(); }) : undefined));
    v.busy = job;
    void job.finally(() => { if (v.busy === job) v.busy = null; });
  }

  /** Whether any recording can change between two timeline moments: at another moment of the clip, or cross-fading. */
  moving(from: number, to: number): boolean {
    for (const v of this.videos) {
      if (Math.abs(clipAtTime(v.plays, from, v.duration, v.loop) - clipAtTime(v.plays, to, v.duration, v.loop)) > 1e-6) return true;
      if (v.fades.some((f) => f.t < to + 1e-6 && f.t + f.dur > from - 1e-6)) return true;
    }
    return false;
  }

  /** Resolves when every video shows the frame asked for (export waits for this). */
  async settled() {
    for (const v of this.videos) {
      while (v.busy) await v.busy;
      while (v.fade?.busy) await v.fade.busy;
    }
  }
}

/**
 * Runs `change` (a seek, or nothing) and resolves once the video has the new frame and it has been put on
 * screen: the `seeked` event, then (with `present`) the next presented frame where the browser can say (with time
 * limits, so a hidden video, which presents nothing, doesn't stall the export). Export paints the frame on its
 * canvas instead of waiting for it to be presented.
 */
function shown(video: HTMLVideoElement, change: () => void, present = true): Promise<void> {
  const seeking = new Promise<void>((resolve) => video.addEventListener('seeked', () => resolve(), { once: true }));
  const presented = new Promise<void>((resolve) => {
    if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(() => resolve());
    else resolve();
  });
  const before = video.currentTime;
  change();
  const seeked = video.seeking || video.currentTime !== before ? limit(seeking, 5000) : Promise.resolve();
  return present ? seeked.then(() => limit(presented, 250)) : seeked;
}

const limit = (p: Promise<void>, ms: number) => Promise.race([p, new Promise<void>((resolve) => setTimeout(resolve, ms))]);

/** Frame lists by recording, shared by every board on the page. */
const framesLoading = new Map<string, Promise<number[]>>();

async function fetchFrames(src: string): Promise<number[]> {
  const file = /^\/media\/([^/?#]+)$/.exec(src)?.[1];
  if (!file) return [];
  try {
    const res = await fetch(`/api/media/${file}/frames`);
    return res.ok ? ((await res.json()) as { times: number[] }).times : [];
  } catch {
    return [];
  }
}

/** When frame `index` (0 = the first) starts, in seconds; without a frame list, 30 frames a second. */
export function frameAt(v: Pick<VideoNodes, 'frames' | 'duration'>, index: number): number {
  const i = Math.max(0, Math.round(index));
  const t = v.frames?.length ? v.frames[Math.min(i, v.frames.length - 1)] : i / 30;
  return Math.min(t, v.duration);
}
