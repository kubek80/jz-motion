import type { Clip } from '../../engine/schema';

// One recording on the timeline, even after parts of it were cut out: the clip and its neighbours on the same lane
// that continue the same recording (a part removed in between, with the gap closed or left as silence). The clip
// window shows and edits the whole of it.

export interface Chain {
  /** Indexes into the clips, in time order. */
  indices: number[];
  /** Timeline seconds where it starts and ends. */
  start: number;
  end: number;
}

const len = (c: Clip) => c.trimEnd - c.trimStart;

export function chainOf(clips: Clip[], index: number): Chain {
  const me = clips[index];
  const same = clips.map((c, i) => ({ c, i })).filter(({ c }) => c.upload === me.upload && c.lane === me.lane).sort((a, b) => a.c.offset - b.c.offset);
  // A follows B when it carries on further into the recording, starting where B ends, or later by no more than was removed.
  const follows = (b: Clip, a: Clip) => a.trimStart >= b.trimEnd - 1e-3 && a.offset >= b.offset + len(b) - 1e-3 && a.offset - (b.offset + len(b)) <= a.trimStart - b.trimEnd + 1e-3;
  const at = same.findIndex(({ i }) => i === index);
  let first = at;
  while (first > 0 && follows(same[first - 1].c, same[first].c)) first--;
  let last = at;
  while (last < same.length - 1 && follows(same[last].c, same[last + 1].c)) last++;
  const picked = same.slice(first, last + 1);
  return { indices: picked.map(({ i }) => i), start: picked[0].c.offset, end: Math.max(...picked.map(({ c }) => c.offset + len(c))) };
}

export interface CueChange { scene: number; beat: number; cue: number }
export interface Cued { scene: number; beat: number; t: number; cued: boolean }

/**
 * Removes the timeline span [from, to) from a chain. `close`: everything after moves earlier by its length (clips
 * on both lanes that start at or after `to`, and cues; cues inside the span go to `from`). Otherwise the span
 * becomes silence and nothing moves. Clips are split where needed; returns the new clips and the cue changes.
 */
export function removeSpan(clips: Clip[], chain: Chain, from: number, to: number, close: boolean, clicks: Cued[]): { clips: Clip[]; cues: CueChange[] } {
  const gap = to - from;
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const inChain = new Set(chain.indices);
  const out: Clip[] = [];
  clips.forEach((c, i) => {
    const end = c.offset + len(c);
    if (!inChain.has(i)) {
      out.push(close && c.offset >= to - 1e-3 ? { ...c, offset: r3(c.offset - gap) } : c);
      return;
    }
    if (end <= from + 1e-3) { out.push(c); return; }
    if (c.offset >= to - 1e-3) { out.push(close ? { ...c, offset: r3(c.offset - gap) } : c); return; }
    // The piece overlaps the span: keep what is before it and what is after it.
    if (c.offset < from - 1e-3) out.push({ ...c, trimEnd: r3(c.trimStart + (from - c.offset)) });
    if (end > to + 1e-3) {
      const cut = to - c.offset;
      out.push({ ...c, id: c.offset < from - 1e-3 ? `${c.id}-${Math.round(to * 1000)}` : c.id, trimStart: r3(c.trimStart + cut), offset: r3(close ? from : to) });
    }
  });
  const cues: CueChange[] = [];
  if (close) {
    for (const k of clicks) {
      if (!k.cued || k.t < from - 1e-3) continue;
      cues.push({ scene: k.scene, beat: k.beat, cue: Math.round((k.t < to ? from : k.t - gap) * 100) / 100 });
    }
  }
  return { clips: out.sort((a, b) => a.offset - b.offset || a.lane - b.lane), cues };
}
