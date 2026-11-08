// npm run voice -- time  <presentation.json> [--scenes id,id]   how long each beat's words take vs. its animation
// npm run voice -- place <presentation.json> --scenes id,id      put those scenes' generated narration on the timeline
//
// Speech comes from any OpenAI-compatible /audio/speech service, one clip per sentence (the prompter's lines), kept in
// tts/<presentation>/ so a sentence is only paid for once. Pick the service with environment variables:
//   OPENROUTER_API_KEY            OpenRouter, Voxtral (mistralai/voxtral-mini-tts-2603, voice en_paul_neutral)
//   OPENAI_API_KEY                OpenAI (gpt-4o-mini-tts, voice alloy)
//   TTS_BASE_URL, TTS_MODEL, TTS_VOICE, TTS_API_KEY   anything else (or to override the above)
//   TTS_INSTRUCTIONS             how to speak, for models that take a style ("calm, clear narrator")
//   (none of these)               your own voice when voice/my-voice.json exists (My voice in the app saves it);
//                                TTS_MY_VOICE=0 to use another voice
//   TTS_SAMPLE                   your voice for a cloning model (TTS_MODEL=fish-audio/s2.1-pro): a recording in
//                                uploads/, optionally with the part to use: generated-x.webm or rec-1.webm@12-40
//
// `place` is for scenes added to a presentation that is already timed to a voice-over (a new scene, or a second
// version of one): for each scene it joins the scene's sentences into one clip (uploads/generated-<scene id>.webm),
// opens a gap on the timeline where the scene plays (the start of the next timed scene), puts the clip there, cues the
// scene's beats where their sentences start, and moves every later clip and cue on by the gap, so the rest keeps
// its timing. A recording that runs across the gap is split there.
//
// `rebuild` replaces the whole voice-over with generated narration, one clip per playing scene, laid out one after
// another from the start, each bound to its scene and its beats cued where their sentences start. Where a beat's
// animation outlasts its words, the pause after them grows to fit. Scenes left out lose their cues.
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { splitSentences } from '../src/app/tts';
import { compile } from '../src/engine/compile';
import { cueClicks } from '../src/video/performance';
import { freeLane, makeRoom, type TimelineClip } from '../src/video/makeRoom';
import { registerLibrary } from './library';
import { FFMPEG, probe, run } from './media';
import { readMyVoice } from './myVoice';
import { generateTts } from './tts';

const args = process.argv.slice(2);
const value = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const [cmd, file] = args;
if (!['time', 'place', 'rebuild'].includes(cmd) || !file) {
  console.error('usage: npm run voice -- time <presentation.json> [--scenes id,id]\n       npm run voice -- place <presentation.json> --scenes id,id\n       npm run voice -- rebuild <presentation.json>');
  process.exit(2);
}

const env = process.env;
// The person's own voice, kept with the project (voice/my-voice.json), unless a model or sample is named here.
const mine = !env.TTS_MODEL && !env.TTS_SAMPLE && env.TTS_MY_VOICE !== '0' ? await readMyVoice() : null;
const voicer = {
  baseURL: env.TTS_BASE_URL ?? mine?.baseURL ?? (env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1'),
  model: env.TTS_MODEL ?? mine?.model ?? (env.OPENROUTER_API_KEY ? 'mistralai/voxtral-mini-tts-2603' : 'gpt-4o-mini-tts'),
  voice: env.TTS_VOICE ?? (env.OPENROUTER_API_KEY ? 'en_paul_neutral' : 'alloy'),
  apiKey: env.TTS_API_KEY ?? env.OPENROUTER_API_KEY ?? env.OPENAI_API_KEY,
  instructions: env.TTS_INSTRUCTIONS ?? mine?.instructions,
  sample: mine?.sample ?? (() => {
    const m = /^(?:uploads\/)?([^@]+?)(?:@([\d.]+)-([\d.]+))?$/.exec(env.TTS_SAMPLE ?? '');
    return m ? { upload: m[1], start: Number(m[2] ?? 0), end: Number(m[3] ?? 30) } : undefined;
  })(),
};
if (mine) console.log(`In your voice: ${mine.sample.name ?? mine.sample.upload} (${mine.model}; voice/my-voice.json, TTS_MY_VOICE=0 for another voice)`);
if (!voicer.apiKey) {
  console.error('No speech service: set OPENROUTER_API_KEY (or OPENAI_API_KEY, or TTS_BASE_URL/TTS_MODEL/TTS_VOICE/TTS_API_KEY).');
  process.exit(2);
}

const SENTENCE_GAP = 0.25;
const BEAT_GAP = 0.6;
const SCENE_TAIL = 0.9;

type Doc = { scenes: { id: string; title?: string; skip?: boolean; beats: { title?: string; notes?: string; cue?: number; auto?: boolean }[] }[]; voiceover?: { clips: (TimelineClip & { scene?: string })[] } };
const path = resolve(file);
const presentationId = basename(path).replace(/\.json$/, '');
const doc: Doc = JSON.parse(await readFile(path, 'utf8'));
await registerLibrary();
const wanted = value('scenes')?.split(',').map((s) => s.trim()).filter(Boolean);
const missing = wanted?.filter((id) => !doc.scenes.some((s) => s.id === id));
if (missing?.length) { console.error(`no scene with id ${missing.join(', ')}`); process.exit(2); }

/** Each sentence of a beat, generated (or from the cache): its audio file and length. */
async function speak(notes: string | undefined) {
  const out: { audio: string; duration: number }[] = [];
  for (const text of splitSentences(notes ?? '')) {
    const r = await generateTts({ presentationId, text, ...voicer });
    out.push({ audio: join('tts', presentationId, r.audio), duration: r.duration });
  }
  return out;
}

function compiled(d: Doc) {
  const r = compile(d);
  if (!r.ok) { console.error(r.errors.slice(0, 5).join('\n')); process.exit(1); }
  return r.presentation;
}

if (cmd === 'time') {
  const p = compiled(doc);
  for (const [si, s] of p.scenes.entries()) {
    const raw = doc.scenes[si];
    if (wanted && !wanted.includes(raw.id)) continue;
    let anim = 0, words = 0;
    console.log(`\n${si + 1}. ${raw.title ?? raw.id}`);
    for (const [bi, b] of s.beats.entries()) {
      const lines = await speak(raw.beats[bi].notes);
      const w = lines.reduce((sum, l) => sum + l.duration + SENTENCE_GAP, 0);
      const a = b.end - b.start;
      anim += a; words += w;
      console.log(`  ${String(bi + 1).padStart(2)} ${(raw.beats[bi].title ?? '').padEnd(28)} animation ${a.toFixed(1).padStart(5)} s   words ${w.toFixed(1).padStart(5)} s${a > w + 0.5 && w > 0 ? '   ← the animation outlasts the words' : ''}`);
    }
    console.log(`  scene: animation ${anim.toFixed(1)} s, words ${words.toFixed(1)} s`);
  }
} else if (cmd === 'place') {
  if (!wanted?.length) { console.error('place needs --scenes id,id'); process.exit(2); }
  if (!doc.voiceover?.clips.length) { console.error('This presentation has no voice-over yet: record it in Timing first, or use rebuild.'); process.exit(2); }
  const targets = doc.scenes.map((s, i) => (wanted.includes(s.id) ? i : -1)).filter((i) => i >= 0);
  for (const i of targets) if (doc.scenes[i].beats.some((b) => b.cue !== undefined)) { console.error(`scene "${doc.scenes[i].id}" is already timed (it has cues): nothing placed`); process.exit(2); }
  // From the last scene to the first, so the times of those still to place don't move under them.
  for (const si of [...targets].reverse()) {
    const scene = doc.scenes[si];
    // Where it plays: where the next timed scene starts, with this and the other unplaced scenes left out meanwhile.
    const trial: Doc = { ...doc, scenes: doc.scenes.map((s, j) => (targets.includes(j) && (j <= si || !s.beats.some((b) => b.cue !== undefined)) ? { ...s, skip: true } : s)) };
    const clicks = cueClicks(compiled(trial));
    const next = clicks.find((c) => c.scene > si);
    const end = Math.max(...doc.voiceover.clips.map((c) => c.offset + c.trimEnd - c.trimStart), ...clicks.map((c) => c.t + c.until - c.from));
    const at = next ? next.t : end + 1;
    const v = await voiceScene(si);
    if (!v) { console.log(`${scene.title ?? scene.id}: no speaker notes, nothing to place`); continue; }
    makeRoom(doc, at, v.length, scene.id);
    putClip(si, at, v);
    delete scene.skip;
    console.log(`${scene.title ?? scene.id}: ${v.duration.toFixed(1)} s of generated voice at ${at.toFixed(1)} s; everything after moves ${v.length.toFixed(1)} s later`);
  }
  await finish();
} else {
  // rebuild: every playing scene (or --scenes) gets one new clip, laid out one after another from 0; all other clips go.
  const keep = (doc.voiceover?.clips ?? []).filter((c) => wanted && c.scene && !wanted.includes(c.scene));
  if (wanted && keep.length) { console.error('rebuild with --scenes needs every other scene to keep its clips: use place for single scenes'); process.exit(2); }
  doc.voiceover = { ...(doc.voiceover ?? {}), clips: [] };
  let at = 0;
  for (const [si, scene] of doc.scenes.entries()) {
    // Scenes left out lose their old cues: they no longer match the timeline; putting one back makes room for it.
    for (const b of scene.beats) delete b.cue;
    if (scene.skip || (wanted && !wanted.includes(scene.id))) continue;
    const v = await voiceScene(si);
    if (!v) { console.log(`${scene.title ?? scene.id}: no speaker notes, left without voice`); continue; }
    putClip(si, at, v);
    console.log(`${String(si + 1).padStart(2)}. ${(scene.title ?? scene.id).padEnd(40)} ${v.duration.toFixed(1).padStart(5)} s of voice at ${at.toFixed(1)} s`);
    at = Math.round((at + v.length) * 1000) / 1000;
  }
  await finish();
}

/**
 * A scene's narration as one clip (uploads/generated-<scene id>.webm): its sentences with short pauses, longer where
 * a beat's animation (with the wordless auto beats after it) outlasts its words. `cues`: where each beat starts in it;
 * `length`: how much timeline the scene takes, its tail included.
 */
async function voiceScene(si: number) {
  const scene = doc.scenes[si];
  const anim = compiled(doc).scenes[si].beats.map((b) => b.end - b.start);
  const parts: { audio: string; gap: number }[] = [];
  const cues: [number, number][] = [];
  let t = 0, lead = 0;
  for (const [bi, b] of scene.beats.entries()) {
    const lines = await speak(b.notes);
    if (!lines.length && b.auto) continue;
    cues.push([bi, t]);
    // The time this beat needs on screen: its animation and that of the wordless auto beats right after it.
    let need = anim[bi];
    for (let k = bi + 1; k < scene.beats.length && scene.beats[k].auto && !splitSentences(scene.beats[k].notes ?? '').length; k++) need += anim[k];
    const start = t;
    lines.forEach((l, k) => { const gap = k < lines.length - 1 ? SENTENCE_GAP : BEAT_GAP; parts.push({ audio: l.audio, gap }); t += l.duration + gap; });
    const extra = Math.max(0, start + need + 0.3 - t);
    if (extra) { if (parts.length) parts[parts.length - 1].gap += extra; else lead += extra; t += extra; }
  }
  if (!parts.length) return null;
  const upload = `generated-${scene.id}.webm`;
  const inputs = parts.flatMap((p) => ['-i', p.audio]);
  const pads = parts.map((p, k) => `[${k}:a]aresample=48000,aformat=channel_layouts=mono,apad=pad_dur=${p.gap.toFixed(3)}[p${k}]`);
  const joined = `${parts.map((_, k) => `[p${k}]`).join('')}concat=n=${parts.length}:v=0:a=1[out]`;
  await run(FFMPEG, ['-y', '-v', 'error', ...inputs, '-filter_complex', [...pads, joined].join(';'), '-map', '[out]', '-c:a', 'libopus', '-b:a', '64k', join('uploads', upload)]);
  const duration = (await probe(join('uploads', upload))).duration;
  // A wordless first beat: the clip starts after it.
  return { upload, duration, lead, cues, length: Math.round(Math.max(t + SCENE_TAIL, lead + duration + 0.4) * 1000) / 1000 };
}

/** Put a scene's clip on the timeline at `at`, bound to the scene, and cue its beats. */
function putClip(si: number, at: number, v: NonNullable<Awaited<ReturnType<typeof voiceScene>>>) {
  const scene = doc.scenes[si];
  const clips = doc.voiceover!.clips;
  const from = Math.round((at + v.lead) * 1000) / 1000;
  clips.push({ id: `gen-${scene.id}`, scene: scene.id, upload: v.upload, sourceDuration: v.duration, offset: from, lane: freeLane(clips, from, from + v.duration) ?? 0, trimStart: 0, trimEnd: v.duration, name: `generated voice · ${scene.title ?? scene.id}` });
  clips.sort((a, b) => a.offset - b.offset || a.lane - b.lane);
  for (const [bi, off] of v.cues) scene.beats[bi].cue = Math.round((at + off) * 100) / 100;
}

async function finish() {
  const ignored = cueClicks(compiled(doc)).filter((c) => !c.cued && doc.scenes[c.scene].beats[c.beat].cue !== undefined).length;
  await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(ignored ? `⚠ ${ignored} cues come out of order: check it in Timing` : '✓ every cue in order');
}
