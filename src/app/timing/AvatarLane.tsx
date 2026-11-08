import type { Clip } from '../../engine/schema';
import type { RawDoc } from '../editor/doc';

// The video lane under the voice lanes: your avatar's video for each clip that has one, where it plays (a still of
// it, its length). Marked when it no longer matches its clip (the clip was trimmed or cut since); a clip whose scene
// shows the camera but has no avatar yet gets a dashed place. Double-click either: the clip's window, to make it
// (again).

const showsCamera = (l: unknown) => l === 'camera' || l === 'pip' || l === 'pip-left';

export interface AvatarRow { index: number; at: number; length: number; video?: string; stale?: boolean; scene?: string }

export function avatarRows(clips: Clip[], doc: RawDoc): AvatarRow[] {
  const wants = new Set(doc.scenes.filter((s) => [s.layout, ...(s.beats ?? []).map((b) => (b as { layout?: unknown }).layout)].some(showsCamera)).map((s) => s.id));
  const seen = new Set<string>();
  const rows: AvatarRow[] = [];
  clips.forEach((c, index) => {
    if (c.avatar) {
      if (seen.has(c.avatar.video)) return;
      seen.add(c.avatar.video);
      const length = c.avatar.trimEnd - c.avatar.trimStart;
      // Pieces of one recording share an avatar: it is still right when, together, they cover what it says.
      const pieces = clips.filter((x) => x.avatar?.video === c.avatar!.video);
      const covers = Math.abs(Math.min(...pieces.map((x) => x.trimStart)) - c.avatar.trimStart) < 0.05 && Math.abs(Math.max(...pieces.map((x) => x.trimEnd)) - c.avatar.trimEnd) < 0.05;
      // …and still sit where they were, relative to each other.
      const at = c.offset - (c.trimStart - c.avatar.trimStart);
      const together = pieces.every((x) => Math.abs(x.offset - (x.trimStart - c.avatar!.trimStart) - at) < 0.05);
      rows.push({ index, at, length, video: c.avatar.video, stale: !covers || !together, scene: c.scene });
    } else if (c.scene && wants.has(c.scene)) {
      rows.push({ index, at: c.offset, length: c.trimEnd - c.trimStart, scene: c.scene });
    }
  });
  return rows;
}

export function AvatarLane({ rows, pps, time, onOpen }: { rows: AvatarRow[]; pps: number; time: number; onOpen: (clipIndex: number) => void }) {
  if (!rows.length) return null;
  return (
    <div className="avatar-lane" title="Your avatar's videos, under the voice they say">
      {rows.map((r) => {
        const on = time >= r.at && time < r.at + r.length;
        return (
          <div
            key={`${r.index}-${r.video ?? 'none'}`}
            className={['avatar-block', r.video ? '' : 'empty', r.stale ? 'stale' : '', r.video && on ? 'showing' : ''].join(' ')}
            style={{ left: 20 + r.at * pps, width: Math.max(34, r.length * pps) }}
            onDoubleClick={() => onOpen(r.index)}
            title={r.video
              ? `Your avatar saying this clip (${r.length.toFixed(1)} s)${r.stale ? ': made for an earlier cut of the clip, make it again' : ''} · double-click to see it or make it again`
              : 'This scene shows the camera, but its clip has no avatar yet · double-click to make one'}
          >
            {r.video && <video src={`/uploads/${r.video}#t=1`} muted playsInline preload="metadata" />}
            <span className="avatar-name">{r.video ? `${r.stale ? '⚠ ' : ''}🎥 avatar` : '🎥 no avatar yet'}</span>
          </div>
        );
      })}
    </div>
  );
}
