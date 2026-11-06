// A strip over the timeline showing all of it at once: the voice clips on their two lanes, every beat
// (coloured by scene), the playhead, and a box around the part the timeline shows. Click or drag to go
// somewhere; the box follows. Useful once the timeline is zoomed in.
import type { Clip } from '../../engine/schema';
import { fmt, SCENE_COLORS } from './format';
import type { NowPlaying } from './useNowPlaying';

interface Props {
  total: number;
  clips: Clip[];
  missing: Set<string>;
  np: NowPlaying;
  time: number;
  /** The seconds the timeline shows now. */
  view: { from: number; to: number };
  /** Centres the timeline on a moment. */
  centerOn: (t: number) => void;
  /** Zoom out to show everything. */
  onFit: () => void;
}

export function TimelineMinimap({ total, clips, missing, np, time, view, centerOn, onFit }: Props) {
  const pct = (t: number) => `${(Math.max(0, Math.min(total, t)) / total) * 100}%`;
  const all = view.from <= 0.01 && view.to >= total - 0.01;
  const go = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    centerOn(((e.clientX - r.left) / r.width) * total);
  };
  return (
    <div className="minimap-row">
      <div
        className="minimap"
        title="The whole timeline: click or drag to go there"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          go(e);
        }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) go(e); }}
      >
        {clips.map((c) => (
          <span
            key={c.id}
            className={`mm-clip lane-${c.lane} ${missing.has(c.upload) ? 'missing' : ''}`}
            style={{ left: pct(c.offset), width: `max(2px, ${((c.trimEnd - c.trimStart) / total) * 100}%)` }}
          />
        ))}
        {np.shown.map((c) => (
          <span key={`${c.scene}:${c.beat}`} className={`mm-click ${c.cued ? 'cued' : ''}`} style={{ left: pct(c.t), background: SCENE_COLORS[c.scene % SCENE_COLORS.length] }} />
        ))}
        {!all && <span className="mm-view" style={{ left: pct(view.from), width: pct(view.to - view.from) }} />}
        <span className="mm-playhead" style={{ left: pct(time) }} />
      </div>
      <span className="muted mm-range">{fmt(view.from)}–{fmt(Math.min(view.to, total))}</span>
      <button onClick={onFit} disabled={all} title="Zoom out to show the whole timeline">Fit</button>
    </div>
  );
}
