import { AvatarVideo } from '../AvatarVideo';
import { useEffect, useRef, useState, type Ref } from 'react';
import type { Clip } from '../../engine/schema';
import type { CompiledPresentation } from '../../engine/compile';
import { layoutAt, stateAt, type Performance } from '../../video/performance';

// Timing's board with your avatar, laid out as the video will be: where a scene's or beat's layout shows the camera
// and a clip has an avatar (`avatar` on the clip), its video plays in step with the playhead: full frame with the
// board small in the top right (camera), or in a bottom corner (pip, pip-left). Muted: the clip is the sound.

type Shown = { video: string; at: number; layout: 'camera' | 'pip' | 'pip-left' } | null;

/** The avatar to show at `t` on the timeline, and where. */
export function avatarAt(clips: Clip[], presentation: CompiledPresentation, perf: Performance, t: number): Shown {
  const st = stateAt(perf, t);
  if (!presentation.scenes[st.scene]) return null;
  const { layout } = layoutAt(presentation, st.scene, st.time, 'board');
  if (layout !== 'camera' && layout !== 'pip' && layout !== 'pip-left') return null;
  for (const c of clips) {
    if (!c.avatar) continue;
    const at = c.offset - (c.trimStart - c.avatar.trimStart);
    if (t >= at && t < at + (c.avatar.trimEnd - c.avatar.trimStart)) return { video: c.avatar.video, at, layout };
  }
  return null;
}

export function AvatarBoard({ host, clips, presentation, perf, now, playing }: {
  host: Ref<HTMLDivElement>; clips: Clip[]; presentation: CompiledPresentation; perf: Performance; now: () => number; playing: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [shown, setShown] = useState<Shown>(null);
  const key = (s: Shown) => (s ? `${s.video}|${s.layout}` : '');
  // What is showing, kept across the effect restarting (play, pause, edits), so a change is never missed.
  const showing = useRef('');

  // Each frame: what to show, and keep the video where the playhead is.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = now();
      const s = avatarAt(clips, presentation, perf, t);
      if (key(s) !== showing.current) { showing.current = key(s); setShown(s); }
      const v = video.current;
      if (s && v && v.readyState >= 1) {
        const want = t - s.at;
        if (Math.abs(v.currentTime - want) > (playing ? 0.3 : 0.04)) v.currentTime = Math.max(0, want);
        if (playing && v.paused) void v.play().catch(() => undefined);
        if (!playing && !v.paused) v.pause();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clips, presentation, perf, now, playing]);

  return (
    <div className={`timing-board${shown ? ` avatar-${shown.layout}` : ''}`}>
      <div className="board-host" ref={host} />
      {shown && <AvatarVideo key={shown.video} ref={video} className="avatar-live" file={shown.video} />}
    </div>
  );
}
