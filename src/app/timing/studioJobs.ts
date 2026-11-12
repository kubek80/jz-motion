import { useSyncExternalStore } from 'react';
import { loadFalKey } from '../settingsStore';
import type { Piece } from '../../video/studioShots';

// Studio wide shots being made (several minutes each on fal.ai), by where they go on the timeline. Followed here so a
// finished shot lands in the presentation (Timing takes it: onStudioDone) whether or not the drawer is still open.
// Kept for the browser tab (sessionStorage), so a reload doesn't lose them.

export type StudioShot = { video: string; offset: number; length: number; scene?: string };
export type StudioJob = { id: string; at: number; scene?: string; note?: string; error?: string; result?: StudioShot };

const KEY = 'jzm.studioJobs';
let jobs: Record<string, StudioJob> = (() => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? '{}'); } catch { return {}; } })();
const listeners = new Set<() => void>();
let handler: ((shot: StudioShot) => boolean) | null = null;
let timer = 0;

function set(next: Record<string, StudioJob>) {
  jobs = next;
  try { sessionStorage.setItem(KEY, JSON.stringify(Object.fromEntries(Object.entries(jobs).filter(([, j]) => !j.error)))); } catch { /* fine */ }
  listeners.forEach((l) => l());
  if (Object.values(jobs).some((j) => !j.error) && !timer) timer = window.setTimeout(poll, 4000);
}

async function poll() {
  timer = 0;
  const next = { ...jobs };
  for (const [key, job] of Object.entries(jobs)) {
    if (job.error) continue;
    if (!job.result) {
      const s = await (await fetch(`/api/studio/shot/${job.id}`)).json().catch(() => ({ status: 'failed', error: 'the app’s server did not answer' }));
      if (s.status === 'running') { next[key] = { ...job, note: s.note }; continue; }
      if (s.status !== 'done') { next[key] = { ...job, error: s.error ?? 'the studio shot failed' }; continue; }
      next[key] = { ...job, result: { video: s.result.video, offset: job.at, length: s.result.length, ...(job.scene ? { scene: job.scene } : {}) } };
    }
    if (next[key].result && handler?.(next[key].result!)) delete next[key];
  }
  set(next);
}

const keyOf = (at: number) => `shot@${at.toFixed(2)}`;

/** Start a studio shot from `at` for `length` seconds on the timeline. */
export async function startStudioShot(req: { picture: string; resolution: '480p' | '720p'; at: number; length: number; scene?: string; pieces: Piece[] }) {
  const res = await fetch('/api/studio/shot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ picture: req.picture, resolution: req.resolution, length: req.length, pieces: req.pieces, name: req.scene, apiKey: loadFalKey() || undefined }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  const { id } = await res.json();
  set({ ...jobs, [keyOf(req.at)]: { id, at: req.at, scene: req.scene, note: 'getting the voices ready' } });
}

/** Who takes finished shots (Timing): returns true when it did. */
export function onStudioDone(take: (shot: StudioShot) => boolean) {
  handler = take;
  set({ ...jobs });
  return () => { if (handler === take) handler = null; };
}

export const clearStudioJob = (key: string) => { const next = { ...jobs }; delete next[key]; set(next); };

/** The jobs, by where they go, kept up to date. */
export function useStudioJobs(): Record<string, StudioJob> {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => jobs);
}
