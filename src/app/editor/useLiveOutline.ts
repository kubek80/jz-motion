import { useEffect, useRef } from 'react';
import type { CompiledScene, Stage, StagePosition } from '../../engine';
import { boardFullscreen } from '../fullscreen';
import type { RawBeat } from './doc';

// Play mode: a faint dashed outline around whatever the running actions animate, so you can see each element
// as its action triggers (the storyboard lights up the action itself). Off in edit mode and when presenting.

export function useLiveOutline(stage: React.RefObject<Stage | null>, on: boolean, scene: CompiledScene | undefined, beats: RawBeat[] | undefined, pos: StagePosition) {
  const shown = useRef('');
  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    if (!on || !scene || !beats || boardFullscreen()) {
      if (shown.current) s.setSelection([], []);
      shown.current = '';
      return;
    }
    const ids = new Set<string>();
    scene.beats.forEach((b, bi) => b.actions.forEach((t, ai) => {
      // Instant switches (play, flow, spin) get a short moment so they show at all.
      const from = b.start + t.start;
      const to = b.start + Math.max(t.end, t.start + 0.4);
      if (pos.time < from - 1e-6 || pos.time >= to) return;
      const a = beats[bi]?.actions[ai];
      [a?.target ?? a?.focus ?? []].flat().forEach((id) => typeof id === 'string' && id !== 'all' && ids.add(id));
    }));
    const key = [...ids].sort().join(',');
    if (key === shown.current) return;
    shown.current = key;
    s.setSelection([], [...ids]);
  }, [stage, on, scene, beats, pos.time]);
}
