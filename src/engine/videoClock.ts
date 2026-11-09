// The small sums behind playing videos on the board (videoPictures.ts), kept apart so they can be tested.

/** Whether a picture's `src` is a video file (WebM, MP4, MOV). */
export const isVideoSrc = (src: string) => /\.(webm|mp4|mov|m4v)(\?|#|$)/i.test(src) || /^data:video\//.test(src);

/** The still the media library keeps next to a recording ("/media/<file>.poster.webp"), if it is one of those. */
export const posterOf = (src: string) => (/^\/media\/[^/?#]+\.(webm|mp4|mov|m4v)$/i.test(src) ? `${src}.poster.webp` : undefined);

/** The picture to preload for a `src`: itself, or a video's poster (videos load when their scene is built). */
export const stillOf = (src: string) => (isVideoSrc(src) ? posterOf(src) : src);

/** Where a clip is after `dt` seconds at `speed`: wrapped round when it loops, held at the end otherwise. */
export function advanceClip(clip: number, dt: number, speed: number, length: number, loop: boolean): number {
  if (speed > 0) clip += dt * speed;
  if (clip >= length) clip = loop ? clip % length : length;
  return clip;
}

/** How far the video's own time is from the clock's, the short way round when it loops. */
export function drift(actual: number, expected: number, length: number, loop: boolean): number {
  const d = Math.abs(actual - expected);
  return loop && Number.isFinite(length) ? Math.min(d, length - d) : d;
}

/** Export: the time to seek to for clip time `clip` (a hair later, so rounding never lands on the frame before). */
export const seekTime = (clip: number, length: number) => Math.min(clip + 1e-3, length);

/** A play as scheduled: from timeline time `t` the clip is at `clip` and moves at `speed`, holding at `stopAt` (reached in `arrive` seconds) when `holding`. */
export interface PlannedPlay { t: number; clip: number; speed: number; stopAt: number; arrive: number; holding: boolean }

/** Where a planned clip is at timeline time `t`: moving at its speed since the play, held at its stop or end. */
export function plannedClip(p: PlannedPlay, t: number, length: number, loop: boolean): number {
  if (t <= p.t) return p.clip;
  const speed = p.holding && p.arrive > 0 ? Math.max(0, (p.stopAt - p.clip) / p.arrive) : p.speed;
  let clip = p.clip + (t - p.t) * speed;
  if (p.holding) clip = Math.min(clip, p.stopAt);
  if (clip >= length) clip = loop ? clip % length : length;
  return clip;
}

/**
 * Export: where the clip is at timeline time `now`, from every play scheduled so far (in order, the first being how
 * it starts), the same for every frame however the frames before it were drawn. A play standing exactly at `now`
 * hasn't started yet.
 */
export function clipAtTime(plays: PlannedPlay[], now: number, length: number, loop: boolean): number {
  let p = plays[0];
  for (const x of plays) if (x.t < now - 1e-6) p = x;
  return p ? plannedClip(p, now, length, loop) : 0;
}
