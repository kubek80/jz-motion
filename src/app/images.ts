// Pictures put on the board: stored in the local server's media library (media/, converted), or kept inside the presentation as a
// data: URL when there is no server (the app opened as static files).

export interface PlacedImage { src: string; width: number; height: number }

const EXT: Record<string, string> = { 'image/png': 'png', 'image/apng': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };

export const isImageFile = (f: File | null | undefined): f is File => !!f && f.type in EXT;

async function naturalSize(blob: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth || 800, height: img.naturalHeight || 600 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

/** Puts a picture into the media library (converted: screenshots become WebP, animated pictures WebM video).
 *  Without the media library, falls back to images/, and without any server to a data: URL. */
export async function uploadImage(file: File): Promise<PlacedImage> {
  try {
    const name = file.name || `pasted.${EXT[file.type]}`;
    const res = await fetch(`/api/media?filename=${encodeURIComponent(name)}`, { method: 'POST', body: file });
    if (res.ok) {
      const entry = (await res.json()) as { src: string; width?: number; height?: number };
      return { src: entry.src, ...(entry.width && entry.height ? { width: entry.width, height: entry.height } : await naturalSize(file)) };
    }
    if (res.status !== 404 && res.status !== 405) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  } catch (e) {
    if (!(e instanceof TypeError)) throw e;
  }
  return uploadToImages(file);
}

/** The older store: images/ on the local server, or a data: URL when there is no server. */
async function uploadToImages(file: File): Promise<PlacedImage> {
  const size = await naturalSize(file);
  try {
    const res = await fetch(`/api/images?ext=${EXT[file.type]}`, { method: 'POST', body: file });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
    return { src: (await res.json()).src, ...size };
  } catch (e) {
    if (e instanceof TypeError || /404|Not Found/.test(String(e))) return { src: await dataUrl(file), ...size };
    throw e;
  }
}

/** The first picture in a paste or a drop, if any. */
export function imageFrom(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const f of Array.from(data.files)) if (isImageFile(f)) return f;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file' && item.type in EXT) return item.getAsFile();
  }
  return null;
}

const FRAME_KEY = 'jzm.imageFrame';
/** The frame chosen last time, used for the next picture. */
export function lastFrame(): 'none' | 'browser' | 'window' {
  try { const f = localStorage.getItem(FRAME_KEY); return f === 'browser' || f === 'window' ? f : 'none'; } catch { return 'none'; }
}
export function rememberFrame(frame: unknown) {
  try { localStorage.setItem(FRAME_KEY, frame === 'browser' || frame === 'window' ? frame : 'none'); } catch { /* no storage */ }
}
