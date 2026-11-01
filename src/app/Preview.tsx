import { useEffect, useRef } from 'react';
import { compile, Stage } from '../engine';

/** Small board showing the end of a scene (the first by default). Shows nothing for a presentation that doesn't load. */
export function Preview({ json, className = 'preview', scene = 0 }: { json: string; className?: string; scene?: number }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let result;
    try {
      result = compile(JSON.parse(json));
    } catch {
      return;
    }
    if (!result.ok || !host.current) return;
    const stage = new Stage(host.current);
    const at = Math.min(scene, result.presentation.scenes.length - 1);
    void stage.load(result.presentation, { scene: at, beat: result.presentation.scenes[at].beats.length });
    return () => stage.destroy();
  }, [json, scene]);
  return <div className={className} ref={host} />;
}
