// Pictures put on the board: stored by the local server (images/), or kept inside the presentation as a
// data: URL when there is no server (the app opened as static files).

export interface PlacedImage { src: string; width: number; height: number }

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };

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

export async function uploadImage(file: File): Promise<PlacedImage> {
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
export function lastFrame(): 'none' | 'browser' {
  try { return localStorage.getItem(FRAME_KEY) === 'browser' ? 'browser' : 'none'; } catch { return 'none'; }
}
export function rememberFrame(frame: unknown) {
  try { localStorage.setItem(FRAME_KEY, frame === 'browser' ? 'browser' : 'none'); } catch { /* no storage */ }
}
