import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { uploadPath } from './transcribe';

// Pictures drawn by an image model through OpenRouter (about 14¢ each): your avatar in a style (myAvatarRoutes.ts),
// the cast together in a studio (studio.ts).

const IMAGE_MODEL = 'google/gemini-3-pro-image';

/** An uploads/ picture as a data URI, for the image model. */
export async function pictureUri(file: string): Promise<string> {
  const ext = extname(file).slice(1).toLowerCase().replace('jpg', 'jpeg');
  return `data:image/${ext};base64,${(await readFile(uploadPath(file))).toString('base64')}`;
}

/** A 16:9 picture drawn from `text` and the `pictures` it refers to (data URIs), as PNG bytes. */
export async function drawPicture(text: string, pictures: string[], apiKey?: string): Promise<Buffer> {
  const key = apiKey || process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('No OpenRouter key: add it in Settings → Voice generation (OpenRouter), or as a model under Models.');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: IMAGE_MODEL, modalities: ['image', 'text'], image_config: { aspect_ratio: '16:9' }, messages: [{ role: 'user', content: [{ type: 'text', text }, ...pictures.map((url) => ({ type: 'image_url', image_url: { url } }))] }] }),
  });
  const j = await res.json().catch(() => ({}));
  const img: string | undefined = j?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  const m = img && /^data:image\/\w+;base64,(.*)$/.exec(img);
  if (!res.ok || !m) throw new Error(`The image model made no picture (${res.status}): ${JSON.stringify(j?.error ?? j).slice(0, 300)}`);
  return Buffer.from(m[1], 'base64');
}
