import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// "Claude Code (my subscription)": answers chat requests with the `claude` command installed and logged in on
// this computer (claude -p), so a personal, local copy of the app can use a Claude subscription instead of an
// API key. It only works where the local server runs, for the person logged in there; it is not an API for
// anyone else. Tools are switched off: the model only writes text.

export const CLAUDE_BIN = process.env.JZM_CLAUDE_PATH ?? 'claude';
const TIMEOUT_MS = 5 * 60_000;

interface Message { role: 'system' | 'user' | 'assistant'; content: string }

function run(args: string[], input: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // Run outside the project, so no project CLAUDE.md or skills shape the answer.
    const child = spawn(CLAUDE_BIN, args, { cwd: tmpdir(), env: process.env });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), TIMEOUT_MS);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject((e as NodeJS.ErrnoException).code === 'ENOENT'
        ? new Error(`the "${CLAUDE_BIN}" command was not found: install Claude Code and log in (or set JZM_CLAUDE_PATH)`)
        : e);
    });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr }); });
    child.stdin.end(input);
  });
}

/** The conversation as one prompt: earlier turns as a transcript, then the message to answer. */
export function flatten(messages: Message[]): { system: string; prompt: string } {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const turns = messages.filter((m) => m.role !== 'system');
  const last = turns.at(-1);
  if (!last || last.role !== 'user') throw new Error('the conversation must end with a user message');
  if (turns.length === 1) return { system, prompt: last.content };
  const earlier = turns.slice(0, -1).map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`).join('\n\n');
  return { system, prompt: `The conversation so far:\n\n${earlier}\n\nNow reply to this message, as the assistant:\n\n${last.content}` };
}

/** Answers like an OpenAI chat completion, so the app treats it as any other model. */
export async function claudeCodeChat(model: string, messages: Message[]) {
  const { system, prompt } = flatten(messages);
  const dir = await mkdtemp(join(tmpdir(), 'jzm-claude-'));
  try {
    const systemFile = join(dir, 'system.md');
    await writeFile(systemFile, system || 'You are a helpful assistant.');
    const base = ['-p', '--output-format', 'json', '--model', model || 'sonnet', '--no-session-persistence'];
    let r = await run([...base, '--system-prompt-file', systemFile, '--tools', '', '--safe-mode'], prompt);
    // Older Claude Code versions lack some of these options: fall back to the basics.
    if (r.code !== 0 && /unknown option|unrecognized/i.test(r.stderr)) {
      r = await run([...base, '--disallowedTools', 'Bash', 'Edit', 'Write', 'Read', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task'], `${system}\n\n---\n\n${prompt}`);
    }
    const out = (() => { try { return JSON.parse(r.stdout); } catch { return null; } })();
    if (!out || out.is_error || r.code !== 0) {
      const why = out?.result ?? (r.stderr.trim() || r.stdout.trim()).slice(0, 400);
      throw new Error(`claude: ${why || `exited with code ${r.code}`}${/log ?in|auth/i.test(why) ? ' (run `claude` once in a terminal to log in)' : ''}`);
    }
    const usage = out.usage ?? {};
    return {
      choices: [{ message: { role: 'assistant', content: String(out.result ?? '') } }],
      usage: {
        prompt_tokens: (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
        completion_tokens: usage.output_tokens ?? 0,
      },
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Whether the command is there (for Settings). */
export async function claudeCodeStatus(): Promise<{ available: boolean; version?: string; error?: string }> {
  try {
    const r = await run(['--version'], '');
    return r.code === 0 ? { available: true, version: r.stdout.trim() } : { available: false, error: r.stderr.trim() };
  } catch (e) {
    return { available: false, error: (e as Error).message };
  }
}
