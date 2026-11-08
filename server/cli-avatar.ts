// npm run avatar -- photo <picture> [--top 0.4]                    your avatar's photo (kept with the project)
// npm run avatar -- make <presentation.json> --scenes id,id [--layout camera|pip|pip-left]
//
// `make` gives each named scene's voice clip a talking-head video of your avatar saying it (Kling AI Avatar on
// fal.ai, about 6¢ a second, a few minutes each), named on the clip (`avatar`), and sets the scene's video layout
// when --layout is given, so the export shows you there. Needs FAL_KEY (in a Claude cloud session the proxy adds it:
// FAL_KEY=proxy-injected).
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AVATAR_PRICE, makeAvatar, readMyAvatar, saveAvatarPhoto } from './avatar';

const args = process.argv.slice(2);
const value = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const [cmd, file] = args;

if (cmd === 'photo' && file) {
  const saved = await saveAvatarPhoto(resolve(file), { top: value('top') !== undefined ? Number(value('top')) : undefined });
  console.log(`Avatar photo: uploads/${saved.photo} (voice/my-avatar.json)`);
} else if (cmd === 'make' && file) {
  const wanted = value('scenes')?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  const layout = value('layout');
  if (!wanted.length) { console.error('make needs --scenes id,id'); process.exit(2); }
  if (layout && !['camera', 'pip', 'pip-left'].includes(layout)) { console.error('--layout is camera, pip or pip-left'); process.exit(2); }
  if (!(await readMyAvatar())) { console.error('No avatar photo yet: npm run avatar -- photo <picture>'); process.exit(2); }
  const path = resolve(file);
  type Doc = { scenes: { id: string; title?: string; layout?: string }[]; voiceover?: { clips: { id: string; upload: string; trimStart: number; trimEnd: number; scene?: string; avatar?: unknown }[] } };
  const doc: Doc = JSON.parse(await readFile(path, 'utf8'));
  const missing = wanted.filter((id) => !doc.scenes.some((s) => s.id === id));
  if (missing.length) { console.error(`no scene with id ${missing.join(', ')}`); process.exit(2); }
  const clips = (doc.voiceover?.clips ?? []).filter((c) => c.scene && wanted.includes(c.scene));
  const seconds = clips.reduce((n, c) => n + c.trimEnd - c.trimStart, 0);
  console.log(`${clips.length} clips, ${seconds.toFixed(0)} s of avatar: about $${(seconds * AVATAR_PRICE).toFixed(2)}`);
  // All at once: fal.ai works on them side by side.
  const made = new Map<string, { video: string; trimStart: number; trimEnd: number }>();
  await Promise.all(clips.map(async (c) => {
    const a = await makeAvatar({ upload: c.upload, trimStart: c.trimStart, trimEnd: c.trimEnd, name: c.scene });
    made.set(c.id, { video: a.video, trimStart: a.trimStart, trimEnd: a.trimEnd });
    console.log(`${c.scene}: uploads/${a.video} (${a.duration.toFixed(1)} s)`);
  }));
  // The file as it is now (it may have changed in the minutes this took): only these clips and scenes change.
  const now: Doc = JSON.parse(await readFile(path, 'utf8'));
  for (const c of now.voiceover?.clips ?? []) { const a = made.get(c.id); if (a) c.avatar = a; }
  if (layout) for (const s of now.scenes) if (wanted.includes(s.id)) s.layout = layout;
  await writeFile(path, `${JSON.stringify(now, null, 2)}\n`);
} else {
  console.error('usage: npm run avatar -- photo <picture> [--top 0.4]\n       npm run avatar -- make <presentation.json> --scenes id,id [--layout camera|pip|pip-left]');
  process.exit(2);
}
