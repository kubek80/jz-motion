// Where your avatar and the board are in the video frame at any moment, and which frame of which avatar video shows:
// the layout of the scene, its beats and its "avatar" actions decides the target; a change glides there (a corner
// growing to full frame, …). An avatar video that ends before its scene does holds its last frame to the end of the
// scene; one that starts after its scene does shows its first frame until then. Pure: the export's render page and
// Timing's board both draw from it, so what Timing shows is what the video shows.
import type { CompiledPresentation } from '../engine/compile';
import { stateAt, type Performance } from './performance';

/** A rectangle as fractions of the 16:9 frame. */
export interface Rect { x: number; y: number; w: number; h: number }
type Place = 'board' | 'pip' | 'pip-left' | 'camera' | 'side';

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };
// The same sizes the export always used: margins 2.5 % of the width, a corner 26 % wide, the board small 36 %.
const MX = 0.025, MY = 0.025 * 16 / 9;
const PIP = 0.26, SMALL = 0.36;
const PLACES: Record<Place, { avatar: Rect | null; board: Rect; avatarOnTop: boolean }> = {
  board: { avatar: null, board: FULL, avatarOnTop: true },
  pip: { avatar: { x: 1 - MX - PIP, y: 1 - MY - PIP, w: PIP, h: PIP }, board: FULL, avatarOnTop: true },
  'pip-left': { avatar: { x: MX, y: 1 - MY - PIP, w: PIP, h: PIP }, board: FULL, avatarOnTop: true },
  camera: { avatar: FULL, board: { x: 1 - MX - SMALL, y: MY, w: SMALL, h: SMALL }, avatarOnTop: false },
  side: { avatar: { x: 0, y: 0, w: 0.5, h: 1 }, board: { x: 0.5, y: 0.25, w: 0.5, h: 0.5 }, avatarOnTop: true },
};
const GLIDE = 0.8;

interface RawScene { id: string; layout?: string; beats?: { layout?: string; actions?: { do: string; layout?: string; duration?: number }[] }[] }
interface RawClip { scene?: string; offset: number; trimStart: number; avatar?: { video: string; trimStart: number; trimEnd: number } }
export interface AvatarSource { scenes: RawScene[]; voiceover?: { clips?: RawClip[] } }

interface Span { video: string; at: number; length: number; scene?: string }
interface Change { t: number; from: Place; to: Place; dur: number }
export interface AvatarPlan { spans: Span[]; changes: Change[]; first: Place; perf: Performance; sceneIds: string[] }

const isPlace = (l: unknown): l is Place => l === 'board' || l === 'pip' || l === 'pip-left' || l === 'camera' || l === 'side';

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
  for (const c of source.voiceover?.clips ?? []) {
    if (!c.avatar || seen.has(c.avatar.video)) continue;
    seen.add(c.avatar.video);
    spans.push({ video: c.avatar.video, at: c.offset - (c.trimStart - c.avatar.trimStart), length: c.avatar.trimEnd - c.avatar.trimStart, scene: c.scene });
  }
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
  return { spans, changes, first, perf, sceneIds: source.scenes.map((s) => s.id) };
}

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const mix = (a: Rect, b: Rect, k: number): Rect => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k });

export interface AvatarFrame {
  /** The avatar video and the second of it to show, or null when nothing shows. */
  video: { file: string; time: number } | null;
  avatar: Rect;
  opacity: number;
  board: Rect;
  avatarOnTop: boolean;
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

  // Which picture: the avatar saying this moment; else, in the same scene, the last frame of one that ended or the
  // first frame of one still to come; else (fading out) the last one shown.
  let video: AvatarFrame['video'] = null;
  if (opacity > 0.001 && plan.spans.length) {
    const scene = plan.sceneIds[stateAt(plan.perf, t).scene];
    const now = plan.spans.find((s) => t >= s.at && t < s.at + s.length);
    const before = [...plan.spans].reverse().find((s) => s.at + s.length <= t);
    const after = plan.spans.find((s) => s.at > t);
    if (now) video = { file: now.video, time: t - now.at };
    else if (before && before.scene === scene) video = { file: before.video, time: Math.max(0, before.length - 0.05) };
    else if (after && after.scene === scene) video = { file: after.video, time: 0 };
    else if (before) video = { file: before.video, time: Math.max(0, before.length - 0.05) };
    else if (after) video = { file: after.video, time: 0 };
  }
  return { video, avatar, opacity: video ? opacity : 0, board, avatarOnTop };
}
