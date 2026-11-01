import type { LayoutName } from '../engine/schema';
import type { Segment } from './performance';

// Builds the FFmpeg command that turns board frames (JPEGs on stdin) plus recorded tracks into the
// final video: camera layouts as overlays switched on and off over time, audio tracks mixed.

export interface TrackInput {
  name: string;
  path: string;
  /** Seconds into the video at which the track's first moment plays (negative: it started earlier). */
  offset: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

export interface FfmpegJob {
  width: number;
  height: number;
  fps: number;
  duration: number;
  tracks: TrackInput[];
  segments: Segment[];
  out: string;
}

const BG = '0x0d1114';
const FRAME_COLOR = '0x3ef0ff';
const even = (n: number) => Math.round(n / 2) * 2;

type Placement = { layout: Exclude<LayoutName, 'side'> | 'side'; track: string; second?: string };

/** A segment's layout made concrete for the tracks that exist (no camera → board). */
export function resolveLayout(seg: { layout: LayoutName; track: string }, videoTracks: string[]): Placement {
  if (seg.layout === 'board' || !videoTracks.length) return { layout: 'board', track: '' };
  const main = videoTracks.includes(seg.track) ? seg.track : videoTracks[0];
  if (seg.layout === 'side') {
    const other = videoTracks.find((t) => t !== main);
    return other ? { layout: 'side', track: main, second: other } : { layout: 'pip', track: main };
  }
  return { layout: seg.layout, track: main };
}

export function buildFfmpegArgs(job: FfmpegJob): string[] {
  const { width: W, height: H, fps } = job;
  const between = (segs: { start: number; end: number }[]) => segs.map((s) => `between(t,${s.start.toFixed(3)},${s.end.toFixed(3)})`).join('+');
  const videoTracks = job.tracks.filter((t) => t.hasVideo).map((t) => t.name);
  const placed = job.segments.map((s) => ({ ...s, ...resolveLayout(s, videoTracks) }));

  // Layers drawn over the background, each visible during some segments.
  interface Layer { key: string; source: string; filter: string; x: number; y: number; segs: Segment[] }
  const layers = new Map<string, Layer>();
  const margin = even(W * 0.025);
  const pipW = even(W * 0.26);
  const pipH = even((pipW * 9) / 16);
  const boardSmallW = even(W * 0.36);
  const boardSmallH = even((boardSmallW * H) / W);
  const frame = (t: number) => `drawbox=x=0:y=0:w=iw:h=ih:color=${FRAME_COLOR}:t=${t}`;
  const cover = (w: number, h: number) => `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`;
  const add = (key: string, source: string, filter: string, x: number, y: number, seg: Segment) => {
    const layer = layers.get(key) ?? { key, source, filter, x, y, segs: [] };
    layer.segs.push(seg);
    layers.set(key, layer);
  };

  for (const s of placed) {
    switch (s.layout) {
      case 'board':
        add('board', 'board', 'null', 0, 0, s);
        break;
      case 'pip':
      case 'pip-left':
        add('board', 'board', 'null', 0, 0, s);
        add(`${s.layout}:${s.track}`, s.track, `${cover(pipW, pipH)},${frame(5)}`, s.layout === 'pip' ? W - pipW - margin : margin, H - pipH - margin, s);
        break;
      case 'camera':
        add(`full:${s.track}`, s.track, cover(W, H), 0, 0, s);
        add('board-small', 'board', `scale=${boardSmallW}:${boardSmallH},${frame(4)}`, W - boardSmallW - margin, margin, s);
        break;
      case 'side':
        add(`left:${s.track}`, s.track, `${cover(W / 2, H)},${frame(4)}`, 0, 0, s);
        add(`right:${s.second}`, s.second!, `${cover(W / 2, H)},${frame(4)}`, W / 2, 0, s);
        break;
    }
  }
  // Paint order: full-frame layers first, then smaller ones on top.
  const rank = (k: string) => (k === 'board' || k.startsWith('full:') ? 0 : k.startsWith('left:') || k.startsWith('right:') ? 1 : 2);
  const ordered = [...layers.values()].sort((a, b) => rank(a.key) - rank(b.key));

  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-'];
  const inputIndex = new Map<string, number>();
  job.tracks.forEach((t, i) => {
    inputIndex.set(t.name, i + 1);
    if (t.offset >= 0) args.push('-itsoffset', t.offset.toFixed(3), '-i', t.path);
    else args.push('-ss', (-t.offset).toFixed(3), '-i', t.path);
  });

  const graph: string[] = [`color=c=${BG}:s=${W}x${H}:r=${fps}:d=${job.duration.toFixed(3)}[bg]`];
  // Split each source into as many copies as layers use it.
  const uses = new Map<string, string[]>();
  for (const l of ordered) {
    const list = uses.get(l.source) ?? [];
    list.push(`${l.key.replace(/[^\w]/g, '_')}_in`);
    uses.set(l.source, list);
  }
  for (const [source, outs] of uses) {
    const input = source === 'board' ? `[0:v]setpts=PTS-STARTPTS,format=yuv420p` : `[${inputIndex.get(source)}:v]fps=${fps},format=yuv420p`;
    graph.push(outs.length === 1 ? `${input}[${outs[0]}]` : `${input},split=${outs.length}${outs.map((o) => `[${o}]`).join('')}`);
  }
  let current = 'bg';
  ordered.forEach((l, i) => {
    const id = l.key.replace(/[^\w]/g, '_');
    graph.push(`[${id}_in]${l.filter}[${id}]`);
    const next = `v${i}`;
    graph.push(`[${current}][${id}]overlay=x=${l.x}:y=${l.y}:eof_action=pass:enable='${between(l.segs)}'[${next}]`);
    current = next;
  });

  const audio = job.tracks.filter((t) => t.hasAudio);
  audio.forEach((t, i) => graph.push(`[${inputIndex.get(t.name)}:a]aresample=48000:async=1:first_pts=0[a${i}]`));
  if (audio.length > 1) graph.push(`${audio.map((_, i) => `[a${i}]`).join('')}amix=inputs=${audio.length}:normalize=0:duration=longest[aout]`);
  else if (audio.length === 1) graph.push('[a0]anull[aout]');

  args.push('-filter_complex', graph.join(';'), '-map', `[${current}]`);
  if (audio.length) args.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '192k');
  args.push(
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-t', job.duration.toFixed(3), '-movflags', '+faststart', job.out,
  );
  return args;
}
