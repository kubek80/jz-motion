// Recordings on the board (videos: WebM from the media library, MP4, MOV): hooking their plays to the timeline,
// advancing them with the board's clock, and telling export when every frame asked for is shown. Plays are
// scheduled in order, working out where the clip will be at each one, so a jump to a frame can cross-fade from
// the right picture and `until` knows where to stop. videoPictures.ts shows them.
import type { CompiledScene, Op } from './compile';
import type { ImageNodes, VideoNodes } from './stageNodes';
import { isVideoSrc } from './videoClock';
import { frameAt, VideoPictures } from './videoPictures';

type PlayOp = Extract<Op, { kind: 'play' }>;
const needsFrames = (op: PlayOp) => op.seekFrame !== undefined || op.untilFrame !== undefined;

export class AnimatedPictures {
  private loading = new Set<Promise<unknown>>();
  /** Plays waiting for their recording to load (or for its frame list), in order. */
  private queued = new Map<ImageNodes, PlayOp[]>();
  private videos = new VideoPictures();

  /** `timeline` is the current scene's timeline; `builtFor` the scene currently on the board. */
  constructor(private timeline: () => gsap.core.Timeline, private builtFor: () => CompiledScene | undefined) {}

  /** Forgets the previous scene's recordings (the board is being rebuilt). */
  reset() {
    this.videos.reset();
    this.queued.clear();
  }

  /** If the picture is a recording, swaps in a video that shows whichever moment the timeline asks for. */
  watch(image: ImageNodes, src: string, o: { x: number; y: number; width: number; height: number; clipId: string; loop: boolean; state?: number | null }) {
    if (!isVideoSrc(src)) return;
    const built = this.builtFor();
    this.track(this.videos.watch(image, src, o, () => this.builtFor() === built).then((v) => v && this.flush(image, v)));
  }

  private track(job: Promise<unknown>) {
    const safe = job.catch(() => undefined);
    this.loading.add(safe);
    void safe.finally(() => this.loading.delete(safe));
  }

  /** A play op from the timeline; hooked up once the recording (and, if it names frames, its frame list) is ready. */
  play(image: ImageNodes, op: PlayOp) {
    const list = this.queued.get(image) ?? [];
    list.push(op);
    this.queued.set(image, list);
    if (image.video) this.flush(image, image.video);
  }

  private async flush(image: ImageNodes, v: VideoNodes): Promise<void> {
    const list = this.queued.get(image);
    if (!list?.length) return;
    if (!v.frames && list.some(needsFrames)) {
      const job: Promise<void> = this.videos.loadFrames(v).then(() => this.flush(image, v));
      this.track(job);
      return job;
    }
    this.queued.delete(image);
    for (const op of list) this.schedule(v, op);
  }

  /** Schedules one play on the timeline, after the ones before it. */
  private schedule(v: VideoNodes, op: PlayOp) {
    const p = v.planned;
    const tl = this.timeline();
    // Where the clip is when this play starts, following the plays before it.
    let clip = clipAt(p, op.t, v);
    const before = pick(p, op.from ?? 0);
    const seekTo = op.seekFrame !== undefined ? frameAt(v, op.seekFrame) : op.seek;
    if (op.fade && seekTo !== undefined) v.fades.push({ t: op.t, dur: op.fade, from: clip });
    if (seekTo !== undefined) {
      p.epoch += 1;
      p.seekTo = seekTo;
      clip = seekTo;
    }
    p.seq += 1;
    p.stopAt = op.untilFrame !== undefined ? frameAt(v, op.untilFrame) : -1;
    p.arrive = op.arriveIn ?? 0;
    p.speed = op.to ?? 0;
    p.t = op.t;
    p.clip = clip;
    // `until` only plays forwards: if the clip is already past it, the stop doesn't apply.
    p.holding = p.stopAt >= 0 && clip <= p.stopAt + 1e-6;
    if (!p.holding) p.stopAt = -1;
    tl.fromTo(v.state, before, { ...pick(p, p.speed), duration: 0.001, immediateRender: false }, op.t);
    // Apply it now if the timeline is already past it (the recording finished loading after a jump).
    tl.time(tl.time(), true);
  }

  /** Advances every recording by `dt` seconds of the board's clock; `manual` when drawing export frames. */
  render(dt: number, manual = false) {
    this.videos.render(dt, manual, this.timeline().time());
  }

  /** The frame list of a recording on the board (for the editor's frame stepper); undefined if it isn't one. */
  async framesOf(image: ImageNodes): Promise<number[] | undefined> {
    if (!image.video) return undefined;
    await this.videos.loadFrames(image.video);
    return image.video.frames;
  }

  /** Editing: shows frame `index` (0 = the first) of a recording, without playing it. */
  showFrame(image: ImageNodes, index: number) {
    const v = image.video;
    if (v?.frames) v.clip = frameAt(v, index);
  }

  /** Resolves when every recording has loaded and shows the frame asked for (export waits for this). */
  async settled() {
    while (this.loading.size) await Promise.all([...this.loading]);
    await this.videos.settled();
  }
}

/** The numbers the timeline tweens, from a plan. */
const pick = (p: VideoNodes['planned'], speed: number) => ({ speed, epoch: p.epoch, seekTo: p.seekTo, seq: p.seq, stopAt: p.stopAt, arrive: p.arrive });

/** Where a planned clip is at timeline time `t`: moving at its speed since the last play, held at its stop or end. */
function clipAt(p: VideoNodes['planned'], t: number, v: VideoNodes): number {
  if (t <= p.t) return p.clip;
  const speed = p.holding && p.arrive > 0 ? Math.max(0, (p.stopAt - p.clip) / p.arrive) : p.speed;
  let clip = p.clip + (t - p.t) * speed;
  if (p.holding) clip = Math.min(clip, p.stopAt);
  if (clip >= v.duration) clip = v.loop ? clip % v.duration : v.duration;
  return clip;
}
