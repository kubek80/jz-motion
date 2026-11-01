// A stand-in for an OpenAI-compatible model, to try the AI features without an API key.
// `npm run mock-llm`, then add the "Local mock" model (and the "Local mock" transcription service).
// - Presentations: answers with one of the bundled examples, picked by words in the request.
//   Put "#broken" in a request to get a first answer with a mistake, to see the repair step.
// - Chat: replies {"reply", "presentation"}; with a transcript, beats get cues from it.
// - Icons and clipart: a simple drawing.
// - /audio/transcriptions: a fixed transcript.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const example = (name) => JSON.parse(readFileSync(new URL(`../src/examples/${name}.json`, import.meta.url), 'utf8'));
const pick = (text) => (/gpu|hardware|mac|spark/i.test(text) ? 'hardware' : /lab|openai|anthropic|model/i.test(text) ? 'ai-labs' : /3d|iso|datacenter/i.test(text) ? 'iso-3d' : 'intro');

const TRANSCRIPT = [
  [0.6, 'Where do large language models actually run?'],
  [4.2, 'You start with the model weights, a big file of numbers.'],
  [9.0, 'A gaming GPU is the fastest option, but its memory limits the model size.'],
  [15.5, 'A Mac Studio has lots of unified memory and stays quiet.'],
  [22.1, 'And the DGX Spark gives you 128 gigabytes of unified memory with CUDA.'],
  [29.4, "Let's zoom in on the Spark."],
  [34.0, 'So that is the overview of local hardware.'],
].map(([start, text], i, all) => ({ start, end: all[i + 1]?.[0] ?? 40, text }));

function answer(messages) {
  const system = messages[0]?.content ?? '';
  const last = messages.at(-1).content;
  const first = messages.find((m) => m.role === 'user').content;
  const repairing = messages.filter((m) => m.role === 'assistant').length > 0 && /does not load/.test(last);

  if (system.startsWith('Write ONE new scene')) {
    const scene = example('hardware').scenes[0];
    return { ...scene, title: 'Local hardware (AI)' };
  }
  if (system.startsWith('Build an isometric 3D model')) {
    return { description: 'A GPU server', tags: ['hardware'], parts: [
      { shape: 'box', size: [3.2, 0.3, 2], at: [0, 0, 0] },
      ...[-1.1, -0.37, 0.37, 1.1].map((x) => ({ shape: 'box', size: [0.4, 1.4, 1.6], at: [x, 0.3, 0], color: 'green' })),
      { shape: 'cylinder', size: [1, 0.25, 1], at: [0, 1.7, 0], color: 'pink' }] };
  }
  if (/Change only scene (\d+)/.test(last)) {
    // Edit the current presentation: rename the scene and add a beat to it.
    const n = Number(last.match(/Change only scene (\d+)/)[1]) - 1;
    const current = JSON.parse(last.slice(last.indexOf('\n') + 1, last.indexOf('\n\n')));
    current.scenes[n].beats.push({ title: 'Added by AI', actions: [{ do: 'wait', duration: 1 }] });
    return { reply: `Added a beat to scene ${n + 1}.`, presentation: current };
  }
  if (system.startsWith('Draw a single-colour line icon')) {
    return { description: 'A vector database: a cylinder with linked dots', tags: ['data', 'ai'], paths: [
      'M5 6a7 2.5 0 1 0 14 0a7 2.5 0 1 0 -14 0', 'M5 6v12a7 2.5 0 0 0 14 0v-12', 'M9 12l3 2l3 -3', 'M9 12h.01', 'M12 14h.01', 'M15 11h.01'] };
  }
  if (system.startsWith('Draw a multi-colour illustration')) {
    return { description: 'A robot holding a GPU', tags: ['ai', 'hardware'], box: [200, 160], parts: [
      { d: 'M60 30h60a10 10 0 0 1 10 10v40a10 10 0 0 1 -10 10h-60a10 10 0 0 1 -10 -10v-40a10 10 0 0 1 10 -10z', color: 'cyan', width: 4, fill: 'board' },
      { d: 'M90 30v-14', color: 'cyan', width: 4 }, { d: 'M75 55h.01', color: 'pink', width: 8 }, { d: 'M105 55h.01', color: 'pink', width: 8 },
      { d: 'M72 72q18 10 36 0', color: 'cyan', width: 3 },
      { d: 'M120 100h60v30h-60z', color: 'green', width: 4, fill: 'green', fillOpacity: 0.15 },
      { d: 'M135 115m-8 0a8 8 0 1 0 16 0a8 8 0 1 0 -16 0', color: 'green', width: 3 },
      { d: 'M165 115m-8 0a8 8 0 1 0 16 0a8 8 0 1 0 -16 0', color: 'green', width: 3 },
      { d: 'M130 90l-10 -10', color: 'cyan', width: 4 }] };
  }
  // The request is the last paragraph of the last message (earlier ones may hold the current presentation).
  const doc = example(pick(last.split('\n\n').pop()));
  if (first.includes('#broken') && !repairing) doc.scenes[0].elements.find((e) => e.type === 'icon').icon = 'not-an-icon';
  if (/Transcript:/.test(first)) {
    // Give each beat a cue from the transcript, in order.
    doc.scenes[0].beats.forEach((b, i) => { b.cue = TRANSCRIPT[Math.min(i + 1, TRANSCRIPT.length - 1)].start; b.notes = TRANSCRIPT[Math.min(i + 1, TRANSCRIPT.length - 1)].text; });
  }
  if (system.includes('{"reply"')) {
    const isQuestion = /\?\s*$/.test(last) && !/make|add|change|turn/i.test(last);
    return { reply: isQuestion ? 'It has the scenes and beats shown on the left.' : `Done: ${doc.title}, ${doc.scenes.length} scene(s).`, presentation: isQuestion ? null : doc };
  }
  return doc;
}

const server = createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  if (req.method === 'POST' && req.url.endsWith('/audio/transcriptions')) {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ text: TRANSCRIPT.map((s) => s.text).join(' '), segments: TRANSCRIPT, duration: 40 }));
    return;
  }
  if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) {
    res.writeHead(404).end();
    return;
  }
  const { messages } = JSON.parse(raw);
  const reply = answer(messages);
  await new Promise((r) => setTimeout(r, 400));
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
    choices: [{ message: { role: 'assistant', content: `Here you go:\n\`\`\`json\n${JSON.stringify(reply, null, 2)}\n\`\`\`` } }],
    usage: { prompt_tokens: Math.round(JSON.stringify(messages).length / 4), completion_tokens: Math.round(JSON.stringify(reply).length / 4) },
  }));
});
const port = Number(process.env.PORT ?? 5199);
server.listen(port, () => console.log(`mock model on http://localhost:${port}/v1`));
