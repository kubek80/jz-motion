import { useEffect, useMemo, useRef, useState } from 'react';
import type { CompiledPresentation } from '../engine/compile';
import { useVoicer } from './settingsStore';
import { entryFor, loadSidecar, requestTts, sentencesOf, splitSentences, type TtsSidecar } from './tts';

interface Props {
  presentation: CompiledPresentation;
  presentationId: string;
  onNotes: (scene: number, beat: number, notes: string) => void;
  onClose: () => void;
}

const fmtDuration = (s: number) => s >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${s.toFixed(1)}s`;

/**
 * A full-screen writing surface for the whole narration: every scene's beats listed with their notes
 * (editable in place) and sentence-level duration estimates (or real lengths once voice is generated).
 */
export function Script({ presentation, presentationId, onNotes, onClose }: Props) {
  const voicer = useVoicer();
  const [tts, setTts] = useState<TtsSidecar>({});
  const [generating, setGenerating] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ scene: number; beat: number } | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => { void loadSidecar(presentationId).then(setTts).catch(() => undefined); }, [presentationId]);

  const missingSentences = useMemo(() => {
    const out: string[] = []; const seen = new Set<string>();
    for (const scene of presentation.scenes) for (const beat of scene.beats) for (const text of splitSentences(beat.notes)) {
      if (seen.has(text)) continue;
      seen.add(text);
      if (!entryFor(tts, voicer, text)) out.push(text);
    }
    return out;
  }, [presentation, tts, voicer]);

  const generateVoice = async () => {
    if (!missingSentences.length) return;
    setError(null);
    setGenerating({ done: 0, total: missingSentences.length });
    let current = { ...tts };
    try {
      for (let i = 0; i < missingSentences.length; i++) {
        const r = await requestTts(presentationId, missingSentences[i], voicer);
        current = { ...current, [r.hash]: { text: r.text, audio: r.audio, duration: r.duration, voice: r.voice, model: r.model } };
        setTts(current);
        setGenerating({ done: i + 1, total: missingSentences.length });
      }
    } catch (e) { setError((e as Error).message); } finally { setGenerating(null); }
  };

  const sentencesForBeat = (notes: string | undefined) => sentencesOf(notes, tts, voicer);
  const beatDur = (notes: string | undefined) => sentencesForBeat(notes).reduce((s, l) => s + (l.entry?.duration ?? l.estimated), 0);
  const beatHasClip = (notes: string | undefined) => sentencesForBeat(notes).some((l) => l.entry);

  // Totals across the whole presentation.
  const totals = useMemo(() => {
    let dur = 0, beats = 0, sentences = 0, clips = 0;
    for (const scene of presentation.scenes) for (const beat of scene.beats) {
      beats++;
      for (const line of sentencesForBeat(beat.notes)) {
        sentences++;
        dur += line.entry?.duration ?? line.estimated;
        if (line.entry) clips++;
      }
    }
    return { dur, beats, sentences, clips };
  }, [presentation, tts, voicer]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (scene: number, beat: number, notes: string | undefined) => { setDraft(notes ?? ''); setEditing({ scene, beat }); };
  const save = () => { if (editing) onNotes(editing.scene, editing.beat, draft); setEditing(null); };
  const cancel = () => setEditing(null);

  // Esc closes the window (bail when typing in the textarea).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('textarea, input')) return;
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="script">
      <header className="script-head">
        <h2>Script</h2>
        <span className="muted">
          {presentation.scenes.length} scenes · {totals.beats} beats · {totals.sentences} sentences · {totals.clips}/{totals.sentences} with voice
        </span>
        <span className="script-total" title={totals.clips < totals.sentences ? 'From generated clips where available, otherwise ~150 wpm from word count' : 'Sum of generated voice clips'}>
          {totals.clips < totals.sentences ? '~' : ''}{fmtDuration(totals.dur)}
        </span>
        <span className="spacer" />
        <button
          onClick={() => void generateVoice()}
          disabled={!missingSentences.length || !!generating || !voicer.apiKey}
          title={voicer.apiKey ? `Generate a short clip for each sentence (${voicer.model}, voice: ${voicer.voice})` : 'Set an API key in Settings → Voice generation first'}
        >
          {generating ? `Generating ${generating.done}/${generating.total}…` : missingSentences.length ? `Generate voice (${missingSentences.length})` : 'Voice up to date'}
        </button>
        <button onClick={onClose} title="Close (Esc)">✕</button>
      </header>
      {error && <p className="error-text">{error}</p>}
      <div className="script-body">
        {presentation.scenes.map((scene, si) => {
          const sceneDur = scene.beats.reduce((s, b) => s + beatDur(b.notes), 0);
          const sceneHasClip = scene.beats.some((b) => beatHasClip(b.notes));
          return (
            <section key={si} className="script-scene">
              <header className="script-scene-head">
                <span className="muted">Scene {si + 1}</span>
                <h3>{scene.title ?? scene.id}</h3>
                <span className="spacer" />
                <span className="muted script-scene-total">{sceneHasClip ? '' : '~'}{fmtDuration(sceneDur)}</span>
              </header>
              <ol className="script-beats">
                {scene.beats.map((beat, bi) => {
                  const sentences = sentencesForBeat(beat.notes);
                  const dur = sentences.reduce((s, l) => s + (l.entry?.duration ?? l.estimated), 0);
                  const anyClip = sentences.some((l) => l.entry);
                  const isEditing = editing?.scene === si && editing?.beat === bi;
                  return (
                    <li key={bi} className={['script-beat', isEditing ? 'editing' : ''].join(' ')}>
                      <div className="script-beat-head">
                        <b>{beat.title ?? `Beat ${bi + 1}`}</b>
                        <span className="muted script-beat-dur">{sentences.length ? `${anyClip ? '' : '~'}${fmtDuration(dur)}` : 'no notes'}</span>
                      </div>
                      {isEditing ? (
                        <ScriptEdit draft={draft} onDraft={setDraft} onSave={save} onCancel={cancel} />
                      ) : (
                        <button className="script-notes" onClick={() => start(si, bi, beat.notes)} title="Click to edit the speaker notes">
                          {sentences.length ? (
                            <ul>
                              {sentences.map((line, i) => (
                                <li key={i} className={line.entry ? '' : 'estimated'}>
                                  <span className="script-sentence">{line.text}</span>
                                  <span className="script-sentence-dur">{line.entry ? '' : '~'}{(line.entry?.duration ?? line.estimated).toFixed(1)}s</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="muted">Click to add speaker notes.</span>
                          )}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ScriptEdit({ draft, onDraft, onSave, onCancel }: { draft: string; onDraft: (s: string) => void; onSave: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Autosize to its content, so the whole script scrolls naturally instead of each beat having its own scrollbar.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 4}px`;
  }, [draft]);
  return (
    <div className="script-edit">
      <textarea
        ref={ref}
        autoFocus
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSave(); }
        }}
        placeholder="What you say over this beat. End sentences with a period so each shows up on its own line."
      />
      <div className="script-edit-tools">
        <span className="muted hint">Ctrl+Enter to save · Esc to cancel</span>
        <span className="spacer" />
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={onSave}>Save</button>
      </div>
    </div>
  );
}
