// The board in the Timing window: a Stage that renders the presentation at the clock's time on
// every animation frame, and pauses playback when the clock runs off the end.
import { useEffect, useRef } from 'react';
import { Stage } from '../../engine';
import type { CompiledPresentation } from '../../engine/compile';
import type { Clip } from '../../engine/schema';
import { stateAt, type Performance } from '../../video/performance';
import type { Clock } from './useClock';

export function useBoardFollowsClock(presentation: CompiledPresentation, perf: Performance, clips: Clip[], total: number, clock: Clock) {
  const { now, pause, mixer, silent, setTime } = clock;
  /** Current clip count read from the rAF tick (which closes over its first render). */
  const clipsCountRef = useRef(0);
  // ---------------------------------------------------------------- the board, following the clock
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const perfRef = useRef(perf);
  perfRef.current = perf;
  clipsCountRef.current = clips.length;
  useEffect(() => {
    const s = new Stage(host.current!);
    stage.current = s;
    let raf = 0;
    let alive = true;
    void s.load(presentation).then(() => {
      const tick = () => {
        if (!alive) return;
        // `now()` is frozen during a recording pause (see its definition), so the board and
        // prompter naturally hold still here without a guard in the tick itself.
        const t = now();
        const at = stateAt(perfRef.current, t);
        s.renderAt(at.scene, at.time, t);
        setTime(t);
        // Auto-pause when the clock runs off the end: for silent mode use silent.playing; for
        // clip playback use the mixer's active flag so we only pause when we were really playing.
        if (clipsCountRef.current === 0) { if (silent.current.playing && t >= total) pause(); }
        else if (mixer.isActive() && t >= total) pause();
        raf = requestAnimationFrame(tick);
      };
      tick();
    });
    return () => { alive = false; cancelAnimationFrame(raf); s.destroy(); stage.current = null; };
  }, [presentation]); // eslint-disable-line react-hooks/exhaustive-deps
  return host;
}
