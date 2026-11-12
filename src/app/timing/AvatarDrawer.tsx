import { useEffect } from 'react';
import type { Clip } from '../../engine/schema';
import type { RawDoc } from '../editor/doc';
import { AvatarVideo } from '../AvatarVideo';
import { startAvatar, useAvatarJobs } from './avatarJobs';

// Your avatar for one clip, without leaving Timing (click its block in the video lane): the video, and where it shows
// in the video, for the clip's scene: not at all (the board alone), in a bottom corner, beside the board, or full
// frame with the board small. Make it (again), or open the clip's window.

export type Placement = 'board' | 'pip' | 'pip-left' | 'side' | 'camera';
const PLACES: { value: Placement; label: string; hint: string }[] = [
  { value: 'board', label: 'Hidden', hint: 'The board alone' },
  { value: 'pip', label: 'Corner, right', hint: 'Bottom-right, over the board' },
  { value: 'pip-left', label: 'Corner, left', hint: 'Bottom-left, over the board' },
  { value: 'side', label: 'Side by side', hint: 'You on the left half, the board on the right' },
  { value: 'camera', label: 'Full frame', hint: 'You fill the frame, the board small in the top right' },
];

interface Props {
  doc: RawDoc;
  clip: Clip;
  /** The clip's scene, by index in the presentation. */
  scene: number;
  /** Set the scene's layout; `beatsToo`: the beats that set their own follow it. */
  onPlace: (scene: number, layout: Placement, beatsToo: boolean) => void;
  onOpenClip: () => void;
  onClose: () => void;
}

export function AvatarDrawer({ doc, clip, scene, onPlace, onOpenClip, onClose }: Props) {
  const job = useAvatarJobs()[clip.id];
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as HTMLElement).closest('input, textarea, select') || document.querySelector('.context-menu, .confirm')) return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);
  const s = doc.scenes[scene];
  if (!s) return null;
  // Scenes without a layout show the board alone when the camera is your avatar.
  const current = ((s as { layout?: Placement }).layout ?? 'board') as Placement;
  const ownBeats = (s.beats ?? []).map((b, i) => [i, (b as { layout?: string }).layout] as const).filter(([, l]) => l);
  const busy = !!job && !job.error;
  const make = () => void startAvatar(clip.id, { upload: clip.upload, trimStart: clip.trimStart, trimEnd: clip.trimEnd, name: clip.scene ?? clip.name, speaker: clip.speaker }).catch(() => undefined);
  return (
    <aside className="beat-drawer avatar-drawer" onPointerDown={(e) => e.stopPropagation()}>
      <div className="drawer-head">
        <div>
          <h3>My avatar</h3>
          <span className="muted">{scene + 1} · {s.title ?? s.id} · {(clip.trimEnd - clip.trimStart).toFixed(1)} s</span>
        </div>
        <span className="spacer" />
        <button onClick={onOpenClip} title="The clip's window: its sound, volume, record or generate again">Clip…</button>
        <button onClick={onClose} title="Close (Esc)">✕</button>
      </div>
      <div className="drawer-body">
        {clip.avatar ? <AvatarVideo key={clip.avatar.video} className="avatar-preview" file={clip.avatar.video} loop autoPlay /> : <p className="muted">No avatar for this clip yet.</p>}
        <div className="row wrap">
          <button onClick={make} disabled={busy}>{busy ? `Making… ${job?.note ?? ''}` : clip.avatar ? '🧑 Make it again' : '🧑 Make my avatar'}</button>
        </div>
        <h4>Where it shows in the video</h4>
        <div className="placements" role="radiogroup">
          {PLACES.map((p) => (
            <button key={p.value} role="radio" aria-checked={current === p.value} className={`placement ${current === p.value ? 'on' : ''}`} onClick={() => onPlace(scene, p.value, false)} title={p.hint}>
              <span className={`mini mini-${p.value}`}><i className="b" /><i className="a" /></span>
              {p.label}
            </button>
          ))}
        </div>
        <p className="muted hint">For the whole scene “{s.title ?? s.id}”: Timing’s board, the editor and the video follow it.</p>
        {ownBeats.length > 0 && (
          <p className="note-text">
            {ownBeats.length === 1 ? `Beat ${ownBeats[0][0] + 1} sets its own` : `Beats ${ownBeats.map(([i]) => i + 1).join(', ')} set their own`} ({[...new Set(ownBeats.map(([, l]) => l))].join(', ')}).{' '}
            <button className="small" onClick={() => onPlace(scene, current, true)}>Make {ownBeats.length === 1 ? 'it' : 'them'} follow the scene</button>
          </p>
        )}
      </div>
    </aside>
  );
}
