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
//
// `again` says a scene's notes again (after they changed) as a new clip in place of the scene's clip; everything
// after it moves by the difference in length.
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { splitSentences } from '../src/app/tts';
import { registerLibrary } from './library';
import { readMyVoice } from './myVoice';
import { compiled as compileDoc, cuesOutOfOrder, placeScene, putClip, sayAgain, voiceScene, type VoiceDoc } from './sceneVoice';
import { generateTts } from './tts';
import { SENTENCE_GAP } from './voiceJoin';

const args = process.argv.slice(2);
const value = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const [cmd, file] = args;
if (!['time', 'place', 'rebuild', 'again'].includes(cmd) || !file) {
  console.error('usage: npm run voice -- time <presentation.json> [--scenes id,id]\n       npm run voice -- place <presentation.json> --scenes id,id\n       npm run voice -- rebuild <presentation.json>\n       npm run voice -- again <presentation.json> --scenes id,id');
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

const path = resolve(file);
const presentationId = basename(path).replace(/\.json$/, '');
const doc: VoiceDoc = JSON.parse(await readFile(path, 'utf8'));
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

function compiled(d: VoiceDoc) {
  try { return compileDoc(d); } catch (e) { console.error((e as Error).message); process.exit(1); }
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
  for (const si of [...targets].reverse()) console.log(await placeScene(doc, presentationId, si, voicer, targets.filter((j) => j !== si)));
  await finish();
} else if (cmd === 'again') {
  // again: a scene's narration said again from its notes (they changed), in place of its clip; what follows moves by
  // the difference in length, as Generate again in the app does.
  if (!wanted?.length) { console.error('again needs --scenes id,id'); process.exit(2); }
  for (const id of wanted) {
    const si = doc.scenes.findIndex((s) => s.id === id);
    const r = await sayAgain(doc, presentationId, si, voicer);
    console.log(r.note);
    if (r.avatar) console.log(`${id}: its avatar said the old words: make it again (npm run avatar -- make … --scenes ${id})`);
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
    const v = await voiceScene(doc, presentationId, si, voicer);
    if (!v) { console.log(`${scene.title ?? scene.id}: no speaker notes, left without voice`); continue; }
    putClip(doc, si, at, v);
    console.log(`${String(si + 1).padStart(2)}. ${(scene.title ?? scene.id).padEnd(40)} ${v.duration.toFixed(1).padStart(5)} s of voice at ${at.toFixed(1)} s`);
    at = Math.round((at + v.length) * 1000) / 1000;
  }
  await finish();
}

async function finish() {
  const ignored = cuesOutOfOrder(doc);
  await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(ignored ? `⚠ ${ignored} cues come out of order: check it in Timing` : '✓ every cue in order');
}
