import { useMemo, useState } from 'react';
import type { Clip } from '../../engine/schema';
import type { CompiledPresentation } from '../../engine/compile';
import type { RawDoc } from '../editor/doc';
import type { Performance } from '../../video/performance';
import { planAvatar } from '../../video/avatarPlan';
import { shotPieces, shotsOf, shotsPrice, studioStretches, type Stretch } from '../../video/studioShots';
import { openRouterKey } from '../MyAvatar';
import { startStudioShot, useStudioJobs } from './studioJobs';

// A podcast's studio wide shot, in the avatar drawer (a cast of two or more): the studio picture (the first two in
// the cast together, drawn once for the presentation), how sharp the shots are, and the scene's shots: where its
// layout is `studio`, cut into pieces of at most 9.6 s, each made on fal.ai with both people saying their lines.

interface Props {
  doc: RawDoc; scene: number; clips: Clip[]; presentation: CompiledPresentation; perf: Performance;
  /** The presentation's studio changed (merged into the latest presentation). */
  onStudio: (studio: NonNullable<RawDoc['studio']>) => void;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

export function StudioSection({ doc, scene, clips, presentation, perf, onStudio }: Props) {
  const jobs = useStudioJobs();
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cast = doc.cast ?? [];
  const sceneId = doc.scenes[scene]?.id;
  const studio = doc.studio;
  const resolution = studio?.resolution ?? '480p';
  const made = doc.voiceover?.studio ?? [];
  // The scene's shots: where the layout shows the studio, as the video will.
  const shots = useMemo(() => {
    const plan = planAvatar(presentation, { scenes: doc.scenes as never, cast, voiceover: { clips, studio: made } }, perf);
    return studioStretches(plan).filter((s) => s.scene === sceneId).flatMap((s) => shotsOf(s));
  }, [presentation, doc.scenes, cast, clips, made, perf, sceneId]);
  const isMade = (s: Stretch) => made.some((m) => Math.abs(m.offset - s.at) < 0.1 && m.length >= s.length - 0.2);
  const jobAt = (s: Stretch) => Object.values(jobs).find((j) => Math.abs(j.at - s.at) < 0.01);
  const todo = shots.filter((s) => !isMade(s) && !(jobAt(s) && !jobAt(s)!.error));
  const castIds = cast.map((c) => c.id);
  const others = [...new Set(shots.flatMap((s) => shotPieces(clips, castIds, s.at, s.length).others))].map((id) => cast.find((c) => c.id === id)?.name ?? id);

  const draw = async () => {
    setDrawing(true); setError(null);
    try {
      const r = await fetch('/api/studio/picture', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ avatars: cast.slice(0, 2).map((c) => c.avatar), apiKey: openRouterKey() || undefined }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? r.statusText);
      onStudio({ picture: j.picture, resolution });
    } catch (e) { setError((e as Error).message); } finally { setDrawing(false); }
  };
  const make = async (list: Stretch[]) => {
    setError(null);
    for (const s of list) {
      try { await startStudioShot({ picture: studio!.picture, resolution, at: s.at, length: s.length, scene: s.scene, pieces: shotPieces(clips, castIds, s.at, s.length).pieces }); } catch (e) { setError((e as Error).message); return; }
    }
  };

  return (
    <div className="studio-section">
      <h4>Studio wide shot</h4>
      {studio?.picture ? <img className="studio-picture" src={`/uploads/${studio.picture}`} alt="The studio picture" /> : <p className="muted">No studio picture yet: {cast[0]?.name} and {cast[1]?.name} together in a studio, drawn from their avatars.</p>}
      <div className="row wrap">
        <button onClick={() => void draw()} disabled={drawing} title="The image model draws the first two in the cast together in the studio (about 14¢)">{drawing ? 'Drawing… (about half a minute)' : studio?.picture ? 'Draw it again' : '🎬 Draw the studio picture'}</button>
        <label className="muted" title="480p is enough for a wide shot between close-ups; 720p is sharper and costs twice as much">
          Sharpness{' '}
          <select value={resolution} disabled={!studio} onChange={(e) => studio && onStudio({ ...studio, resolution: e.target.value as '480p' | '720p' })}>
            <option value="480p">480p</option>
            <option value="720p">720p (twice the price)</option>
          </select>
        </label>
      </div>
      {!shots.length ? (
        <p className="muted hint">This scene doesn’t show the studio: choose <b>Studio</b> above, or set a beat’s layout to studio (or an avatar action), for the wide shot there.</p>
      ) : (
        <>
          <ul className="studio-shots">
            {shots.map((s) => {
              const j = jobAt(s);
              return (
                <li key={s.at}>
                  {fmt(s.at)}–{fmt(s.at + s.length)} · {s.length.toFixed(1)} s ·{' '}
                  {j && !j.error ? <span className="busy">making… {j.note}</span> : j?.error ? <span className="error-text">{j.error}</span> : isMade(s) ? <span className="ok">✓ made</span> : <span className="muted">not made</span>}
                </li>
              );
            })}
          </ul>
          <div className="row wrap">
            {studio?.picture && todo.length > 0 && (
              <button onClick={() => void make(todo)} title="Each shot takes several minutes on fal.ai; they land on the timeline when ready">
                🎬 Make {todo.length === 1 ? 'the shot' : `${todo.length} shots`} (about ${shotsPrice(todo, resolution).toFixed(2)})
              </button>
            )}
            {studio?.picture && todo.length < shots.length && (
              <button className="small" onClick={() => void make(shots.filter((s) => !(jobAt(s) && !jobAt(s)!.error)))} title="Make the scene’s shots again (after its voice changed)">Make them again (about ${shotsPrice(shots, resolution).toFixed(2)})</button>
            )}
          </div>
          {others.length > 0 && <p className="note-text">{others.join(', ')} {others.length === 1 ? 'isn’t' : 'aren’t'} in the studio shot: it animates the first two in the cast.</p>}
        </>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
