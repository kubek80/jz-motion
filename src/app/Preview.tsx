import { useEffect, useRef } from 'react';
import { compile, Stage } from '../engine';

/** Small board showing the end of a presentation's first scene. Shows nothing for one that doesn't load. */
export function Preview({ json, className = 'preview' }: { json: string; className?: string }) {
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
    void stage.load(result.presentation, { scene: 0, beat: result.presentation.scenes[0].beats.length });
    return () => stage.destroy();
  }, [json]);
  return <div className={className} ref={host} />;
}
