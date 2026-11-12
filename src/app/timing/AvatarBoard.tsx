import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Clip } from '../../engine/schema';
import type { CompiledPresentation } from '../../engine/compile';
import type { RawDoc } from '../editor/doc';
import type { Performance } from '../../video/performance';
import { avatarFrame, planAvatar } from '../../video/avatarPlan';
import { AvatarLayer } from '../../render/avatarLayer';

// Timing's board with your avatar, drawn as the video draws it (the same plan and the same drawing as the export's
// render page): in a corner, beside the board or full frame with the board small, gliding between places, holding
// its last frame to the end of its scene, in step with the playhead. Muted: the clip is the sound.

export function AvatarBoard({ host, doc, clips, presentation, perf, now, playing }: {
  host: RefObject<HTMLDivElement | null>; doc: RawDoc; clips: Clip[]; presentation: CompiledPresentation; perf: Performance; now: () => number; playing: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const layer = useRef<AvatarLayer | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const plan = useMemo(() => planAvatar(presentation, { scenes: doc.scenes as never, cast: doc.cast, voiceover: { clips, studio: doc.voiceover?.studio } }, perf), [presentation, doc.scenes, doc.cast, doc.voiceover?.studio, clips, perf]);

  useEffect(() => {
    if (!frame.current || !host.current || layer.current) return;
    const l = new AvatarLayer(frame.current, host.current);
    layer.current = l;
    // A video that can't play says why (not downloaded, not on this computer) instead of a black box.
    for (const v of l.videos) {
      v.addEventListener('error', () => {
        const file = v.src.split('/uploads/')[1]?.split('#')[0] ?? '';
        void fetch(`/uploads/${file}`, { headers: { range: 'bytes=0-0' } }).then(async (r) => {
          const j = r.ok ? {} : await r.json().catch(() => ({}));
          setProblem(j.lfs ? 'avatar video not downloaded: run git lfs pull' : !r.ok ? 'avatar video not on this computer' : 'this browser can’t play the avatar video');
        }).catch(() => setProblem('avatar video not available'));
      });
      v.addEventListener('loadeddata', () => setProblem(null));
    }
  }, [host]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (layer.current) void layer.current.show(avatarFrame(plan, now()), { playing });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [plan, now, playing]);

  return (
    <div className="timing-board">
      {/* A 16:9 frame inside whatever space Timing gives the board: the avatar is placed on it, as in the video. */}
      <div className="board-frame" ref={frame}>
        <div className="board-host" ref={host} />
        {problem && <span className="avatar-video-problem avatar-problem-note">⚠ {problem}</span>}
      </div>
    </div>
  );
}
