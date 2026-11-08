// The Timing window: wires the clock, board, timeline editing, prompter, narration recording and
// voice-over hooks together and lays out the header, board, script panel, controls and timeline.
import { useCleanVoice } from './useCleanVoice';
import type { RawBeat, RawDoc } from '../editor/doc';
import { BeatDrawer } from './BeatDrawer';
import { ClipDetail } from './ClipDetail';
import { TranscriptWindow } from './TranscriptWindow';
import { TimelineMinimap } from './TimelineMinimap';
import { useMissingUploads } from './useMissingUploads';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CompiledPresentation } from '../../engine/compile';
import type { Clip, Voiceover } from '../../engine/schema';
import { clipsDuration, clipsOf } from '../../engine/voiceover';
import { cueClicks, cuePerformance } from '../../video/performance';
import { Resizer, useResizable } from '../Resizer';
import { log, voiceoverSummary } from '../debug';
import { ScriptPanel } from './ScriptPanel';
import { Timeline } from './Timeline';
import { TimingControls } from './TimingControls';
import { TimingHeader } from './TimingHeader';
import { useBoardFollowsClock } from './useBoardFollowsClock';
import { useClipEditing } from './useClipEditing';
import { useClock } from './useClock';
import { useCueDragging } from './useCueDragging';
import { useNarrationRecording } from './useNarrationRecording';
import { useNotesEditing } from './useNotesEditing';
import { useNowPlaying } from './useNowPlaying';
import { useTimingKeys } from './useTimingKeys';
import { useVoiceGeneration } from './useVoiceGeneration';
import { useVoiceoverFile } from './useVoiceoverFile';
import { useWaveformZoom } from './useWaveformZoom';

export type { Voiceover } from '../../engine/schema';

interface Props {
  presentation: CompiledPresentation;
  /** The presentation as saved (for the take). */
  text: string;
  presentationId: string;
  voiceover?: Voiceover;
  onVoiceover: (v: Voiceover | undefined) => void;
  /** Sets (or with undefined, clears) cues of beats that start clicks; `clearOthers` forgets every other cue first. */
  onCues: (changes: { scene: number; beat: number; cue: number | undefined }[], clearOthers?: boolean) => void;
  /** Replace the speaker notes of a beat; an empty string removes the field. */
  onNotes: (scene: number, beat: number, notes: string) => void;
  /** A take was made from this timing and voice-over, ready to export. */
  onTake: (id: string) => void;
  /** Close Timing and edit this beat in the editor. */
  onEditBeat: (scene: number, beat: number) => void;
  /** The presentation as edited, and replacing one beat (from the beat drawer). */
  doc: RawDoc;
  onBeat: (scene: number, beat: number, next: RawBeat) => void;
  /** The scene being looked at in the editor: Timing opens with the playhead at its start. */
  startScene?: number;
  /** Closes Timing; `scene` is the one at the playhead, for the editor to show. */
  onClose: (scene: number) => void;
}

/**
 * Timing a presentation to a voice-over: the narration's waveform with every click placed on it. Drag a click
 * to move it, or play and tap T as each line starts. The board plays along, with the script line beside it.
 */
export function Timing({ presentation, text, presentationId, voiceover, onVoiceover, onCues, onNotes, onTake, onEditBeat, doc, onBeat, startScene = 0, onClose }: Props) {
  const onCue = (scene: number, beat: number, cue: number | undefined) => onCues([{ scene, beat, cue }]);
  const clicks = useMemo(() => cueClicks(presentation), [presentation]);
  // Voiceover is held either as a legacy single clip or as a multi-clip arrangement; `clipsOf()`
  // gives a flat array either way. `primary` is the clip that drives this phase's playback (the
  // first one in the list); mixing of all clips comes in a later phase.
  const clips = useMemo(() => clipsOf(voiceover), [voiceover]);
  const primary: Clip | undefined = clips[0];
  const voiceDuration = useMemo(() => clipsDuration(clips), [clips]);
  const perf = useMemo(() => cuePerformance(presentation, voiceDuration), [presentation, voiceDuration]);
  const total = Math.max(perf.duration, voiceDuration, 1);

  const clock = useClock(clips, total);
  const { mixer, rec, time, playing, now, seek, play, pause } = clock;
  /**
   * Replace the voiceover with a new set of clips (or clear it if empty). Mutations from the UI
   * (drag, delete, trim, split) all go through this — once anything is edited the voiceover is
   * persisted in the new multi-clip shape, so legacy `{upload, duration}` fields drop away.
   * Playback is paused if active so the new arrangement takes effect from the next Play.
   */
  const setClips = (next: Clip[]) => {
    log('Timing.setClips', { recording: !!rec.current, before: voiceoverSummary(voiceover), after: voiceoverSummary(next.length ? { clips: next } : undefined) });
    if (mixer.isActive()) mixer.hardStop();
    onVoiceover(next.length ? { clips: next } : undefined);
  };

  // Panel sizes the user can drag (the script is always shown large, as a prompter). Double-click a divider to reset.
  const laneH = useResizable('timing-lane-h', 200, 120, 600);
  const scriptW = useResizable('prompter-script-w', 820, 320, 1600);

  const host = useBoardFollowsClock(presentation, perf, clips, total, clock);
  const { lane, pps, setPps, zoomTo, width, drawClipPeaks, view, centerOn, fit } = useWaveformZoom(primary, total, clock);
  const missing = useMissingUploads(clips);
  // Open at the start of the scene being edited (the very start for the first scene), once the timeline has its scale.
  const placed = useRef(false);
  useEffect(() => {
    if (placed.current || !pps) return;
    placed.current = true;
    const t = startScene > 0 ? clicks.find((c) => c.scene >= startScene)?.t ?? 0 : 0;
    seek(t);
    centerOn(t);
  }, [pps]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Clips being transcribed in the Transcript window. */
  const [transcribing, setTranscribing] = useState<Clip[] | null>(null);
  /** The clip open in the clip window (double-click a clip). */
  const [openClip, setOpenClip] = useState<number | null>(null);
  /** The beat whose options are open in the drawer. */
  const [openBeat, setOpenBeat] = useState<{ scene: number; beat: number } | null>(null);
  const { clipDrag, startDragClip, deleteClip, startTrimClip, splitAtPlayhead, splitClipAt, canSplitAt, setClipLane } = useClipEditing(clips, setClips, rec, pps, now);
  const { drag, startDrag, tapping, setTapping, tapIndex, setTapIndex, nextAfter, tap } = useCueDragging(clicks, rec, pps, onCue, onCues, seek, now, (i) => setOpenBeat({ scene: clicks[i].scene, beat: clicks[i].beat }),
    (from, by) => setClips(clips.map((c) => (c.offset >= from - 1e-3 ? { ...c, offset: Math.max(0, Math.round((c.offset + by) * 1000) / 1000) } : c))),
    (from) => { const after = clips.filter((c) => c.offset >= from - 1e-3); return after.length ? Math.min(...after.map((c) => c.offset)) : undefined; },
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { cleanClip, restoreClip } = useCleanVoice(clips, setClips, setBusy, setError);

  const notes = useNotesEditing(pause, onNotes);
  const { voicer, tts, generating, missingSentences, generateVoice } = useVoiceGeneration(presentation, presentationId, setError);
  const { recording, recPaused, startRecording, nextLine, previousLine, togglePauseRecording, stopRecording } =
    useNarrationRecording({ clock, clips, clicks, setClips, onCue, onCues, setBusy, setError });

  // Closing goes back to the editor on the scene at the playhead.
  const close = () => onClose(clicks.reduce((at, c) => (c.t <= now() + 1e-3 ? c.scene : at), clicks[0]?.scene ?? startScene));
  useTimingKeys({ playing, tapping, tap, play, pause, seek, now, onClose: close, recording, nextLine, previousLine, stopRecording, togglePauseRecording, splitAtPlayhead });

  const { loadVoiceover, makeTake } = useVoiceoverFile({ clips, perf, text, presentationId, onVoiceover, onTake, seek, setPps, setBusy, setError });

  const np = useNowPlaying({ presentation, clicks, drag, time, total, now, tts, voicer });

  // Whose voice is heard at the playhead (or where the narration being recorded goes), for the prompter.
  const sounding = clips.filter((c) => time >= c.offset && time < c.offset + (c.trimEnd - c.trimStart));
  const voiceNow = recording && rec.current
    ? { text: `● Recording on lane ${rec.current.lane + 1}`, lane: rec.current.lane, live: true }
    : sounding.length
      ? { text: `${sounding.map((c) => `lane ${c.lane + 1}`).join(' + ')} · ${sounding[0].name ?? 'clip'}`, lane: sounding.length === 1 ? sounding[0].lane : null, live: false }
      : clips.length ? { text: 'no voice here', lane: null, live: false } : undefined;

  return (
    <div className="timing">
      <TimingHeader
        clickCount={clicks.length}
        cuedCount={np.cuedCount}
        primary={primary}
        clips={clips}
        voiceDuration={voiceDuration}
        loadVoiceover={loadVoiceover}
        onVoiceover={onVoiceover}
        voicer={voicer}
        missingSentences={missingSentences}
        generating={generating}
        generateVoice={generateVoice}
        onCues={onCues}
        recording={recording}
        busy={busy}
        makeTake={makeTake}
        missingCount={clips.filter((c) => missing.has(c.upload)).length}
        removeMissing={() => setClips(clips.filter((c) => !missing.has(c.upload)))}
        onTranscript={() => setTranscribing(clips.filter((c) => !missing.has(c.upload)))}
        onClose={close}
      />
      <div className="timing-body prompter">
        <div className="timing-board" ref={host} />
        <Resizer orientation="vertical" value={scriptW.value} onChange={scriptW.setValue} onReset={scriptW.reset} min={320} max={1600} style={{ order: -1 }} />
        <ScriptPanel
          voiceNow={voiceNow}
          width={scriptW.value}
          recording={recording}
          recPaused={recPaused}
          time={time}
          np={np}
          notes={notes}
        />
        {openBeat && (
          <BeatDrawer doc={doc} presentation={presentation} scene={openBeat.scene} beat={openBeat.beat} onBeat={onBeat} onEditBeat={onEditBeat} onClose={() => setOpenBeat(null)} />
        )}
      </div>
      <TimingControls
        recording={recording}
        busy={busy}
        startRecording={startRecording}
        stopRecording={stopRecording}
        playing={playing}
        play={play}
        pause={pause}
        time={time}
        total={total}
        clicks={clicks}
        tapping={tapping}
        setTapping={setTapping}
        tapIndex={tapIndex}
        setTapIndex={setTapIndex}
        nextAfter={nextAfter}
        now={now}
        tap={tap}
        beatTitle={(c) => np.beatOf(c)?.title}
        splitAtPlayhead={splitAtPlayhead}
        hasClips={!!clips.length}
        pps={pps}
        setPps={zoomTo}
      />
      {error && <p className="error-text">{error}</p>}
      {busy && <p className="muted">{busy}</p>}
      <Resizer
        orientation="horizontal"
        value={laneH.value}
        onChange={laneH.setValue}
        onReset={laneH.reset}
        reverse
        min={120}
        max={600}
      />
      <TimelineMinimap total={total} clips={clips} missing={missing} np={np} time={time} view={view} centerOn={centerOn} onFit={fit} />
      <Timeline
        laneRef={lane}
        missing={missing}
        height={laneH.value}
        rec={rec}
        seek={seek}
        time={time}
        total={total}
        pps={pps}
        width={width}
        clips={clips}
        primary={primary}
        clipDrag={clipDrag}
        startDragClip={startDragClip}
        startTrimClip={startTrimClip}
        deleteClip={deleteClip}
        splitClipAt={splitClipAt}
        canSplitAt={canSplitAt}
        setClipLane={setClipLane}
        playFrom={(t) => { seek(t); play(); }}
        onEditBeat={onEditBeat}
        onTranscribe={(i) => setTranscribing([clips[i]])}
        onClean={(i) => void cleanClip(i)}
        onRestore={restoreClip}
        onOpenClip={setOpenClip}
        drawClipPeaks={drawClipPeaks}
        np={np}
        tapping={tapping}
        tapIndex={tapIndex}
        startDrag={startDrag}
        beatDrag={drag}
        onCue={onCue}
      />
      {openClip !== null && clips[openClip] && (
        <ClipDetail
          key={clips[openClip].id}
          clip={clips[openClip]}
          index={openClip}
          clips={clips}
          clicks={clicks}
          beatOf={(c) => doc.scenes[c.scene]?.beats?.[c.beat]}
          missing={missing.has(clips[openClip].upload)}
          setClips={setClips}
          onCues={(changes) => onCues(changes)}
          playFrom={(t) => { seek(t); play(); }}
          pause={pause}
          onClean={(i) => void cleanClip(i)}
          onRestore={restoreClip}
          onTranscribe={(i) => setTranscribing([clips[i]])}
          setClipLane={setClipLane}
          deleteClip={deleteClip}
          onClose={() => setOpenClip(null)}
        />
      )}
      {transcribing && (
        <TranscriptWindow
          clips={transcribing}
          clicks={clicks}
          beatName={(c) => `${c.scene + 1}.${c.beat + 1} ${np.beatOf(c)?.title ?? ''}`.trim()}
          notesOf={(c) => np.beatOf(c)?.notes}
          onNotes={onNotes}
          seek={seek}
          onClose={() => setTranscribing(null)}
        />
      )}
    </div>
  );
}
