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
  /** Opens the transcript of one clip. */
  onTranscribe: (index: number) => void;
  /** Removes a clip's background noise (a cleaned copy), or goes back to the original recording. */
  onClean: (index: number) => void;
  onRestore: (index: number) => void;
  /** Closes Timing and edits a beat in the editor. */
  onEditBeat: (scene: number, beat: number) => void;
  drawClipPeaks: (canvasEl: HTMLCanvasElement | null, c: Clip) => void;
  np: NowPlaying;
  tapping: boolean;
  tapIndex: number;
  startDrag: (e: React.PointerEvent, index: number) => void;
  onCue: (scene: number, beat: number, cue: number | undefined) => void;
  /** A beat being dragged (for the hint, and to show the voice clips that move with it). */
  beatDrag: { index: number; t0: number; t: number; ripple: boolean; clips: boolean } | null;
}

/** Height of one row of beat labels, and a label's widest. */
const FLAG_ROW = 24;
const FLAG_MAX = 160;

export function Timeline({ laneRef, missing, height, rec, seek, time, total, pps, width, clips, primary, clipDrag, startDragClip, startTrimClip, deleteClip, splitClipAt, canSplitAt, setClipLane, playFrom, onTranscribe, onClean, onRestore, onEditBeat, drawClipPeaks, np, tapping, tapIndex, startDrag, onCue, beatDrag }: Props) {
  const { shown, currentIndex, beatOf, sceneTitle } = np;
  // Beat labels go in rows above their lines: as many rows as the timeline's height allows, each label in the
  // lowest row where it doesn't run into the label before it (a short timeline keeps two rows).
  const rowCount = Math.max(2, Math.floor((height - 22 - 76 - 34) / FLAG_ROW));
  const flagRow = (() => {
    const ends: number[] = Array(rowCount).fill(-Infinity);
    return shown.map((c) => {
      const x = 20 + c.t * pps;
      const label = `${c.scene + 1}.${c.beat + 1} ${beatOf(c)?.title ?? ''}`;
      const w = Math.min(FLAG_MAX, 14 + label.length * 6.1);
      let row = ends.findIndex((end) => end <= x - 2);
      if (row < 0) row = ends.indexOf(Math.min(...ends));
      ends[row] = x + w;
      return row;
    });
  })();
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
      {beatDrag && (() => {
        const c = shown[beatDrag.index];
        const by = beatDrag.t - beatDrag.t0;
        return (
          <div className="drag-hint-anchor">
            <div className="drag-hint">
              <b>{c ? `${c.scene + 1}.${c.beat + 1}` : 'Beat'} → {fmt(beatDrag.t)}</b>
              <span className="muted"> ({by >= 0 ? '+' : '−'}{Math.abs(by).toFixed(2)} s)</span>
              <span className={beatDrag.ripple ? 'key on' : 'key'}><kbd>Shift</kbd> later beats too</span>
              <span className={beatDrag.clips ? 'key on' : 'key'}><kbd>Ctrl</kbd> voice clips that start after it too</span>
            </div>
          </div>
        );
      })()}
      <div className="timing-track" style={{ width }}>
        <div className="ruler">
          {Array.from({ length: Math.floor(total / rulerStep(pps)) + 1 }, (_, i) => i * rulerStep(pps)).map((s) => (
            <span key={s} style={{ left: 20 + s * pps }}>{fmt(s).replace(/\.\d$/, '')}</span>
          ))}
        </div>
        <div className="clip-lanes">
          {clips.map((c, i) => {
            const dragging = clipDrag?.index === i;
            // Ctrl + dragging a beat: the clips that start after it move with it.
            const carried = !!beatDrag?.clips && c.offset >= beatDrag.t0 - 1e-3;
            const offset = dragging ? clipDrag!.offset : carried ? Math.max(0, c.offset + beatDrag!.t - beatDrag!.t0) : c.offset;
            const lane = dragging ? clipDrag!.lane : c.lane;
            const trimStart = dragging && clipDrag!.trimStart !== undefined ? clipDrag!.trimStart : c.trimStart;
            const trimEnd = dragging && clipDrag!.trimEnd !== undefined ? clipDrag!.trimEnd : c.trimEnd;
            const previewClip: Clip = { ...c, offset, lane, trimStart, trimEnd };
            // Wide enough to grab and to reach its ×, however short it is.
            const w = Math.max(34, (trimEnd - trimStart) * pps);
            const gone = missing.has(c.upload);
            // The clip whose voice is heard at the playhead.
            const sounding = !dragging && time >= offset && time < offset + (trimEnd - trimStart);
            return (
              <div
                key={c.id}
                className={['clip-block', `lane-${lane}`, dragging ? 'dragging' : '', gone ? 'missing' : '', sounding ? 'sounding' : ''].join(' ')}
                style={{ left: 20 + offset * pps, width: w }}
                onPointerDown={(e) => startDragClip(e, i)}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (!rec.current) setMenu({ kind: 'clip', index: i, t: timeAt(e), ...menuAt(e, 240) }); }}
                title={`${gone ? `The recording ${c.upload} isn't on this computer; × removes the clip. ` : ''}${c.name ?? 'clip'} (${(trimEnd - trimStart).toFixed(1)} s) · drag body to move/swap lane · drag edges to trim · S splits at playhead`}
              >
                <canvas className="clip-peaks" ref={(el) => drawClipPeaks(el, previewClip)} />
                <span className="clip-name">{gone ? '⚠ missing · ' : ''}{c.cleanedFrom ? '✨ ' : ''}{c.name ?? `clip ${i + 1}`}</span>
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
          {rec.current && (
            // The narration being recorded, growing on the lane it goes to.
            <div className={`clip-block lane-${rec.current.lane} recording-live`} style={{ left: 20 + rec.current.clipOffset * pps, width: Math.max(6, (time - rec.current.clipOffset) * pps) }} title={`Recording on lane ${rec.current.lane + 1}`}>
              <span className="clip-name">● recording · lane {rec.current.lane + 1}</span>
            </div>
          )}
          {!primary && <span className="muted wave-empty">No voice-over yet: load one above, or tap along in silence.</span>}
        </div>
        <div className="clicks">
          {shown.map((c, i) => {
            const color = SCENE_COLORS[c.scene % SCENE_COLORS.length];
            const b = beatOf(c);
            return (
              <div
                key={`${c.scene}:${c.beat}`}
                className={['click', c.cued ? 'cued' : 'auto', c.late ? 'late' : '', i === currentIndex ? 'current' : '', tapping && i === tapIndex ? 'tap-next' : ''].join(' ')}
                style={{ left: 20 + c.t * pps, '--c': color, '--row': flagRow[i] } as React.CSSProperties}
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
              c.cleanedFrom
                ? { label: '↺ Back to the original recording', onClick: () => onRestore(menu.index), hint: 'Use the recording as it was, with its background noise (the cleaned copy stays on disk)' }
                : { label: '✨ Clean up voice', onClick: () => onClean(menu.index), disabled: missing.has(c.upload), hint: 'Remove background noise (fan, hum, room, keyboard) with RNNoise, on this computer; the original is kept' },
              { label: '✎ Transcribe…', onClick: () => onTranscribe(menu.index), disabled: missing.has(c.upload), hint: 'What you said in this clip, as text: copy it or put it into the speaker notes' },
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
