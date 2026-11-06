import { useCallback, useEffect, useState } from 'react';

// The media library on the local server (media/): pictures, screen recordings and sounds, converted on import.
// Presentations refer to them as "/media/<file>". See server/mediaStore.ts.

export type MediaKind = 'picture' | 'recording' | 'sound' | 'drawing';
export interface MediaUse { id: string; title: string }

export interface MediaEntry {
  file: string;
  src: string;
  name: string;
  kind: MediaKind;
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
  poster?: string;
  original?: { name: string; bytes: number };
  added: string;
}

export type MediaItem = MediaEntry & { usedBy: MediaUse[] };

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body as T;
}

/** Adds a file to the library. The server converts it (WebP, WebM, Opus) and returns what it kept. */
export async function addMedia(file: Blob, filename: string, name?: string, trim?: { start?: number; end?: number }): Promise<MediaEntry> {
  const q = new URLSearchParams({ filename, ...(name ? { name } : {}) });
  if (trim?.start) q.set('start', trim.start.toFixed(2));
  if (trim?.end) q.set('end', trim.end.toFixed(2));
  return json(await fetch(`/api/media?${q}`, { method: 'POST', body: file }));
}

export async function renameMedia(file: string, name: string): Promise<MediaEntry> {
  return json(await fetch(`/api/media/${file}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }));
}

/** Deletes a file. Without `force`, a file presentations use is kept and they are returned. */
export async function deleteMedia(file: string, force = false): Promise<{ ok: true } | { ok: false; usedBy: MediaUse[] }> {
  const res = await fetch(`/api/media/${file}${force ? '?force=1' : ''}`, { method: 'DELETE' });
  if (res.status === 409) return res.json();
  return json(res);
}

/** The library's contents, newest first, with where each is used. `available` is false without the local server. */
export function useMediaList(outside = 0) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [totalBytes, setTotal] = useState(0);
  const [available, setAvailable] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch('/api/media')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then((d: { items: MediaItem[]; totalBytes: number }) => { if (alive) { setItems(d.items); setTotal(d.totalBytes); setAvailable(true); } })
      .catch(() => alive && setAvailable(false));
    return () => { alive = false; };
  }, [version, outside]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { items, totalBytes, available, reload };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0)} MB`;
}

export function formatDuration(s = 0): string {
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

export const KIND_LABEL: Record<MediaKind, string> = { picture: 'Picture', recording: 'Recording', sound: 'Sound', drawing: 'Drawing' };

/** "1440×900" for pictures, "12.0 s" for recordings and sounds. */
export function measure(e: MediaEntry): string {
  if (e.kind === 'recording' || e.kind === 'sound') return formatDuration(e.duration);
  return e.width ? `${e.width}×${e.height}` : '';
}

/** The kind of file it was made from: "APNG", "PNG", "MP3". */
export const originalType = (name: string) => {
  const ext = name.split('.').pop()?.toUpperCase() ?? '';
  return ext === 'PNG' || ext === 'APNG' ? ext : ext === 'JPEG' ? 'JPG' : ext;
};
