// Animated pictures (APNG, GIF, animated WebP) on the board: decoding them, hooking their plays to the
// timeline, advancing them with the board's clock, and telling export when every frame asked for is drawn.
// Videos (WebM, MP4, MOV) take the same plays; videoPictures.ts shows them.
import type { CompiledScene, Op } from './compile';
import { svgEl } from './dom';
import type { AnimNodes, ImageNodes, Playable } from './stageNodes';
import { isVideoSrc } from './videoClock';
import { VideoPictures } from './videoPictures';

type PlayOp = Extract<Op, { kind: 'play' }>;

export class AnimatedPictures {
  private animations = new Set<AnimNodes>();
  private loading = new Set<Promise<unknown>>();
  private pendingPlays: { image: ImageNodes; op: PlayOp }[] = [];
  private videos = new VideoPictures();

  /** `timeline` is the current scene's timeline; `builtFor` the scene currently on the board. */
  constructor(private timeline: () => gsap.core.Timeline, private builtFor: () => CompiledScene | undefined) {}

  /** Forgets the previous scene's pictures (the board is being rebuilt). */
  reset() {
    for (const a of this.animations) a.decoder.close();
    this.animations.clear();
    this.videos.reset();
    this.pendingPlays = [];
  }

  /** If the picture is animated (or a video), swaps in a canvas (or video) that shows whichever frame the timeline asks for. */
  watch(image: ImageNodes, src: string, o: { x: number; y: number; width: number; height: number; clipId: string; loop: boolean; state?: number | null }) {
    if (isVideoSrc(src)) {
      const built = this.builtFor();
      this.track(this.videos.watch(image, src, o, () => this.builtFor() === built).then((v) => v && this.hookPending(image, v)));
      return;
    }
    if (!/\.(png|apng|gif|webp)(\?|$)/i.test(src) && !/^data:image\/(png|gif|webp)/.test(src)) return;
    if (typeof ImageDecoder === 'undefined') return;
    const built = this.builtFor();
    const job = (async () => {
      const res = await fetch(src);
      const type = res.headers.get('content-type')?.split(';')[0] || (/\.gif/i.test(src) ? 'image/gif' : /\.webp/i.test(src) ? 'image/webp' : 'image/png');
      if (!(await ImageDecoder.isTypeSupported(type))) return;
      const decoder = new ImageDecoder({ data: await res.arrayBuffer(), type });
      await decoder.tracks.ready;
      const track = decoder.tracks.selectedTrack;
      if (!track?.animated || track.frameCount < 2 || this.builtFor() !== built) { decoder.close(); return; }
      const first = await decoder.decode({ frameIndex: 0 });
      const canvas = document.createElement('canvas');
      canvas.width = first.image.displayWidth;
      canvas.height = first.image.displayHeight;
      canvas.style.cssText = 'width:100%;height:100%;display:block;object-fit:cover';
      canvas.getContext('2d')!.drawImage(first.image, 0, 0);
      const frameSeconds = (first.image.duration ?? 100_000) / 1e6 || 0.1;
      first.image.close();
      const box = svgEl('foreignObject', { x: o.x, y: o.y, width: o.width, height: o.height, 'clip-path': `url(#${o.clipId})` }) as SVGForeignObjectElement;
      box.appendChild(canvas);
      image.fx.appendChild(box);
      image.img.style.display = 'none';
      const anim: AnimNodes = {
        decoder, frames: track.frameCount, frameSeconds, loop: o.loop, canvas, box,
        state: { speed: o.state ?? 0, epoch: 0, seekTo: 0 }, epoch: 0, planned: { epoch: 0, seekTo: 0 }, clip: 0, shown: 0, want: 0, busy: null,
      };
      image.anim = anim;
      this.animations.add(anim);
      this.hookPending(image, anim);
    })();
    this.track(job);
  }

  private track(job: Promise<unknown>) {
    const safe = job.catch(() => undefined);
    this.loading.add(safe);
    void safe.finally(() => this.loading.delete(safe));
  }

  /** Plays scheduled before the picture was ready: hook them up now. */
  private hookPending(image: ImageNodes, target: Playable) {
    for (const play of this.pendingPlays.filter((p) => p.image === image)) this.schedulePlay(target, play.op);
  }

  /** A play op from the timeline. */
  play(image: ImageNodes, op: PlayOp) {
    // The picture may still be loading; the play is hooked up when it is ready.
    const target = image.anim ?? image.video;
    if (target) this.schedulePlay(target, op);
    else this.pendingPlays.push({ image, op });
  }

  /** Plays are scheduled in order; only one with `from` counts as a jump (a new epoch). */
  private schedulePlay(anim: Playable, op: PlayOp) {
    const tl = this.timeline();
    const before = { speed: op.from ?? 0, ...anim.planned };
    if (op.seek !== undefined) anim.planned = { epoch: anim.planned.epoch + 1, seekTo: op.seek };
    const after = { speed: op.to ?? 0, ...anim.planned };
    tl.fromTo(anim.state, before, { ...after, duration: 0.001, immediateRender: false }, op.t);
    // Apply it now if the timeline is already past it (the picture finished loading after a jump).
    tl.time(tl.time(), true);
  }

  /** Advances every picture's clip by `dt` seconds; `manual` when drawing export frames. */
  render(dt: number, manual = false) {
    this.videos.render(dt, manual);
    for (const a of this.animations) {
      if (a.state.epoch !== a.epoch) {
        a.epoch = a.state.epoch;
        a.clip = a.state.seekTo;
      }
      const length = a.frames * a.frameSeconds;
      if (a.state.speed > 0) a.clip += dt * a.state.speed;
      if (a.clip >= length) a.clip = a.loop ? a.clip % length : length - 1e-6;
      const index = Math.min(a.frames - 1, Math.floor(a.clip / a.frameSeconds));
      if (index !== a.shown) this.showFrame(a, index);
    }
  }

  private showFrame(a: AnimNodes, index: number) {
    a.want = index;
    if (a.busy) return;
    a.busy = (async () => {
      while (a.shown !== a.want) {
        const i = a.want;
        const r = await a.decoder.decode({ frameIndex: i });
        a.canvas.getContext('2d')!.drawImage(r.image, 0, 0);
        r.image.close();
        a.shown = i;
      }
    })().catch(() => undefined).finally(() => { a.busy = null; });
  }

  /** Resolves when every animated picture has loaded and drawn the frame asked for (export waits for this). */
  async settled() {
    while (this.loading.size) await Promise.all([...this.loading]);
    for (const a of this.animations) while (a.busy) await a.busy;
    await this.videos.settled();
  }
}
