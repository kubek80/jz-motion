import { useSyncExternalStore } from 'react';
import { loadFalKey } from '../settingsStore';

// Avatar videos being made (a few minutes each on fal.ai), by the clip they are for. Started from a clip's window, its
// Generate again, or right-clicking a clip in Timing; followed here, so the result lands on the clip whether or not
// its window is open (Timing takes it: onAvatarDone). Kept for the browser tab (sessionStorage), so a reload doesn't
// lose them.

export type AvatarResult = { video: string; trimStart: number; trimEnd: number };
export type AvatarJob = { id: string; note?: string; error?: string; result?: AvatarResult };

const KEY = 'jzm.avatarJobs';
let jobs: Record<string, AvatarJob> = (() => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? '{}'); } catch { return {}; } })();
const listeners = new Set<() => void>();
let handler: ((clipId: string, result: AvatarResult) => boolean) | null = null;
let timer = 0;

function set(next: Record<string, AvatarJob>) {
  jobs = next;
  try { sessionStorage.setItem(KEY, JSON.stringify(Object.fromEntries(Object.entries(jobs).filter(([, j]) => !j.error)))); } catch { /* fine */ }
  listeners.forEach((l) => l());
  if (Object.values(jobs).some((j) => !j.error) && !timer) timer = window.setTimeout(poll, 3000);
}

async function poll() {
  timer = 0;
  const next = { ...jobs };
  for (const [clipId, job] of Object.entries(jobs)) {
    if (job.error) continue;
    if (!job.result) {
      const s = await (await fetch(`/api/avatar/${job.id}`)).json().catch(() => ({ status: 'failed', error: 'the app’s server did not answer' }));
      if (s.status === 'running') { next[clipId] = { ...job, note: s.note }; continue; }
      if (s.status !== 'done') { next[clipId] = { ...job, error: s.error ?? 'the avatar failed' }; continue; }
      next[clipId] = { ...job, result: { video: s.result.video, trimStart: s.result.trimStart, trimEnd: s.result.trimEnd } };
    }
    // Done: the clip takes it (when Timing is open; otherwise it waits).
    if (next[clipId].result && handler?.(clipId, next[clipId].result!)) delete next[clipId];
  }
  set(next);
}

/** Start your avatar saying part of a clip's recording. */
export async function startAvatar(clipId: string, req: { upload: string; trimStart: number; trimEnd: number; name?: string }) {
  const res = await fetch('/api/avatar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...req, apiKey: loadFalKey() || undefined }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  const { id } = await res.json();
  set({ ...jobs, [clipId]: { id, note: 'sending to fal.ai' } });
}

/** Who takes finished avatars (Timing): returns true when the clip was there to take it. */
export function onAvatarDone(take: (clipId: string, result: AvatarResult) => boolean) {
  handler = take;
  set({ ...jobs });
  return () => { if (handler === take) handler = null; };
}

export const clearAvatarJob = (clipId: string) => { const next = { ...jobs }; delete next[clipId]; set(next); };

/** The jobs, by clip id, kept up to date. */
export function useAvatarJobs(): Record<string, AvatarJob> {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => jobs);
}
