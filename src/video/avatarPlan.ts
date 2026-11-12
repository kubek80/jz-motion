// Where your avatar and the board are in the video frame at any moment, and which frame of which avatar video shows:
// the layout of the scene, its beats and its "avatar" actions decides the target; a change glides there (a corner
// growing to full frame, …). An avatar video that ends before its scene does holds its last frame to the end of the
// scene, unless it is about to be hidden: then it fades out over its last moving frames; one that starts after its scene does shows its first frame until then.
// A podcast: `pair` shows the first two in the cast side by side (each their own clips' avatar; the one listening holds
// a frame), `studio` the studio wide shot (voiceover.studio) full frame. Pure: the export's render page and
// Timing's board both draw from it, so what Timing shows is what the video shows.
import type { CompiledPresentation } from '../engine/compile';
import { stateAt, type Performance } from './performance';

/** A rectangle as fractions of the 16:9 frame. */
export interface Rect { x: number; y: number; w: number; h: number }
type Place = 'board' | 'pip' | 'pip-left' | 'camera' | 'side' | 'pair' | 'studio';

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };
// The same sizes the export always used: margins 2.5 % of the width, a corner 26 % wide, the board small 36 %.
const MX = 0.025, MY = 0.025 * 16 / 9;
const PIP = 0.26, SMALL = 0.36;
const LEFT: Rect = { x: 0, y: 0, w: 0.5, h: 1 };
const PLACES: Record<Place, { avatar: Rect | null; second?: Rect; board: Rect; avatarOnTop: boolean }> = {
  board: { avatar: null, board: FULL, avatarOnTop: true },
  pip: { avatar: { x: 1 - MX - PIP, y: 1 - MY - PIP, w: PIP, h: PIP }, board: FULL, avatarOnTop: true },
  'pip-left': { avatar: { x: MX, y: 1 - MY - PIP, w: PIP, h: PIP }, board: FULL, avatarOnTop: true },
  camera: { avatar: FULL, board: { x: 1 - MX - SMALL, y: MY, w: SMALL, h: SMALL }, avatarOnTop: false },
  side: { avatar: LEFT, board: { x: 0.5, y: 0.25, w: 0.5, h: 0.5 }, avatarOnTop: true },
  pair: { avatar: LEFT, second: { x: 0.5, y: 0, w: 0.5, h: 1 }, board: FULL, avatarOnTop: true },
  studio: { avatar: FULL, board: FULL, avatarOnTop: true },
};
const GLIDE = 0.8;

interface RawScene { id: string; skip?: boolean; layout?: string; beats?: { layout?: string; actions?: { do: string; layout?: string; duration?: number }[] }[] }
interface RawClip { scene?: string; speaker?: string; offset: number; trimStart: number; avatar?: { video: string; trimStart: number; trimEnd: number } }
interface RawStudio { video: string; offset: number; length: number; scene?: string }
export interface AvatarSource { scenes: RawScene[]; cast?: { id: string }[]; voiceover?: { clips?: RawClip[]; studio?: RawStudio[] } }

/** A stretch of the timeline an avatar video covers: one person's (`speaker`), or a studio wide shot of everyone. */
interface Span { video: string; at: number; length: number; scene?: string; speaker?: string; studio?: boolean }
interface Change { t: number; from: Place; to: Place; dur: number }
export interface AvatarPlan { spans: Span[]; changes: Change[]; first: Place; perf: Performance; sceneIds: string[]; cast: string[] }

const isPlace = (l: unknown): l is Place => typeof l === 'string' && Object.hasOwn(PLACES, l);

/** The layout at scene time `time`, and how long a change to it glides (an "avatar" action's own duration). */
function placeAt(p: CompiledPresentation, raw: RawScene[], scene: number, time: number): { place: Place; dur: number } {
  const s = p.scenes[scene];
  const rs = raw[scene];
  let place: Place = isPlace(rs?.layout) ? rs.layout : 'board';
  let dur = GLIDE;
  s?.beats.forEach((b, bi) => {
    if (!(b.end > b.start ? b.start < time - 1e-6 : b.start <= time)) return;
    const own = rs?.beats?.[bi]?.layout;
    if (isPlace(own)) { place = own; dur = GLIDE; }
    rs?.beats?.[bi]?.actions?.forEach((a, ai) => {
      const at = b.start + (b.actions[ai]?.start ?? 0);
      if (a.do === 'avatar' && isPlace(a.layout) && at <= time + 1e-6) { place = a.layout; dur = a.duration ?? GLIDE; }
    });
  });
  return { place, dur };
}

/** Everything about the avatar over the whole video, worked out once (sampled every 1/30 s). */
export function planAvatar(p: CompiledPresentation, source: AvatarSource, perf: Performance): AvatarPlan {
  const spans: Span[] = [];
  const seen = new Set<string>();
  const cast = (source.cast ?? []).map((c) => c.id);
  for (const c of source.voiceover?.clips ?? []) {
    if (!c.avatar || seen.has(c.avatar.video)) continue;
    seen.add(c.avatar.video);
    spans.push({ video: c.avatar.video, at: c.offset - (c.trimStart - c.avatar.trimStart), length: c.avatar.trimEnd - c.avatar.trimStart, scene: c.scene, speaker: c.speaker ?? cast[0] });
  }
  // Studio shots of scenes left out don't show.
  const out = new Set(source.scenes.filter((s) => s.skip).map((s) => s.id));
  for (const s of (source.voiceover?.studio ?? []).filter((x) => !x.scene || !out.has(x.scene))) spans.push({ video: s.video, at: s.offset, length: s.length, scene: s.scene, studio: true });
  spans.sort((a, b) => a.at - b.at);
  const changes: Change[] = [];
  let last: Place | null = null;
  let first: Place = 'board';
  const step = 1 / 30;
  for (let t = 0; t <= perf.duration + step; t += step) {
    const st = stateAt(perf, t);
    const { place, dur } = placeAt(p, source.scenes, st.scene, st.time);
    if (last === null) { first = place; last = place; continue; }
    if (place !== last) { changes.push({ t, from: last, to: place, dur }); last = place; }
  }
  // Fading out (to the board alone) after the avatar's video has ended: rather than holding its last frame and then
  // fading, the fade moves earlier to end as the video does, over its last moving frames. Never before the move
  // before it is over, and only when the video ended since then (not while it still speaks).
  let prevEnd = 0;
  for (const c of changes) {
    const hides = !!PLACES[c.from].avatar && !PLACES[c.to].avatar;
    const speaking = spans.some((s) => !s.studio && s.at < c.t - 1e-6 && s.at + s.length > c.t + 1e-6);
    const ended = [...spans].reverse().find((s) => !s.studio && s.at + s.length <= c.t + 1e-6);
    const end = ended ? ended.at + ended.length : -1;
    if (hides && !speaking && ended && end > prevEnd + 1e-6) c.t = Math.min(c.t, Math.max(prevEnd, ended.at, end - c.dur));
    prevEnd = c.t + c.dur;
  }
  return { spans, changes, first, perf, sceneIds: source.scenes.map((s) => s.id), cast };
}

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const mix = (a: Rect, b: Rect, k: number): Rect => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k });

type Shown = { file: string; time: number; still?: boolean };

export interface AvatarFrame {
  /** The avatar video and the second of it to show, or null when nothing shows; `still`: a held frame (its last before
   * the scene ends, or its first before it starts), so a player shows that frame instead of playing on. */
  video: Shown | null;
  avatar: Rect;
  opacity: number;
  board: Rect;
  avatarOnTop: boolean;
  /** The second person, in `pair` (the right half): their video, where, how visible. */
  second?: { video: Shown; rect: Rect; opacity: number };
}

/** Of `spans`, the picture at `t`: the one saying this moment; else, in the same scene, the last frame of one that
 * ended or the first frame of one still to come; else the last one shown (fading out), else the next. */
function pick(spans: Span[], t: number, scene: string | undefined): Shown | null {
  if (!spans.length) return null;
  const now = spans.find((s) => t >= s.at && t < s.at + s.length);
  const before = [...spans].reverse().find((s) => s.at + s.length <= t);
  const after = spans.find((s) => s.at > t);
  const end = (s: Span): Shown => ({ file: s.video, time: Math.max(0, s.length - 0.05), still: true });
  if (now) return { file: now.video, time: t - now.at };
  if (before && before.scene === scene) return end(before);
  if (after && after.scene === scene) return { file: after.video, time: 0, still: true };
  if (before) return end(before);
  if (after) return { file: after.video, time: 0, still: true };
  return null;
}

/** The frame at `t` seconds into the video. */
export function avatarFrame(plan: AvatarPlan, t: number): AvatarFrame {
  // Where: the last change before t, glided from where the one before left it.
  let from: Place = plan.first, to: Place = plan.first, k = 1;
  for (const c of plan.changes) {
    if (c.t > t) break;
    from = c.from; to = c.to;
    k = Math.min(1, (t - c.t) / c.dur);
  }
  const a = PLACES[from], b = PLACES[to];
  const e = ease(k);
  // Hidden on one side of the glide: fade there, in the visible side's place.
  const avatar = mix(a.avatar ?? b.avatar ?? FULL, b.avatar ?? a.avatar ?? FULL, e);
  const opacity = (a.avatar ? 1 : 0) + ((b.avatar ? 1 : 0) - (a.avatar ? 1 : 0)) * e;
  const board = mix(a.board, b.board, e);
  const avatarOnTop = e < 0.5 ? a.avatarOnTop : b.avatarOnTop;

  // Which picture: the studio shot in `studio` (anyone talking, until one is made), the first in the cast in `pair`,
  // else whoever is talking. The place nearer in the glide decides.
  const place = e < 0.5 ? from : to;
  const scene = plan.sceneIds[stateAt(plan.perf, t).scene];
  const people = plan.spans.filter((s) => !s.studio);
  const whose = (id: string | undefined) => people.filter((s) => s.speaker === id);
  let video: Shown | null = null;
  if (opacity > 0.001) {
    const studio = plan.spans.filter((s) => s.studio);
    video = place === 'studio' && studio.length ? pick(studio, t, scene) : place === 'pair' && plan.cast.length > 1 ? pick(whose(plan.cast[0]), t, scene) : pick(people, t, scene);
  }
  const frame: AvatarFrame = { video, avatar, opacity: video ? opacity : 0, board, avatarOnTop };
  // The second person (pair): fades in and out with the layout.
  const secondOpacity = (a.second ? 1 : 0) + ((b.second ? 1 : 0) - (a.second ? 1 : 0)) * e;
  if (secondOpacity > 0.001 && plan.cast.length > 1) {
    const v = pick(whose(plan.cast[1]), t, scene);
    if (v) frame.second = { video: v, rect: mix(a.second ?? b.second!, b.second ?? a.second!, e), opacity: secondOpacity };
  }
  return frame;
}
