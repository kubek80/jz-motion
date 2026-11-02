import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, relative } from 'node:path';
import { CLAUDE_BIN } from './claudeCode';
import { PRESENTATIONS_DIR } from './presentations';

// Agent mode for "Claude Code (my subscription)": instead of one request for JSON, Claude Code works in this
// repository like it does in a terminal or Claude Desktop: it uses the project's skills, reads the docs and
// examples, writes a draft file, checks it and looks at snapshots. Every step streams to the app as it happens
// (one JSON object per line), and the session can be continued in a terminal with `claude --resume <id>`.

export const DRAFTS_DIR = join(PRESENTATIONS_DIR, '.drafts');

/** What the agent may do: read anything in the project, write files, use skills, run the two check commands. */
const TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Skill', 'Bash(npm run check:*)', 'Bash(npm run snapshot:*)'];

export type AgentEvent =
  | { e: 'start'; session: string; cwd: string; file: string }
  | { e: 'step'; tool: string; text: string }
  | { e: 'note'; text: string }
  | { e: 'problem'; text: string }
  | { e: 'done'; reply: string; session?: string; turns?: number; ms: number; cost?: number; presentation?: string; changed: boolean }
  | { e: 'error'; text: string };

interface Body { model: string; prompt: string; draftId: string; draft?: string; resume?: string }

const short = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** One line for a tool call, in plain words. */
export function describeTool(name: string, input: Record<string, unknown>, cwd: string): string {
  const path = typeof input.file_path === 'string' ? relative(cwd, String(input.file_path)) || String(input.file_path) : '';
  switch (name) {
    case 'Read': return /\.(png|jpe?g|webp)$/i.test(path) ? `Looking at ${path}` : `Reading ${path}`;
    case 'Write': return `Writing ${path}`;
    case 'Edit': case 'MultiEdit': return `Editing ${path}`;
    case 'Bash': return `Running ${short(String(input.command ?? '').split('\n')[0], 100)}`;
    case 'Glob': return `Finding files ${String(input.pattern ?? '')}`;
    case 'Grep': return `Searching for "${short(String(input.pattern ?? ''), 60)}"`;
    case 'Skill': return `Using the ${String(input.skill ?? input.name ?? input.command ?? '')} skill`;
    case 'TodoWrite': return 'Planning the steps';
    default: return name;
  }
}

export async function runAgent(_req: IncomingMessage, res: ServerResponse, body: Body) {
  if (!/^[\w-]+$/.test(body.draftId)) throw new Error('bad draft id');
  const cwd = process.cwd();
  const file = join(DRAFTS_DIR, `${body.draftId}.json`);
  await mkdir(DRAFTS_DIR, { recursive: true });
  if (body.draft !== undefined) await writeFile(file, body.draft);
  else if (!body.resume) await rm(file, { force: true });
  const before = body.draft;

  res.statusCode = 200;
  res.setHeader('content-type', 'application/x-ndjson');
  res.setHeader('cache-control', 'no-cache');
  const send = (ev: AgentEvent) => res.write(`${JSON.stringify(ev)}\n`);

  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', body.model || 'sonnet', '--allowedTools', ...TOOLS];
  if (body.resume) args.push('--resume', body.resume);
  const started = Date.now();
  const child = spawn(CLAUDE_BIN, args, { cwd, env: process.env });
  child.stdin.end(body.prompt);
  // The person closed the window or pressed Stop.
  res.on('close', () => { if (child.exitCode === null) child.kill('SIGTERM'); });

  let buf = '';
  let stderr = '';
  let result: Record<string, unknown> | null = null;
  child.stdout.on('data', (d) => {
    buf += d;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let m: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      try { m = JSON.parse(line); } catch { continue; }
      if (m.type === 'system' && m.subtype === 'init') send({ e: 'start', session: m.session_id, cwd, file: relative(cwd, file) });
      else if (m.type === 'assistant') {
        for (const c of m.message?.content ?? []) {
          if (c.type === 'tool_use') send({ e: 'step', tool: c.name, text: describeTool(c.name, c.input ?? {}, cwd) });
          else if (c.type === 'text' && c.text?.trim()) send({ e: 'note', text: c.text.trim() });
        }
      } else if (m.type === 'user') {
        for (const c of m.message?.content ?? []) {
          if (c.type === 'tool_result' && c.is_error) send({ e: 'problem', text: short(typeof c.content === 'string' ? c.content : JSON.stringify(c.content), 300) });
        }
      } else if (m.type === 'result') result = m;
    }
  });
  child.stderr.on('data', (d) => (stderr += d));

  await new Promise<void>((done) => {
    child.on('error', (e) => {
      send({ e: 'error', text: (e as NodeJS.ErrnoException).code === 'ENOENT' ? `the "${CLAUDE_BIN}" command was not found: install Claude Code and log in` : e.message });
      done();
    });
    child.on('close', async () => {
      if (result && !result.is_error) {
        const text = await readFile(file, 'utf8').catch(() => undefined);
        send({
          e: 'done', reply: String(result.result ?? ''), session: String(result.session_id ?? ''), turns: Number(result.num_turns ?? 0),
          ms: Date.now() - started, cost: typeof result.total_cost_usd === 'number' ? result.total_cost_usd : undefined,
          presentation: text, changed: text !== undefined && text !== before,
        });
      } else {
        send({ e: 'error', text: short(String(result?.result ?? (stderr.trim() || 'Claude Code stopped without an answer')), 400) });
      }
      done();
    });
  });
  res.end();
}

