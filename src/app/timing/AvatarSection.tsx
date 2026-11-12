import { AvatarVideo } from '../AvatarVideo';
import { useEffect, useState } from 'react';
import type { Clip } from '../../engine/schema';
import { clearAvatarJob, startAvatar, useAvatarJobs } from './avatarJobs';

// Your avatar saying a clip: a talking-head video made on fal.ai from your avatar (My avatar), named on the clip
// (`avatar`) and shown in the video where the layout shows the camera. Making one takes minutes; the job is followed
// by Timing (avatarJobs.ts), so it lands on the clip even with this window closed.

type Info = { avatar: { photo: string } | null; pricePerSecond: number };

export { startAvatar };

export function AvatarSection({ clip, from, to, onMyAvatar }: { clip: Clip; from: number; to: number; onMyAvatar?: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const job = useAvatarJobs()[clip.id];
  useEffect(() => { fetch('/api/my-avatar').then((r) => r.json()).then(setInfo).catch(() => undefined); }, []);

  const make = async () => {
    setError(null);
    clearAvatarJob(clip.id);
    try { await startAvatar(clip.id, { upload: clip.upload, trimStart: from, trimEnd: to, name: clip.scene ?? clip.name, speaker: clip.speaker }); } catch (e) { setError((e as Error).message); }
  };

  const a = clip.avatar;
  const busy = !!job && !job.error;
  const stale = a && (Math.abs(a.trimStart - from) > 0.05 || Math.abs(a.trimEnd - to) > 0.05);
  const cost = info ? (to - from) * info.pricePerSecond : 0;
  return (
    <section className="avatar-section">
      <h4>My avatar</h4>
      {a && <AvatarVideo key={a.video} className="avatar-preview" file={a.video} loop autoPlay />}
      <div className="row wrap">
        <button onClick={() => void make()} disabled={busy || !info?.avatar} title="Your avatar says this clip (on fal.ai); shown in the video where the scene's layout shows the camera">
          {busy ? 'Making…' : a ? '🧑 Make it again' : '🧑 Make my avatar'}
        </button>
        <span className="muted">{busy ? job.note ?? 'working' : `about $${cost.toFixed(2)} · a few minutes on fal.ai`}</span>
        {onMyAvatar && <button onClick={onMyAvatar} title="Your avatars, each with its voice">🧑 Avatar…</button>}
      </div>
      {!info?.avatar && info && <p className="muted hint">No avatar yet: give one a picture in <b>🧑 Avatar</b>.</p>}
      {stale && !busy && <p className="note-text">Made for an earlier cut of this clip: make it again so it says the same.</p>}
      {a && <p className="muted hint">Shown in the video where the scene's or beat's <b>layout</b> shows the camera (pip in a corner, camera full screen). It keeps the look it was made with until it's made again.</p>}
      {(error ?? job?.error) && <p className="note-text">{error ?? job?.error}</p>}
    </section>
  );
}
