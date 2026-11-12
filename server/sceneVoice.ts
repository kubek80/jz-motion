import { splitSentences } from '../src/app/tts';
import { compile } from '../src/engine/compile';
import { cueClicks } from '../src/video/performance';
import { freeLane, makeRoom, type TimelineClip } from '../src/video/makeRoom';
import { access } from 'node:fs/promises';
import { readAvatars } from './avatar';
import { registerLibrary } from './library';
import { uploadPath } from './transcribe';
import { joinVoice, type Voicer } from './voiceJoin';

// A scene's generated narration on the timeline: one clip per scene, bound to it (`scene`), its beats cued where
// their sentences start; in a presentation with a cast (a podcast), one clip per turn (beats in a row with the same
// speaker), each in its speaker's voice (their avatar's, voice/my-avatar.json) and tagged with them (`speaker`).
// Shared by `npm run voice` (place, again, rebuild), the Script page and Timing (POST /api/voice/scene).
// Everything here changes the presentation in memory; the caller saves it.

const SCENE_TAIL = 0.9;

export type VoiceDoc = {
  cast?: { id: string; name: string; avatar: string }[];
  scenes: { id: string; title?: string; skip?: boolean; beats: { title?: string; notes?: string; cue?: number; auto?: boolean }[] }[];
  voiceover?: { clips: (TimelineClip & { scene?: string; speaker?: string; name?: string; avatar?: unknown; gain?: number; cleanedFrom?: string; sourceDuration?: number })[] };
};

/** The voice `speaker` speaks with: their avatar's (the Avatar window), with the key and options of `base`; else `base`. */
export async function voicerFor(doc: VoiceDoc, speaker: string | undefined, base: Voicer): Promise<Voicer> {
  const member = doc.cast?.find((c) => c.id === speaker);
  if (!member) return base;
  const avatar = (await readAvatars())?.avatars.find((a) => a.id === member.avatar);
  if (!avatar) throw new Error(`${member.name}'s avatar ("${member.avatar}") isn't in the Avatar window: choose another for them in the cast`);
  if (!avatar.voice) throw new Error(`${member.name}'s avatar has no voice yet: record or upload one in 🧑 Avatar → Voice`);
  const v = avatar.voice;
  return { ...base, baseURL: v.baseURL, model: v.model, instructions: v.instructions, sample: v.sample };
}
export type SceneVoice = NonNullable<Awaited<ReturnType<typeof voiceScene>>>;

export function compiled(d: VoiceDoc) {
  const r = compile(d);
  if (!r.ok) throw new Error(`The presentation has errors:\n${r.errors.slice(0, 5).join('\n')}`);
  return r.presentation;
}

/**
 * A scene's narration: one clip per turn (all of it when one person speaks), in uploads/: its sentences with short
 * pauses, longer where a beat's animation (with the wordless auto beats after it) outlasts its words; turns one after
 * another. `pieces`: each clip, where it starts in the scene and who speaks; `cues`: where each beat starts;
 * `duration`: to the end of the last clip; `length`: how much timeline the scene takes, its tail included. Null
 * when it has no notes.
 */
export async function voiceScene(doc: VoiceDoc, presentationId: string, si: number, voicer: Voicer) {
  const scene = doc.scenes[si];
  const c = compiled(doc).scenes[si];
  const anim = c.beats.map((b) => b.end - b.start);
  const turns: { speaker?: string; parts: { notes?: string; need: number }[]; beats: number[] }[] = [];
  for (const [bi, b] of scene.beats.entries()) {
    const words = splitSentences(b.notes ?? '').length;
    if (!words && b.auto) continue;
    // The time this beat needs on screen: its animation and that of the wordless auto beats right after it.
    let need = anim[bi];
    for (let k = bi + 1; k < scene.beats.length && scene.beats[k].auto && !splitSentences(scene.beats[k].notes ?? '').length; k++) need += anim[k];
    const speaker = words ? c.beats[bi].speaker : turns.at(-1)?.speaker ?? c.beats[bi].speaker;
    if (!turns.length || turns.at(-1)!.speaker !== speaker) turns.push({ speaker, parts: [], beats: [] });
    turns.at(-1)!.parts.push({ notes: b.notes, need });
    turns.at(-1)!.beats.push(bi);
  }
  const pieces: { upload: string; duration: number; at: number; speaker?: string }[] = [];
  const cues: [number, number][] = [];
  let at = 0;
  for (const [k, turn] of turns.entries()) {
    // A new file every time: another presentation (or a copy of this one) may still play one by the same name.
    const upload = await freeName(`generated-${scene.id}${turns.length > 1 ? `-${k + 1}${turn.speaker ? `-${turn.speaker}` : ''}` : ''}`);
    const r = await joinVoice(presentationId, upload, turn.parts, await voicerFor(doc, turn.speaker, voicer));
    if (!r) continue;
    turn.beats.forEach((bi, j) => cues.push([bi, at + r.starts[j]]));
    pieces.push({ upload: r.upload, duration: r.duration, at: Math.round(at * 1000) / 1000, speaker: turn.speaker });
    // The next turn starts after this one's words and pause, and never before its file ends.
    at += Math.max(r.length, r.duration + 0.05);
  }
  if (!pieces.length) return null;
  const duration = pieces.at(-1)!.at + pieces.at(-1)!.duration;
  return { pieces, duration, lead: 0, cues, length: Math.round(Math.max(at + SCENE_TAIL, duration + 0.4) * 1000) / 1000 };
}

/** `<base>.webm` in uploads/, or `<base>-<time>.webm` when that is taken. */
async function freeName(base: string): Promise<string> {
  const taken = await access(uploadPath(`${base}.webm`)).then(() => true, () => false);
  return taken ? `${base}-${Date.now().toString(36)}.webm` : `${base}.webm`;
}

/** Put a scene's clips on the timeline from `at`, bound to the scene (and each to its speaker), and cue its beats. */
export function putClip(doc: VoiceDoc, si: number, at: number, v: SceneVoice) {
  const scene = doc.scenes[si];
  doc.voiceover ??= { clips: [] };
  const clips = doc.voiceover.clips;
  for (const [k, p] of v.pieces.entries()) {
    const from = Math.round((at + v.lead + p.at) * 1000) / 1000;
    const base = `gen-${scene.id}${k ? `-${k + 1}` : ''}`;
    const id = clips.some((c) => c.id === base) ? `${base}-${Date.now().toString(36)}` : base;
    const who = doc.cast?.find((c) => c.id === p.speaker)?.name;
    clips.push({ id, scene: scene.id, ...(p.speaker ? { speaker: p.speaker } : {}), upload: p.upload, sourceDuration: p.duration, offset: from, lane: freeLane(clips, from, from + p.duration) ?? 0, trimStart: 0, trimEnd: p.duration, name: `generated voice · ${scene.title ?? scene.id}${who ? ` · ${who}` : ''}` });
  }
  clips.sort((a, b) => a.offset - b.offset || a.lane - b.lane);
  for (const [bi, off] of v.cues) scene.beats[bi].cue = Math.round((at + off) * 100) / 100;
}

/**
 * place: a scene that isn't timed yet (no cues) gets its narration where it plays (where the next timed scene starts);
 * everything after moves on by its length. `others`: scenes also being placed, left out meanwhile.
 */
export async function placeScene(doc: VoiceDoc, presentationId: string, si: number, voicer: Voicer, others: number[] = []): Promise<string> {
  const scene = doc.scenes[si];
  if (!doc.voiceover?.clips.length) throw new Error('This presentation has no voice-over yet: record it in Timing first, or use rebuild.');
  if (scene.beats.some((b) => b.cue !== undefined)) throw new Error(`scene "${scene.id}" is already timed (it has cues)`);
  const placing = [si, ...others];
  // Where it plays: where the next timed scene starts, with this and the other unplaced scenes left out meanwhile.
  const trial: VoiceDoc = { ...doc, scenes: doc.scenes.map((s, j) => (placing.includes(j) && (j <= si || !s.beats.some((b) => b.cue !== undefined)) ? { ...s, skip: true } : s)) };
  const clicks = cueClicks(compiled(trial));
  const next = clicks.find((c) => c.scene > si);
  const end = Math.max(...doc.voiceover.clips.map((c) => c.offset + c.trimEnd - c.trimStart), ...clicks.map((c) => c.t + c.until - c.from));
  // Where the next timed scene starts: its first cue, or its own clip when that starts earlier (so it isn't cut).
  const nextClip = next ? doc.voiceover.clips.filter((c) => c.scene === doc.scenes[next.scene].id).map((c) => c.offset) : [];
  const at = next ? Math.min(next.t, ...nextClip) : end + 1;
  const v = await voiceScene(doc, presentationId, si, voicer);
  if (!v) return `${scene.title ?? scene.id}: no speaker notes, nothing to place`;
  makeRoom(doc, at, v.length, scene.id);
  putClip(doc, si, at, v);
  delete scene.skip;
  return `${scene.title ?? scene.id}: ${v.duration.toFixed(1)} s of generated voice at ${at.toFixed(1)} s; everything after moves ${v.length.toFixed(1)} s later`;
}

/**
 * again: a scene's narration said again from its notes, as one new clip in place of the scene's clips (one, or the
 * pieces it was cut into); what follows moves by the difference in length. `avatar`: its avatar said the old words.
 */
export async function sayAgain(doc: VoiceDoc, presentationId: string, si: number, voicer: Voicer): Promise<{ note: string; avatar: boolean }> {
  const scene = doc.scenes[si];
  const clips = doc.voiceover?.clips ?? [];
  const own = clips.filter((c) => c.scene === scene.id);
  if (!own.length) throw new Error(`scene "${scene.id}" has no clip of its own: place it first`);
  const start = Math.min(...own.map((c) => c.offset));
  const oldEnd = Math.max(...own.map((c) => c.offset + c.trimEnd - c.trimStart));
  const v = await voiceScene(doc, presentationId, si, voicer);
  if (!v) return { note: `${scene.title ?? scene.id}: no speaker notes, left as it was`, avatar: false };
  const delta = Math.round((v.duration - (oldEnd - start)) * 1000) / 1000;
  for (const x of clips) if (!own.includes(x) && x.offset >= oldEnd - 1e-3) x.offset = Math.round((x.offset + delta) * 1000) / 1000;
  // Studio shots: the scene's no longer match its words (made again from the new ones); later ones move on.
  const vo = doc.voiceover as { studio?: { offset: number; scene?: string }[] };
  if (vo.studio) {
    vo.studio = vo.studio.filter((s) => s.scene !== scene.id);
    for (const s of vo.studio) if (s.offset >= oldEnd - 1e-3) s.offset = Math.round((s.offset + delta) * 1000) / 1000;
  }
  for (const [sj, s] of doc.scenes.entries()) if (sj !== si) for (const b of s.beats) if (b.cue !== undefined && b.cue >= oldEnd - 0.05) b.cue = Math.round((b.cue + delta) * 100) / 100;
  for (const b of scene.beats) delete b.cue;
  const avatar = own.some((c) => c.avatar);
  // The scene's clips give way to the new ones (one per turn), from where the first started.
  doc.voiceover!.clips = clips.filter((x) => !own.includes(x));
  putClip(doc, si, start, v);
  return { note: `${scene.title ?? scene.id}: ${v.duration.toFixed(1)} s (${delta >= 0 ? '+' : ''}${delta.toFixed(1)} s); everything after moves by that`, avatar };
}

/** How many cues come out of order (a cue earlier than the beat before it): 0 when the timeline is sound. */
export const cuesOutOfOrder = (doc: VoiceDoc) => cueClicks(compiled(doc)).filter((c) => !c.cued && doc.scenes[c.scene].beats[c.beat].cue !== undefined).length;

/** POST /api/voice/scene: { presentation, presentationId, scene, ...voicer } → { presentation, note, avatar }, the scene generated (again). */
export async function sceneVoiceRequest(body: { presentation: VoiceDoc; presentationId: string; scene: string } & Voicer) {
  const { presentation, presentationId, scene, ...voicer } = body;
  if (!/^[\w-]+$/.test(presentationId ?? '')) throw new Error('bad presentation id');
  // Icons and models made in the app are checked like built-in ones.
  await registerLibrary();
  const doc: VoiceDoc = structuredClone(presentation);
  const si = doc.scenes.findIndex((s) => s.id === scene);
  if (si < 0) throw new Error(`no scene "${scene}"`);
  const has = doc.voiceover?.clips.some((c) => c.scene === scene);
  let r: { note: string; avatar: boolean };
  if (has) r = await sayAgain(doc, presentationId, si, voicer);
  else if (doc.voiceover?.clips.length) r = { note: await placeScene(doc, presentationId, si, voicer), avatar: false };
  else {
    // No voice-over yet: this scene's clip starts it.
    const v = await voiceScene(doc, presentationId, si, voicer);
    if (!v) throw new Error('This scene has no speaker notes to say');
    for (const b of doc.scenes[si].beats) delete b.cue;
    putClip(doc, si, 0, v);
    r = { note: `${doc.scenes[si].title ?? scene}: ${v.duration.toFixed(1)} s of generated voice`, avatar: false };
  }
  const late = cuesOutOfOrder(doc);
  return { presentation: doc, note: late ? `${r.note}. ⚠ ${late} cues come out of order: check them in Timing` : r.note, avatar: r.avatar };
}
