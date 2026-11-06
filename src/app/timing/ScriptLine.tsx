// One sentence of the prompter, with its length and (when active) a live countdown and bar.
import { useEffect, useRef } from 'react';
import type { SentenceInfo } from '../tts';

/**
 * One sentence of a beat's notes. The clip's duration (or an estimate) drives the countdown and bar.
 * The active line's bar and remaining-time number are driven by its own requestAnimationFrame against
 * DOM refs: setState every frame fought a CSS transition and the bar only settled on pause.
 */
export function ScriptLine({ line, active, said, playDur, startAt = 0, getBeatElapsed }: { line: SentenceInfo; active?: boolean; /** Already read: dimmed. */ said?: boolean; playDur?: number; startAt?: number; getBeatElapsed?: () => number }) {
  const dur = line.entry?.duration ?? line.estimated;
  // `dur` is the voice clip's own length (what the badge shows); `liveDur` is scaled to the actual
  // beat duration so the countdown and bar line up with when Now flips to Next.
  const liveDur = playDur ?? dur;
  const estimated = !line.entry;
  const liRef = useRef<HTMLLIElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!active || !getBeatElapsed) return;
    let raf = 0;
    const tick = () => {
      const into = Math.max(0, getBeatElapsed() - startAt);
      const left = liveDur - into;
      const pct = Math.min(100, (into / Math.max(0.1, liveDur)) * 100);
      const over = left < -0.2;
      if (barRef.current) barRef.current.style.width = `${pct.toFixed(2)}%`;
      if (countRef.current) countRef.current.textContent = left >= 0 ? `${left.toFixed(1)}s left` : `+${(-left).toFixed(1)}s`;
      if (liRef.current) liRef.current.classList.toggle('over', over);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, liveDur, startAt, getBeatElapsed]);
  return (
    <li ref={liRef} className={['line', active ? 'active' : '', said ? 'said' : '', estimated ? 'estimated' : ''].join(' ')}>
      <span className="line-text">{line.text}</span>
      <span className="line-meta">
        <span className="line-dur" title={estimated ? 'Estimated from word count — generate voice for the real length' : 'Length of the generated voice clip'}>{estimated ? '~' : ''}{dur.toFixed(1)}s</span>
        {active && <span className="line-count" ref={countRef}>{liveDur.toFixed(1)}s left</span>}
      </span>
      {active && (
        <span className="line-bar"><span ref={barRef} style={{ width: '0%' }} /></span>
      )}
    </li>
  );
}
