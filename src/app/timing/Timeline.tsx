// The timeline at the bottom of the Timing window: the ruler, the two clip lanes with waveforms
// and trim handles, the beat clicks, and the playhead. Pressing on empty timeline seeks there.
import type { RefObject } from 'react';
import type { Clip } from '../../engine/schema';
import { fmt, rulerStep, SCENE_COLORS } from './format';
import type { ClipDrag } from './useClipEditing';
import type { LiveRecording } from './useClock';
import type { NowPlaying } from './useNowPlaying';

interface Props {
  laneRef: RefObject<HTMLDivElement | null>;
  height: number;
  rec: RefObject<LiveRecording | null>;
  seek: (t: number) => void;
  time: number;
  total: number;
  pps: number;
  width: number;
  clips: Clip[];
  primary: Clip | undefined;
  clipDrag: ClipDrag | null;
  startDragClip: (e: React.PointerEvent, index: number) => void;
  startTrimClip: (e: React.PointerEvent, index: number, side: 'start' | 'end') => void;
  deleteClip: (index: number) => void;
  drawClipPeaks: (canvasEl: HTMLCanvasElement | null, c: Clip) => void;
  np: NowPlaying;
  tapping: boolean;
  tapIndex: number;
  startDrag: (e: React.PointerEvent, index: number) => void;
  onCue: (scene: number, beat: number, cue: number | undefined) => void;
}

export function Timeline({ laneRef, height, rec, seek, time, total, pps, width, clips, primary, clipDrag, startDragClip, startTrimClip, deleteClip, drawClipPeaks, np, tapping, tapIndex, startDrag, onCue }: Props) {
  const { shown, currentIndex, beatOf, sceneTitle } = np;
  return (
    <div
      className="timing-lane"
      ref={laneRef}
      style={{ height }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('.click') || rec.current) return;
        const r = e.currentTarget.getBoundingClientRect();
        seek((e.clientX - r.left + e.currentTarget.scrollLeft - 20) / pps);
      }}
    >
      <div className="timing-track" style={{ width }}>
        <div className="ruler">
          {Array.from({ length: Math.ceil(total / rulerStep(pps)) + 1 }, (_, i) => i * rulerStep(pps)).map((s) => (
            <span key={s} style={{ left: 20 + s * pps }}>{fmt(s).replace(/\.\d$/, '')}</span>
          ))}
        </div>
        <div className="clip-lanes">
          {clips.map((c, i) => {
            const dragging = clipDrag?.index === i;
            const offset = dragging ? clipDrag!.offset : c.offset;
            const lane = dragging ? clipDrag!.lane : c.lane;
            const trimStart = dragging && clipDrag!.trimStart !== undefined ? clipDrag!.trimStart : c.trimStart;
            const trimEnd = dragging && clipDrag!.trimEnd !== undefined ? clipDrag!.trimEnd : c.trimEnd;
            const previewClip: Clip = { ...c, offset, lane, trimStart, trimEnd };
            const w = Math.max(6, (trimEnd - trimStart) * pps);
            return (
              <div
                key={c.id}
                className={['clip-block', `lane-${lane}`, dragging ? 'dragging' : ''].join(' ')}
                style={{ left: 20 + offset * pps, width: w }}
                onPointerDown={(e) => startDragClip(e, i)}
                title={`${c.name ?? 'clip'} · drag body to move/swap lane · drag edges to trim · S splits at playhead`}
              >
                <canvas className="clip-peaks" ref={(el) => drawClipPeaks(el, previewClip)} />
                <span className="clip-name">{c.name ?? `clip ${i + 1}`}</span>
                <button
                  className="clip-delete"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); deleteClip(i); }}
                  title="Remove this clip from the timeline"
                >×</button>
                <div
                  className="clip-trim clip-trim-start"
                  onPointerDown={(e) => startTrimClip(e, i, 'start')}
                  title="Drag to trim the start of this clip"
                />
                <div
                  className="clip-trim clip-trim-end"
                  onPointerDown={(e) => startTrimClip(e, i, 'end')}
                  title="Drag to trim the end of this clip"
                />
              </div>
            );
          })}
          {!primary && <span className="muted wave-empty">No voice-over yet: load one above, or tap along in silence.</span>}
        </div>
        <div className="clicks">
          {shown.map((c, i) => {
            const color = SCENE_COLORS[c.scene % SCENE_COLORS.length];
            const b = beatOf(c);
            return (
              <div
                key={`${c.scene}:${c.beat}`}
                className={['click', i % 2 ? 'row2' : '', c.cued ? 'cued' : 'auto', c.late ? 'late' : '', i === currentIndex ? 'current' : '', tapping && i === tapIndex ? 'tap-next' : ''].join(' ')}
                style={{ left: 20 + c.t * pps, '--c': color } as React.CSSProperties}
                onPointerDown={(e) => startDrag(e, i)}
                onDoubleClick={() => onCue(c.scene, c.beat, undefined)}
                title={`${sceneTitle(c)} · ${b?.title ?? `beat ${c.beat + 1}`} at ${fmt(c.t)}${c.cued ? '' : ' (follows the one before)'}${c.late ? ' (starts before the previous animation ends: that one jumps to its end)' : ''}\n${b?.notes ?? ''}`}
              >
                <span className="flag">{c.scene + 1}.{c.beat + 1} {b?.title ?? ''}</span>
                <span className="anim" style={{ width: Math.max(2, (c.until - c.from) * pps) }} />
              </div>
            );
          })}
        </div>
        <div className="playhead" style={{ left: 20 + time * pps }} />
      </div>
    </div>
  );
}
