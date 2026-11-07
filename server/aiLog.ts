import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// A plain record of every AI request, to find out afterwards what went wrong: logs/ai.jsonl (not in git), one
// JSON object per line. The server writes what it sends and gets back (agent runs with their steps, one-request
// calls); the app adds what it did with the answer (applied, nothing changed, or rejected and why).

export const AI_LOG = resolve(process.env.JZM_LOGS_DIR ?? 'logs', 'ai.jsonl');
const clip = (s: unknown, n: number) => (typeof s === 'string' && s.length > n ? `${s.slice(0, n)}… (${s.length} characters)` : s);

export async function logAi(entry: Record<string, unknown>) {
  try {
    await mkdir(dirname(AI_LOG), { recursive: true });
    await appendFile(AI_LOG, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  } catch {
    // Logging must never break a request.
  }
}

/** Shortens long texts (a whole presentation in a prompt) so the log stays readable. */
export const shorten = (s: unknown, n = 4000) => clip(s, n);

/** The last `limit` entries, newest last. */
export async function readAiLog(limit = 20): Promise<unknown[]> {
  const text = await readFile(AI_LOG, 'utf8').catch(() => '');
  return text.trim().split('\n').filter(Boolean).slice(-limit).map((l) => { try { return JSON.parse(l); } catch { return { raw: l }; } });
}
