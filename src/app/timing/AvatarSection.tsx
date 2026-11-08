import { useEffect, useRef, useState } from 'react';
import type { Clip } from '../../engine/schema';
import { loadFalKey } from '../settingsStore';

// Your avatar saying a clip: a talking-head video made on fal.ai from your avatar photo (voice/my-avatar.json),
// named on the clip (`avatar`) and shown in the video where the layout shows the camera. Making one takes minutes;
// the job is remembered by clip, so closing the window (or Generate again, which starts one for the new clip)
// doesn't lose it: the next time the clip's window opens, it picks the job up.

type Info = { avatar: { photo: string } | null; pricePerSecond: number; hasServerKey: boolean };
type AvatarResult = { video: string; trimStart: number; trimEnd: number };
const jobKey = (clipId: string) => `jzm.avatarJob.${clipId}`;

/** Start your avatar for a clip's part of its recording; the clip's window picks the result up. */
export async function startAvatar(clipId: string, req: { upload: string; trimStart: number; trimEnd: number; name?: string }) {
  const res = await fetch('/api/avatar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...req, apiKey: loadFalKey() || undefined }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  const { id } = await res.json();
  try { sessionStorage.setItem(jobKey(clipId), id); } catch { /* the window then just loses track of it */ }
}

export function AvatarSection({ clip, from, to, onAvatar }: { clip: Clip; from: number; to: number; onAvatar: (a: AvatarResult) => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<string | null>(() => { try { return sessionStorage.getItem(jobKey(clip.id)); } catch { return null; } });
  const done = useRef(onAvatar);
  done.current = onAvatar;
  useEffect(() => { fetch('/api/my-avatar').then((r) => r.json()).then(setInfo).catch(() => undefined); }, []);

  useEffect(() => {
    if (!job) return;
    let stop = false;
    const tick = async () => {
      const j = await (await fetch(`/api/avatar/${job}`)).json().catch(() => ({ status: 'failed', error: 'the server did not answer' }));
      if (stop) return;
      if (j.status === 'running') { setNote(j.note ?? 'working'); window.setTimeout(tick, 3000); return; }
      try { sessionStorage.removeItem(jobKey(clip.id)); } catch { /* fine */ }
      setJob(null);
      setNote(null);
      if (j.status === 'done') done.current({ video: j.result.video, trimStart: j.result.trimStart, trimEnd: j.result.trimEnd });
      else setError(j.error ?? 'the avatar failed');
    };
    void tick();
    return () => { stop = true; };
  }, [job, clip.id]);

  const make = async () => {
    setError(null);
    try {
      await startAvatar(clip.id, { upload: clip.upload, trimStart: from, trimEnd: to, name: clip.scene ?? clip.name });
      setJob(sessionStorage.getItem(jobKey(clip.id)));
    } catch (e) { setError((e as Error).message); }
  };

  const a = clip.avatar;
  const stale = a && (Math.abs(a.trimStart - from) > 0.05 || Math.abs(a.trimEnd - to) > 0.05);
  const cost = info ? (to - from) * info.pricePerSecond : 0;
  return (
    <section className="avatar-section">
      <h4>My avatar</h4>
      {a && <video className="avatar-preview" src={`/uploads/${a.video}`} muted loop autoPlay playsInline />}
      <div className="row wrap">
        <button onClick={() => void make()} disabled={!!job || !info?.avatar} title="Your avatar photo says this clip (Kling AI Avatar on fal.ai); shown in the video where the scene's layout shows the camera">
          {job ? 'Making…' : a ? '🧑 Make it again' : '🧑 Make my avatar'}
        </button>
        <span className="muted">{job ? note : `about $${cost.toFixed(2)} · a few minutes on fal.ai`}</span>
      </div>
      {!info?.avatar && info && <p className="muted hint">No avatar photo yet: <code>npm run avatar -- photo &lt;picture&gt;</code></p>}
      {stale && !job && <p className="note-text">Made for an earlier cut of this clip: make it again so it says the same.</p>}
      {a && <p className="muted hint">Shown in the video where the scene's or beat's <b>layout</b> shows the camera (pip in a corner, camera full screen).</p>}
      {error && <p className="note-text">{error}</p>}
    </section>
  );
}
