import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';

// Screenshots and other pictures put on the board: images/<hash>.<ext>, next to presentations/ so they
// can be kept in git together. Named by content, so pasting the same picture twice stores it once.

export const IMAGES_DIR = resolve(process.env.JZM_IMAGES_DIR ?? 'images');

const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };
const MAX_BYTES = 25 * 1024 * 1024;

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BYTES) throw new Error('images up to 25 MB');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

/** Stores the request body as an image; returns the path the board uses for it (/images/<file>). */
export async function saveImage(req: IncomingMessage, ext: string): Promise<{ src: string }> {
  const e = ext.toLowerCase().replace(/^\./, '');
  if (!(e in TYPES)) throw new Error(`unsupported image type "${ext}" (png, jpg, webp, gif, svg)`);
  const body = await readBody(req);
  if (!body.length) throw new Error('empty image');
  const file = `${createHash('sha256').update(body).digest('hex').slice(0, 16)}.${e === 'jpeg' ? 'jpg' : e}`;
  await mkdir(IMAGES_DIR, { recursive: true });
  await writeFile(join(IMAGES_DIR, file), body);
  return { src: `/images/${file}` };
}

export async function serveImage(res: ServerResponse, file: string): Promise<boolean> {
  const m = /^[\w-]+\.(\w+)$/.exec(file);
  if (!m || !(m[1] in TYPES)) return false;
  const path = join(IMAGES_DIR, file);
  const info = await stat(path).catch(() => null);
  if (!info) return false;
  res.setHeader('content-type', TYPES[m[1]]);
  res.setHeader('content-length', String(info.size));
  res.setHeader('cache-control', 'public, max-age=31536000, immutable');
  createReadStream(path).pipe(res);
  return true;
}
