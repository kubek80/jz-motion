import { useEffect, useRef, useState } from 'react';
import type { Clip } from '../../engine/schema';
import type { Click } from '../../video/performance';

// Recording a voice clip again: a new take from the chosen microphone (→ marks where each next beat starts),
// listened to, then kept in place of the old one. A longer or shorter take moves everything after the clip by
// the difference; the beats inside it go where → was pressed, or are spread over the new length.

export type Take = { state: 'idle' } | { state: 'recording'; elapsed: number; marks: number[] } | { state: 'review'; blob: Blob; url: string; duration: number; marks: number[] };

export function useRerecord(stream: MediaStream | null) {
  const [take, setTake] = useState<Take>({ state: 'idle' });
  const rec = useRef<{ recorder: MediaRecorder; chunks: Blob[]; t0: number; marks: number[]; timer: number } | null>(null);
  const elapsed = () => (rec.current ? (performance.now() - rec.current.t0) / 1000 : 0);

  const start = () => {
    if (!stream || rec.current) return;
    const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? { mimeType: 'audio/webm;codecs=opus' } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.start(500);
    const r = { recorder, chunks, t0: performance.now(), marks: [] as number[], timer: 0 };
    r.timer = window.setInterval(() => setTake({ state: 'recording', elapsed: elapsed(), marks: [...r.marks] }), 100);
    rec.current = r;
    setTake({ state: 'recording', elapsed: 0, marks: [] });
  };
  const mark = () => { if (rec.current) rec.current.marks.push(Math.round(elapsed() * 100) / 100); };
  const unmark = () => { rec.current?.marks.pop(); };
  const stop = async () => {
    const r = rec.current;
    if (!r) return;
    const duration = elapsed();
    window.clearInterval(r.timer);
    rec.current = null;
    const done = new Promise<void>((resolve) => { r.recorder.onstop = () => resolve(); });
    r.recorder.stop();
    await done;
    const blob = new Blob(r.chunks, { type: r.recorder.mimeType || 'audio/webm' });
    setTake({ state: 'review', blob, url: URL.createObjectURL(blob), duration: Math.round(duration * 100) / 100, marks: r.marks });
  };
  const discard = () => setTake((t) => { if (t.state === 'review') URL.revokeObjectURL(t.url); return { state: 'idle' }; });
  useEffect(() => () => { if (rec.current) { window.clearInterval(rec.current.timer); rec.current.recorder.stop(); } }, []);
  return { take, start, mark, unmark, stop, discard };
}

/** The beats that start inside a clip (by their place on the timeline), in order. */
export function beatsIn(clip: Clip, clicks: Click[]): Click[] {
  const end = clip.offset + (clip.trimEnd - clip.trimStart);
  return clicks.filter((c) => c.t >= clip.offset - 0.05 && c.t < end - 0.05);
}

/**
 * The timeline after replacing `clips[index]` with a new take of `duration` seconds (file `upload`): later clips
 * and cues move by the difference; beats inside go to `marks` (seconds into the take, from the second beat on) or
 * are spread over the new length. `allCued`: every cue in the presentation (scenes left out too), to move later ones.
 */
export function replaceTake(clips: Clip[], index: number, upload: string, duration: number, marks: number[], clicks: Click[], allCued: { scene: number; beat: number; t: number }[] = clicks.filter((c) => c.cued)) {
  const old = clips[index];
  const oldLen = old.trimEnd - old.trimStart;
  const oldEnd = old.offset + oldLen;
  const delta = duration - oldLen;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const next: Clip[] = clips.map((c, i) => {
    if (i === index) return { id: `rec-${Date.now().toString(36)}`, upload, sourceDuration: duration, offset: old.offset, lane: old.lane, trimStart: 0, trimEnd: duration, name: `re-recorded · ${old.name ?? 'clip'}`, ...(old.scene ? { scene: old.scene } : {}) };
    return c.offset >= oldEnd - 1e-3 ? { ...c, offset: Math.max(0, r2(c.offset + delta)) } : c;
  });
  const inside = beatsIn(old, clicks).filter((c) => c.cued);
  // Fixed points (old time → new time): the clip's start, each beat placed with →, the clip's end. A beat
  // without a mark goes between the fixed points around it, in proportion, so the order is kept.
  const fixed: [number, number][] = [[old.offset, old.offset]];
  inside.forEach((c, k) => { if (k > 0 && marks[k - 1] !== undefined) fixed.push([c.t, old.offset + Math.min(marks[k - 1], duration)]); });
  fixed.push([oldEnd, old.offset + duration]);
  const place = (t: number) => {
    const i = Math.max(0, fixed.findIndex(([o], j) => j < fixed.length - 1 && t >= o && t <= fixed[j + 1][0]));
    const [o0, n0] = fixed[i];
    const [o1, n1] = fixed[i + 1] ?? fixed[i];
    return o1 > o0 ? n0 + ((t - o0) / (o1 - o0)) * (n1 - n0) : n0;
  };
  const cues: { scene: number; beat: number; cue: number }[] = [];
  inside.forEach((c, k) => {
    const at = k > 0 && marks[k - 1] !== undefined ? old.offset + Math.min(marks[k - 1], duration) : place(c.t);
    cues.push({ scene: c.scene, beat: c.beat, cue: r2(at) });
  });
  // Every cue after it moves, also those of scenes left out of the video (so they still fit if put back).
  const placed = new Set(cues.map((x) => `${x.scene}.${x.beat}`));
  for (const c of allCued) if (c.t >= oldEnd - 0.05 && !placed.has(`${c.scene}.${c.beat}`)) cues.push({ scene: c.scene, beat: c.beat, cue: r2(c.t + delta) });
  return { clips: next, cues, delta };
}
