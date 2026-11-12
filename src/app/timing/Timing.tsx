// The Timing window: wires the clock, board, timeline editing, prompter, narration recording and
// voice-over hooks together and lays out the header, board, script panel, controls and timeline.
import { useCleanVoice } from './useCleanVoice';
import type { RawBeat, RawDoc } from '../editor/doc';
import { BeatDrawer } from './BeatDrawer';
import { AvatarWindow } from '../AvatarWindow';
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
import { AvatarBoard } from './AvatarBoard';
import { avatarRows } from './AvatarLane';
import { AvatarDrawer, type Placement } from './AvatarDrawer';
import { onAvatarDone, setCast, startAvatar, useAvatarJobs } from './avatarJobs';
import { useClipEditing } from './useClipEditing';
import { useClock } from './useClock';
import { useCueDragging } from './useCueDragging';
import { useNarrationRecording } from './useNarrationRecording';
import { useNotesEditing } from './useNotesEditing';
import { replaceRoute } from '../route';
import { useSceneVoice } from './useSceneVoice';
import type { CastMember } from '../ScriptCast';
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
  /** Clips and cues changed together (one undo step). */
  onTimeline: (v: Voiceover | undefined, changes: { scene: number; beat: number; cue: number | undefined }[]) => void;
  /** Undo the last change. */
  onUndo: () => void;
  /** Replace the speaker notes of a beat; an empty string removes the field. */
  onNotes: (scene: number, beat: number, notes: string) => void;
  /** A take was made from this timing and voice-over, ready to export. */
  onTake: (id: string) => void;
  /** Close Timing and edit this beat in the editor. */
  onEditBeat: (scene: number, beat: number) => void;
  /** The presentation as edited, and replacing one beat (from the beat drawer). */
  doc: RawDoc;
  onBeat: (scene: number, beat: number, next: RawBeat) => void;
  /** Where a scene's camera (your avatar) shows in the video; `beatsToo`: beats that set their own follow it. */
  onSceneLayout: (scene: number, layout: Placement, beatsToo: boolean) => void;
  /** The scene being looked at in the editor: Timing opens with the playhead at its start. */
  startScene?: number;
  /** Where the playhead was (from the address, after a reload): Timing opens there instead. */
  startTime?: number;
  /** Closes Timing; `scene` is the one at the playhead, for the editor to show. */
  onClose: (scene: number) => void;
  /** The presentation replaced as a whole (a scene's voice generated: its clip and every cue after it). */
  onDoc: (next: unknown) => void;
  /** Opens the Script page at this beat (the one at the playhead), over Timing. */
  onScript: (scene: number, beat: number) => void;
}

/**
 * Timing a presentation to a voice-over: the narration's waveform with every click placed on it. Drag a click
 * to move it, or play and tap T as each line starts. The board plays along, with the script line beside it.
 */
export function Timing({ presentation, text, presentationId, voiceover, onVoiceover, onCues, onTimeline, onUndo, onNotes, onTake, onEditBeat, doc, onBeat, onSceneLayout, startScene = 0, startTime, onClose, onDoc, onScript }: Props) {
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
    const t = startTime !== undefined ? Math.min(startTime, total) : startScene > 0 ? clicks.find((c) => c.scene >= startScene)?.t ?? 0 : 0;
    seek(t);
    centerOn(t);
  }, [pps]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Clips being transcribed in the Transcript window. */
  const [transcribing, setTranscribing] = useState<Clip[] | null>(null);
  /** The clip open in the clip window (double-click a clip). */
  // Followed by its id; after an undo takes that clip away, the clip now at the same place on the same lane.
  const [openAt, setOpenAt] = useState<{ id: string; lane: number; t: number } | null>(null);
  const setOpenClipId = (id: string | null) => {
    if (id === null) return setOpenAt(null);
    const c = clips.find((x) => x.id === id);
    // A clip just made (a new take, a piece) isn't in the list yet: keep the place, take the new id.
    setOpenAt((was) => (c ? { id: c.id, lane: c.lane, t: c.offset + 0.01 } : was ? { ...was, id } : null));
  };
  const openClip = openAt === null ? null : (() => {
    const i = clips.findIndex((c) => c.id === openAt.id);
    return i >= 0 ? i : clips.findIndex((c) => c.lane === openAt.lane && openAt.t >= c.offset && openAt.t < c.offset + (c.trimEnd - c.trimStart));
  })();
  const [me, setMe] = useState(false);
  // Your avatar's videos: made in the background (avatarJobs.ts), each put on its clip (and the pieces it was cut
  // into) when it's ready, without stopping playback.
  const jobs = useAvatarJobs();
  const avatars = useMemo(() => avatarRows(clips, doc, jobs), [clips, doc, jobs]);
  const latest = useRef({ clips, onVoiceover });
  latest.current = { clips, onVoiceover };
  useEffect(() => onAvatarDone((clipId, a) => {
    const cs = latest.current.clips;
    const c = cs.find((x) => x.id === clipId);
    if (!c) return false;
    const next = cs.map((x) => (x.id === clipId || (x.upload === c.upload && x.trimStart >= a.trimStart - 0.05 && x.trimEnd <= a.trimEnd + 0.05) ? { ...x, avatar: a } : x));
    latest.current.onVoiceover({ clips: next });
    return true;
  }), []);
  // A podcast's speakers each have their own avatar: the avatar jobs need to know whose is whose.
  setCast((doc as { cast?: { id: string; avatar: string }[] }).cast);
  const makeAvatar = (i: number) => {
    const c = clips[i];
    if (c) startAvatar(c.id, { upload: c.upload, trimStart: c.trimStart, trimEnd: c.trimEnd, name: c.scene ?? c.name, speaker: c.speaker }).catch((e) => setError(`Avatar: ${(e as Error).message}`));
  };
  /** The beat whose options are open in the drawer. */
  const [openBeat, setOpenBeat] = useState<{ scene: number; beat: number } | null>(null);
  // The avatar drawer (a block in the video lane clicked), by clip id; one drawer at a time.
  const [openAvatar, setOpenAvatar] = useState<string | null>(null);
  useEffect(() => { if (openBeat) setOpenAvatar(null); }, [openBeat]);
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
    useNarrationRecording({ clock, clips, clicks, setClips, onCue, onCues, setBusy, setError, sceneIdAt: (t) => presentation.scenes[clicks.filter((c) => c.t <= t + 0.05).at(-1)?.scene ?? clicks[0]?.scene ?? 0]?.id });

  // Closing goes back to the editor on the scene at the playhead.
  const close = () => onClose(clicks.reduce((at, c) => (c.t <= now() + 1e-3 ? c.scene : at), clicks[0]?.scene ?? startScene));
  useTimingKeys({ playing, tapping, tap, play, pause, seek, now, onClose: close, recording, nextLine, previousLine, stopRecording, togglePauseRecording, splitAtPlayhead });

  const { loadVoiceover, makeTake } = useVoiceoverFile({ clips, perf, text, presentationId, onVoiceover, onTake, seek, setPps, setBusy, setError });

  const np = useNowPlaying({ presentation, clicks, drag, time, total, now, tts, voicer });
  // The playhead in the address, so a reload opens Timing where it was: to the tenth of a second when it stands,
  // each second while playing (browsers limit how often the address may change).
  const mark = playing ? Math.floor(time) : Math.round(time * 10) / 10;
  useEffect(() => { if (placed.current) replaceRoute({ t: mark }); }, [mark]);
  const sceneVoice = useSceneVoice({ doc, presentationId, voicer, onDoc, setError });
  const atScene = np.current?.scene ?? startScene;
  const sceneName = (si: number) => presentation.scenes[si]?.title ?? doc.scenes[si]?.id ?? `scene ${si + 1}`;

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
        onMe={() => setMe(true)}
        onScript={() => onScript(np.current?.scene ?? atScene, np.current?.beat ?? 0)}
        onClose={close}
      />
      <div className="timing-body prompter">
        <AvatarBoard host={host} doc={doc} clips={clips} presentation={presentation} perf={perf} now={now} playing={playing} />
        <Resizer orientation="vertical" value={scriptW.value} onChange={scriptW.setValue} onReset={scriptW.reset} min={320} max={1600} style={{ order: -1 }} />
        <ScriptPanel
          voiceNow={voiceNow}
          width={scriptW.value}
          recording={recording}
          recPaused={recPaused}
          time={time}
          np={np}
          notes={notes}
          cast={(doc as { cast?: CastMember[] }).cast}
        />
        {(() => {
          const c = openAvatar ? clips.find((x) => x.id === openAvatar) : undefined;
          const si = c ? doc.scenes.findIndex((s) => s.id === c.scene) : -1;
          return c && si >= 0 && !openBeat ? (
            <AvatarDrawer doc={doc} clip={c} scene={si} onPlace={onSceneLayout} onOpenClip={() => setOpenClipId(c.id)} onClose={() => setOpenAvatar(null)} />
          ) : null;
        })()}
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
        sceneName={sceneName(atScene)}
        sceneHasVoice={clips.some((c) => c.scene === doc.scenes[atScene]?.id)}
        generatingScene={sceneVoice.generating !== null}
        onGenerateScene={() => void sceneVoice.generate(atScene)}
      />
      {error && <p className="error-text">{error}</p>}
      {busy && <p className="muted">{busy}</p>}
      {sceneVoice.generating !== null && <p className="muted">Generating the voice of “{sceneName(sceneVoice.generating)}” (about half a minute)…</p>}
      {sceneVoice.note && sceneVoice.generating === null && <p className="muted">{sceneVoice.note}</p>}
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
        onOpenClip={(i) => setOpenClipId(clips[i]?.id ?? null)}
        avatars={avatars}
        onSelectAvatar={(i) => {
          const c = clips[i];
          setOpenBeat(null);
          setOpenAvatar(c?.id ?? null);
          // The board shows the clip, so a new position is seen as it's chosen.
          if (c && !playing) seek(c.offset + Math.min(1, (c.trimEnd - c.trimStart) / 2));
        }}
        selectedAvatar={openAvatar}
        onMakeAvatar={makeAvatar}
        onSceneVoice={(si) => void sceneVoice.generate(si)}
        sceneVoiceBusy={sceneVoice.generating !== null}
        sceneIndexOf={(id) => doc.scenes.findIndex((s) => s.id === id)}
        drawClipPeaks={drawClipPeaks}
        np={np}
        tapping={tapping}
        tapIndex={tapIndex}
        startDrag={startDrag}
        beatDrag={drag}
        onCue={onCue}
      />
      {openClip !== null && openClip >= 0 && clips[openClip] && (
        <ClipDetail
          key={openAt!.id}
          presentationId={presentationId}
          onMyAvatar={() => setMe(true)}
          clip={clips[openClip]}
          index={openClip}
          clips={clips}
          clicks={clicks}
          beatOf={(c) => doc.scenes[c.scene]?.beats?.[c.beat]}
          allCued={doc.scenes.flatMap((s, si) => (s.beats ?? []).flatMap((b, bi) => (b.cue !== undefined ? [{ scene: si, beat: bi, t: b.cue, cued: true }] : [])))}
          missing={missing.has(clips[openClip].upload)}
          loadBuffer={mixer.loadBuffer}
          setClips={setClips}
          setTimeline={(next, changes) => { if (mixer.isActive()) mixer.hardStop(); onTimeline(next.length ? { clips: next } : undefined, changes); }}
          onUndo={onUndo}
          onReplaced={(id) => setOpenClipId(id)}
          playFrom={(t) => { seek(t); play(); }}
          pause={pause}
          onClean={(i) => void cleanClip(i)}
          onRestore={restoreClip}
          onTranscribe={(i) => setTranscribing([clips[i]])}
          deleteClip={deleteClip}
          onClose={() => setOpenClipId(null)}
        />
      )}
      {me && <AvatarWindow onClose={() => setMe(false)} />}
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
