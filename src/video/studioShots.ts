// A podcast's studio wide shots: where the video shows the studio (the `studio` layout, from the avatar plan), cut
// into shots the model can make (about 9.6 s at most each), and who says what in each (the voice clips' pieces, by
// the speaker's place in the cast: the model animates two people). Pure: Timing makes the shots from these.
import type { AvatarPlan } from './avatarPlan';
import { stateAt } from './performance';

export const MAX_SHOT = 240 / 25;

export interface Stretch { at: number; length: number; scene?: string }
interface TimedClip { upload: string; offset: number; trimStart: number; trimEnd: number; speaker?: string; scene?: string }
export interface Piece { upload: string; trimStart: number; trimEnd: number; at: number; person: 0 | 1 }

/** The stretches of the timeline where the layout is the studio. */
export function studioStretches(plan: AvatarPlan): Stretch[] {
  const out: Stretch[] = [];
  const marks = [{ t: 0, to: plan.first }, ...plan.changes.map((c) => ({ t: c.t, to: c.to }))];
  marks.forEach((m, i) => {
    if (m.to !== 'studio') return;
    const end = marks[i + 1]?.t ?? plan.perf.duration;
    if (end - m.t < 0.05) return;
    out.push({ at: m.t, length: end - m.t, scene: plan.sceneIds[stateAt(plan.perf, m.t + 0.01).scene] });
  });
  return out;
}

/** A stretch as shots of equal length, none longer than the model makes. */
export function shotsOf(s: Stretch, max = MAX_SHOT): Stretch[] {
  const n = Math.max(1, Math.ceil(s.length / max - 1e-6));
  return Array.from({ length: n }, (_, i) => ({ at: s.at + (s.length / n) * i, length: s.length / n, scene: s.scene }));
}

/** Who says what in a shot from `at` for `length` s: the clips' parts there, by the speaker's place in the cast. */
export function shotPieces(clips: TimedClip[], cast: string[], at: number, length: number): { pieces: Piece[]; others: string[] } {
  const pieces: Piece[] = [];
  const others = new Set<string>();
  for (const c of clips) {
    const from = Math.max(at, c.offset);
    const to = Math.min(at + length, c.offset + c.trimEnd - c.trimStart);
    if (to - from < 0.05) continue;
    const who = c.speaker ?? cast[0];
    const person = cast.indexOf(who);
    if (person !== 0 && person !== 1) { others.add(who); continue; }
    pieces.push({ upload: c.upload, trimStart: c.trimStart + (from - c.offset), trimEnd: c.trimStart + (to - c.offset), at: from - at, person });
  }
  return { pieces, others: [...others] };
}

/** What shots cost on fal.ai, in dollars (20¢ a second at 480p, twice at 720p, a quarter more past 81 frames). */
export function shotsPrice(shots: Stretch[], resolution: '480p' | '720p' = '480p'): number {
  return shots.reduce((sum, s) => {
    const frames = Math.max(41, Math.min(241, Math.floor(s.length * 25)));
    return sum + (frames / 25) * 0.2 * (resolution === '720p' ? 2 : 1) * (frames > 81 ? 1.25 : 1);
  }, 0);
}
