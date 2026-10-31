// A stand-in for an OpenAI-compatible model, to try generation without an API key.
// `npm run mock-llm`, then add the "Local mock" model in the AI tab.
// It answers with one of the bundled examples, picked by words in the request.
// Put "#broken" in the request to get a first answer with a mistake, to see the repair step.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const example = (name) => JSON.parse(readFileSync(new URL(`../src/examples/${name}.json`, import.meta.url), 'utf8'));
const pick = (text) => (/gpu|hardware|mac|spark/i.test(text) ? 'hardware' : /lab|openai|anthropic|model/i.test(text) ? 'ai-labs' : /3d|iso|datacenter/i.test(text) ? 'iso-3d' : 'intro');

const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) {
    res.writeHead(404).end();
    return;
  }
  let raw = '';
  for await (const c of req) raw += c;
  const { messages } = JSON.parse(raw);
  const first = messages.find((m) => m.role === 'user').content;
  const repairing = messages.length > 2;
  const doc = example(pick(first));
  if (first.includes('#broken') && !repairing) doc.scenes[0].elements.find((e) => e.type === 'icon').icon = 'not-an-icon';
  await new Promise((r) => setTimeout(r, 400));
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
    choices: [{ message: { role: 'assistant', content: `Here you go:\n\`\`\`json\n${JSON.stringify(doc, null, 2)}\n\`\`\`` } }],
    usage: { prompt_tokens: Math.round(JSON.stringify(messages).length / 4), completion_tokens: Math.round(JSON.stringify(doc).length / 4) },
  }));
});
const port = Number(process.env.PORT ?? 5199);
server.listen(port, () => console.log(`mock model on http://localhost:${port}/v1`));
