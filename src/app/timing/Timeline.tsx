// The timeline at the bottom of the Timing window: the ruler, the two clip lanes with waveforms
// and trim handles, the beat clicks, and the playhead. Pressing on empty timeline seeks there.
// Right-click a clip (play, split, change lane, remove) or a beat (edit it, play, let it follow);
// double-click a beat to edit it in the editor.
import { useState, type RefObject } from 'react';
import { ContextMenu, menuAt, type MenuAt } from '../ContextMenu';
import type { Clip } from '../../engine/schema';
import { fmt, rulerStep, SCENE_COLORS } from './format';
import type { ClipDrag } from './useClipEditing';
import type { LiveRecording } from './useClock';
import type { NowPlaying } from './useNowPlaying';

interface Props {
  laneRef: RefObject<HTMLDivElement | null>;
  /** Recordings not on this computer: their clips are marked and can still be removed. */
  missing: Set<string>;
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
  splitClipAt: (index: number, t: number) => void;
  canSplitAt: (index: number, t: number) => boolean;
  setClipLane: (index: number, lane: 0 | 1) => void;
  /** Plays from a moment on the timeline. */
  playFrom: (t: number) => void;
  /** Closes Timing and edits a beat in the editor. */
  onEditBeat: (scene: number, beat: number) => void;
  drawClipPeaks: (canvasEl: HTMLCanvasElement | null, c: Clip) => void;
  np: NowPlaying;
  tapping: boolean;
  tapIndex: number;
  startDrag: (e: React.PointerEvent, index: number) => void;
  onCue: (scene: number, beat: number, cue: number | undefined) => void;
}

export function Timeline({ laneRef, missing, height, rec, seek, time, total, pps, width, clips, primary, clipDrag, startDragClip, startTrimClip, deleteClip, splitClipAt, canSplitAt, setClipLane, playFrom, onEditBeat, drawClipPeaks, np, tapping, tapIndex, startDrag, onCue }: Props) {
  const { shown, currentIndex, beatOf, sceneTitle } = np;
  const [menu, setMenu] = useState<(MenuAt & ({ kind: 'clip'; index: number; t: number } | { kind: 'beat'; index: number })) | null>(null);
  /** The timeline moment under the pointer. */
  const timeAt = (e: React.MouseEvent) => {
    const el = laneRef.current;
    return el ? Math.max(0, (e.clientX - el.getBoundingClientRect().left + el.scrollLeft - 20) / pps) : 0;
  };
  return (
    <div
      className="timing-lane"
      ref={laneRef}
      style={{ height }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('.click') || rec.current || e.button !== 0) return;
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
            // Wide enough to grab and to reach its ×, however short it is.
            const w = Math.max(34, (trimEnd - trimStart) * pps);
            const gone = missing.has(c.upload);
            return (
              <div
                key={c.id}
                className={['clip-block', `lane-${lane}`, dragging ? 'dragging' : '', gone ? 'missing' : ''].join(' ')}
                style={{ left: 20 + offset * pps, width: w }}
                onPointerDown={(e) => startDragClip(e, i)}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (!rec.current) setMenu({ kind: 'clip', index: i, t: timeAt(e), ...menuAt(e, 240) }); }}
                title={`${gone ? `The recording ${c.upload} isn't on this computer; × removes the clip. ` : ''}${c.name ?? 'clip'} (${(trimEnd - trimStart).toFixed(1)} s) · drag body to move/swap lane · drag edges to trim · S splits at playhead`}
              >
                <canvas className="clip-peaks" ref={(el) => drawClipPeaks(el, previewClip)} />
                <span className="clip-name">{gone ? '⚠ missing · ' : ''}{c.name ?? `clip ${i + 1}`}</span>
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
                onDoubleClick={() => onEditBeat(c.scene, c.beat)}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (!rec.current) setMenu({ kind: 'beat', index: i, ...menuAt(e, 200) }); }}
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
      {menu?.kind === 'clip' && clips[menu.index] && (() => {
        const c = clips[menu.index];
        return (
          <ContextMenu
            at={menu}
            onClose={() => setMenu(null)}
            title={`${c.name ?? `clip ${menu.index + 1}`} · ${fmt(c.trimEnd - c.trimStart)}${missing.has(c.upload) ? ' · recording missing' : ''}`}
            items={[
              { label: '▶ Play from here', onClick: () => playFrom(menu.t), disabled: missing.has(c.upload) },
              { label: '✂ Split here', onClick: () => splitClipAt(menu.index, menu.t), disabled: !canSplitAt(menu.index, menu.t), hint: 'Cut this clip in two where you right-clicked' },
              { label: c.lane === 0 ? '↓ Move to the lower lane' : '↑ Move to the upper lane', onClick: () => setClipLane(menu.index, c.lane === 0 ? 1 : 0) },
              'separator',
              { label: '✕ Remove clip', tone: 'danger', onClick: () => deleteClip(menu.index), hint: 'Takes the clip off the timeline; the recording file stays' },
            ]}
          />
        );
      })()}
      {menu?.kind === 'beat' && shown[menu.index] && (() => {
        const c = shown[menu.index];
        const b = beatOf(c);
        return (
          <ContextMenu
            at={menu}
            onClose={() => setMenu(null)}
            title={`${c.scene + 1}.${c.beat + 1} ${b?.title ?? ''} · ${sceneTitle(c)}`}
            items={[
              { label: '✎ Edit this beat', onClick: () => onEditBeat(c.scene, c.beat), hint: 'Close Timing and open this beat in the editor (or double-click it)' },
              { label: '▶ Play from here', onClick: () => playFrom(c.t) },
              { label: '↺ Let it follow the one before', onClick: () => onCue(c.scene, c.beat, undefined), disabled: !c.cued, hint: 'Forget where it was placed: it plays right after the previous beat' },
            ]}
          />
        );
      })()}
    </div>
  );
}
