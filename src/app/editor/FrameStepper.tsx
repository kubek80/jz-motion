import { useEffect, useRef, useState } from 'react';
import type { Stage } from '../../engine';
import { isVideoSrc } from '../../engine/videoClock';
import { updateBeats, type Raw, type RawDoc } from './doc';

// Under a selected recording on the board (edit mode): step through its frames (each distinct picture),
// see each one on the board, and add a beat action that goes to that frame (optionally with a cross-fade)
// or plays on until it. Frames are numbered from 1, as `play` counts them.

interface Props {
  stage: React.RefObject<Stage | null>;
  frame: React.RefObject<HTMLDivElement | null>;
  id: string;
  doc: RawDoc;
  sceneIndex: number;
  update: (next: RawDoc) => void;
}

/** Whether an element is a recording the stepper works on. */
export const isRecording = (el?: Raw) => el?.type === 'image' && typeof el.src === 'string' && isVideoSrc(el.src);

export function FrameStepper({ stage, frame, id, doc, sceneIndex, update }: Props) {
  const [frames, setFrames] = useState<number[] | null>(null);
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(false);
  const [into, setInto] = useState(-1);
  const [note, setNote] = useState<string | null>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const beats = doc.scenes[sceneIndex]?.beats ?? [];
  const bar = useRef<HTMLDivElement>(null);

  // The frame list, and back to the first frame when the stepper goes away.
  useEffect(() => {
    let alive = true;
    setFrames(null);
    setIndex(0);
    void stage.current?.pictureFrames(id).then((f) => { if (alive) setFrames(f ?? []); });
    return () => { alive = false; stage.current?.showPictureFrame(id, 0); };
  }, [id, stage]);

  // Stays under the picture as the view pans and zooms.
  useEffect(() => {
    let raf = 0;
    const place = () => {
      const box = stage.current?.clientBox(id);
      const host = frame.current?.getBoundingClientRect();
      if (box && host) {
        const w = bar.current?.offsetWidth ?? 420;
        const h = bar.current?.offsetHeight ?? 80;
        const left = Math.max(8, Math.min(host.width - w - 8, box.left - host.left + box.width / 2 - w / 2));
        // Below the picture if it fits, else above it, else along the bottom of the board.
        const below = box.top - host.top + box.height + 10;
        const above = box.top - host.top - h - 10;
        const top = below + h <= host.height - 8 ? below : above >= 8 ? above : host.height - h - 8;
        setAt((p) => (p && Math.abs(p.left - left) < 0.5 && Math.abs(p.top - top) < 0.5 ? p : { left, top }));
      }
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [id, stage, frame]);

  const count = frames?.length ?? 0;
  const go = (i: number) => {
    const next = Math.max(0, Math.min(count - 1, i));
    setIndex(next);
    stage.current?.showPictureFrame(id, next);
  };

  const add = (kind: 'go' | 'until') => {
    const n = index + 1;
    const action: Raw = kind === 'go' ? { do: 'play', target: id, goto: n, ...(fade ? { fade: true } : {}) } : { do: 'play', target: id, until: n };
    const title = kind === 'go' ? `Frame ${n}` : `Play to frame ${n}`;
    update(updateBeats(doc, sceneIndex, (list) => (into < 0 || !list[into]
      ? [...list, { title, actions: [action] } as (typeof list)[number]]
      : list.map((b, i) => (i === into ? { ...b, actions: [...b.actions, action] } : b)))));
    setNote(into < 0 ? `Added as beat ${beats.length + 1}` : `Added to beat ${into + 1}`);
    setTimeout(() => setNote(null), 1800);
  };

  if (!frames || count < 2) {
    return frames && at ? <div className="frame-stepper" ref={bar} style={at}><span className="muted">This recording has a single picture: nothing to step through.</span></div> : null;
  }

  return (
    <div className="frame-stepper" ref={bar} style={at ?? { visibility: 'hidden' }} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="row">
        <button onClick={() => go(index - 1)} disabled={index === 0} title="Previous frame">◀</button>
        <span className="which" title={`Starts ${frames[index].toFixed(2)} s into the recording`}>frame <b>{index + 1}</b> / {count}</span>
        <button onClick={() => go(index + 1)} disabled={index === count - 1} title="Next frame">▶</button>
        <input type="range" min={0} max={count - 1} value={index} onChange={(e) => go(Number(e.target.value))} title="Drag through the frames" />
      </div>
      <div className="row">
        <button className="primary" onClick={() => add('go')} title="A play action that jumps to this frame and stays there">Go to frame {index + 1}</button>
        <label className="check" title="Cross-fade from what was showing to this frame"><input type="checkbox" checked={fade} onChange={(e) => setFade(e.target.checked)} /> fade</label>
        <button onClick={() => add('until')} title="A play action that plays on from where it is and stops on this frame">Play to frame {index + 1}</button>
        <select value={into} onChange={(e) => setInto(Number(e.target.value))} title="Which beat gets the action">
          <option value={-1}>in a new beat</option>
          {beats.map((b, i) => <option key={i} value={i}>in beat {i + 1}{b.title ? `: ${b.title}` : ''}</option>)}
        </select>
        {note && <span className="note">{note} ✓</span>}
      </div>
    </div>
  );
}
