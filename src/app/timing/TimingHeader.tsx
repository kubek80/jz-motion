// The Timing window's header: click count, loading or removing the voice-over, generating voice,
// clearing cues, making a take and closing.
import type { Clip, Voiceover } from '../../engine/schema';
import type { Voicer } from '../settingsStore';
import { fmt } from './format';

interface Props {
  clickCount: number;
  cuedCount: number;
  primary: Clip | undefined;
  clips: Clip[];
  voiceDuration: number;
  loadVoiceover: (file: File) => Promise<void>;
  onVoiceover: (v: Voiceover | undefined) => void;
  voicer: Voicer;
  missingSentences: string[];
  generating: { done: number; total: number } | null;
  generateVoice: () => Promise<void>;
  onCues: (changes: { scene: number; beat: number; cue: number | undefined }[], clearOthers?: boolean) => void;
  recording: boolean;
  busy: string | null;
  makeTake: () => Promise<void>;
  /** Clips whose recording isn't on this computer, and removing them all. */
  missingCount: number;
  removeMissing: () => void;
  /** Opens the transcript of every clip whose recording is here. */
  onTranscript: () => void;
  onClose: () => void;
}

export function TimingHeader({ clickCount, cuedCount, primary, clips, voiceDuration, loadVoiceover, onVoiceover, voicer, missingSentences, generating, generateVoice, onCues, recording, busy, makeTake, missingCount, removeMissing, onTranscript, onClose }: Props) {
  return (
    <header className="timing-head">
      <h2>Timing</h2>
      <span className="muted">{clickCount} clicks · {cuedCount} placed on the {primary ? 'voice-over' : 'timeline'}</span>
      <span className="spacer" />
      <label className="file-btn" title="An audio or video file with your narration (mp3, m4a, wav, webm, mp4…)">
        {primary
          ? (clips.length > 1
            ? `${clips.length} clips · ${fmt(voiceDuration)}`
            : `Voice-over: ${primary.name ?? primary.upload} (${fmt(voiceDuration)})`)
          : 'Load a voice-over…'}
        <input type="file" accept="audio/*,video/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void loadVoiceover(f); }} />
      </label>
      {missingCount > 0 && (
        <button className="danger missing-clips" disabled={recording} onClick={removeMissing}
          title="These clips point at recordings that aren't on this computer (uploads/ isn't in git, so they stay on the computer that recorded them). Removes just those clips; the cues stay.">
          Remove {missingCount} missing {missingCount === 1 ? 'clip' : 'clips'}
        </button>
      )}
      {clips.length > missingCount && (
        <button onClick={onTranscript} disabled={recording} title="Turn what you recorded into text, under the beats you said it over: copy it, or put it into the speaker notes">Transcript</button>
      )}
      {primary && <button onClick={() => onVoiceover(undefined)} title="Stop using this voice-over (the cues stay)">Remove</button>}
      <button
        onClick={() => void generateVoice()}
        disabled={!missingSentences.length || !!generating || !voicer.apiKey}
        title={voicer.apiKey ? `Generate a short voice clip for each sentence in Speaker notes, so the prompter can show how long each line should take (${voicer.model}, voice: ${voicer.voice}). Settings → Voice generation to change the model or key.` : 'Set an API key in Settings → Voice generation first'}
      >
        {generating ? `Generating voice ${generating.done}/${generating.total}…` : missingSentences.length ? `Generate voice (${missingSentences.length})` : 'Voice up to date'}
      </button>
      <button onClick={() => onCues([], true)} disabled={!cuedCount || recording} title="Forget every cue: clicks go back to even pauses">Clear cues</button>
      <button className="primary" disabled={!primary || !!busy} onClick={() => void makeTake()} title="A take with this timing and the voice-over as its sound, ready to export in the Video tab">
        Make a take for export
      </button>
      <button onClick={onClose} title="Close (Esc)">✕</button>
    </header>
  );
}
