// Diagnostic ring buffer for tracking down the "edit reverted later" bug.
// Every write to the presentation (and every save round-trip) logs an entry. Open the devtools
// console after a revert and paste `copy(window.jzmLog.dump())` to share the trace.
//
// Nothing here changes behavior — it is a passive observer. Remove the whole file (and its two
// call sites in App.tsx and store.ts) once we've caught the culprit.

export interface LogEntry {
  t: number;
  dt: string;
  kind: string;
  info: Record<string, unknown>;
  stack?: string;
}

const BUF: LogEntry[] = [];
const MAX = 500;
const started = performance.now();

function callerStack(): string {
  const raw = new Error().stack ?? '';
  // Skip the first three frames: Error, callerStack itself, and the log() wrapper.
  return raw.split('\n').slice(3, 7).map((l) => l.trim()).join(' ← ');
}

export function log(kind: string, info: Record<string, unknown> = {}) {
  const now = performance.now();
  BUF.push({ t: now, dt: `+${((now - started) / 1000).toFixed(2)}s`, kind, info, stack: callerStack() });
  if (BUF.length > MAX) BUF.shift();
}

export function voiceoverSummary(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object') return { v };
  const o = v as Record<string, unknown>;
  const clips = Array.isArray(o.clips) ? (o.clips as Array<Record<string, unknown>>) : null;
  return {
    hasUpload: typeof o.upload === 'string',
    upload: o.upload,
    clipCount: clips?.length ?? 0,
    clips: clips?.map((c) => ({ id: c.id, upload: c.upload, offset: c.offset, lane: c.lane, trim: [c.trimStart, c.trimEnd] })) ?? null,
  };
}

/** How many beats carry a `cue` field, so we can see cue-clear events in the trace. */
export function cuedBeatCount(doc: unknown): number {
  const d = doc as { scenes?: Array<{ beats?: Array<{ cue?: unknown }> }> };
  let n = 0;
  for (const s of d.scenes ?? []) for (const b of s.beats ?? []) if (typeof b.cue === 'number') n++;
  return n;
}

if (typeof window !== 'undefined') {
  (window as unknown as { jzmLog: unknown }).jzmLog = {
    entries: BUF,
    dump: () => JSON.stringify(BUF, null, 2),
    clear: () => { BUF.length = 0; },
    tail: (n = 30) => BUF.slice(-n),
  };
}
