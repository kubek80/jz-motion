// A terminal session as timed output, for terminal.mjs to draw and film: either run from a list of steps (each
// command typed at a natural pace, then run for real in a pseudo-terminal, so colours and progress bars come out as
// in your own terminal) or read from an asciinema recording (.cast, v2). Either way it is a list of
// [seconds, text] events, kept as a .cast so it can be drawn again (another size, another font) without running
// anything.

import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Reads a steps file: JSON, or a .mjs whose default export is the same object. */
export async function readSteps(file) {
  const spec = file.endsWith('.mjs') ? (await import(pathToFileURL(resolve(file)).href)).default : JSON.parse(await readFile(file, 'utf8'));
  if (!spec || !Array.isArray(spec.steps)) throw new Error(`${file}: expected { "steps": [ … ] }`);
  return spec;
}

/** Reads an asciinema v2 recording: its size and its output events. */
export async function readCast(file) {
  const [head, ...lines] = (await readFile(file, 'utf8')).split('\n').filter((l) => l.trim());
  const h = JSON.parse(head);
  const events = lines.map((l) => JSON.parse(l)).filter((e) => e[1] === 'o').map((e) => [e[0], e[2]]);
  return { cols: h.width ?? 100, rows: h.height ?? 28, title: h.title, events };
}

export async function writeCast(file, { cols, rows, title }, events) {
  const head = JSON.stringify({ version: 2, width: cols, height: rows, ...(title ? { title } : {}) });
  await writeFile(file, `${head}\n${events.map(([t, d]) => JSON.stringify([Math.round(t * 1000) / 1000, 'o', d])).join('\n')}\n`);
}

const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/**
 * Runs `command` in a pseudo-terminal of `cols` × `rows` (the system's `script`, on macOS and Linux), calling
 * `onData(text)` as output arrives. Resolves with its exit code.
 */
function runInTerminal(command, { cwd, cols, rows, shell, env }) {
  const line = `stty cols ${cols} rows ${rows} 2>/dev/null; ${command}`;
  const args = process.platform === 'darwin' ? ['-q', '/dev/null', shell, '-c', line] : ['-qfec', `${shell} -c ${shq(line)}`, '/dev/null'];
  return (onData) => new Promise((done, fail) => {
    const p = spawn('script', args, { cwd, env: { ...process.env, TERM: 'xterm-256color', COLUMNS: String(cols), LINES: String(rows), FORCE_COLOR: '1', CLICOLOR_FORCE: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (b) => onData(b.toString('utf8')));
    p.stderr.on('data', (b) => onData(b.toString('utf8')));
    p.on('error', (e) => fail(new Error(`could not start a terminal (the system "script" command): ${e.message}`)));
    p.on('close', (code) => done(code ?? 0));
  });
}

/** A small repeatable random, so a session types the same way each time it is recorded. */
function jitter(seed = 7) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/**
 * Runs the steps and returns the session's events. Steps:
 *   "npm test"                          typed at the prompt, then run
 *   "# a comment"                       typed, not run (shown in grey)
 *   { "type": "…", "run": false, "output": "…" }   typed, with this output instead of running it
 *   { "type": "…", "maxPause": 4 }      a long wait in its output shortened to at most 4 s (default spec.maxPause, 1.5)
 *   { "keys": "…" }                     typed, no Enter
 *   { "pause": 1.2 }                    nothing for 1.2 s
 *   { "clear": true }                   a clear screen
 * Each command runs on its own in the session's folder (`cwd`); a typed `cd <dir>` moves that folder.
 */
export async function runSteps(spec, log = console.log) {
  const cols = spec.cols ?? 100;
  const rows = spec.rows ?? 28;
  let cwd = resolve(spec.cwd ?? '.');
  const shell = spec.shell ?? process.env.SHELL ?? '/bin/bash';
  const cps = spec.typing ?? 22; // characters a second
  const rand = jitter();
  const events = [];
  let t = 0.4;
  const out = (text, at = t) => events.push([at, text]);
  const prompt = () => (spec.prompt ?? '\x1b[38;5;114m➜\x1b[0m  \x1b[1;38;5;117m{dir}\x1b[0m ').replace('{dir}', basename(cwd));
  const type = (text) => {
    for (const ch of text) { out(ch); t += (1 / cps) * (0.55 + rand() * 0.9) + (ch === ' ' ? 0.03 : 0); }
  };

  for (const raw of spec.steps) {
    const step = typeof raw === 'string' ? (raw.startsWith('#') ? { type: raw, run: false, comment: true } : { type: raw }) : raw;
    if (step.pause !== undefined) { t += step.pause; continue; }
    if (step.clear) { out('\x1b[2J\x1b[3J\x1b[H'); t += 0.2; continue; }
    if (step.keys !== undefined) { type(step.keys); continue; }
    if (step.type === undefined) throw new Error(`a step needs "type", "keys", "pause" or "clear": ${JSON.stringify(raw)}`);
    out(prompt());
    t += 0.5;
    if (step.comment) { out('\x1b[38;5;244m'); type(step.type); out('\x1b[0m'); } else type(step.type);
    t += 0.25;
    out('\r\n');
    t += 0.15;
    const cd = /^cd\s+(.+)$/.exec(step.type.trim());
    if (cd && step.run !== false) { cwd = resolve(cwd, cd[1].replace(/^~(?=\/|$)/, process.env.HOME ?? '~')); t += 0.2; continue; }
    if (step.run === false) {
      if (step.output) { out(step.output.replace(/\r?\n/g, '\r\n') + (step.output.endsWith('\n') ? '' : '\r\n')); t += 0.3; }
      t += 0.4;
      continue;
    }
    log(`  $ ${step.type}`);
    const maxPause = step.maxPause ?? spec.maxPause ?? 1.5;
    const start = Date.now();
    let last = 0; // seconds into the command of the output before
    let shown = t; // where that output went in the session
    const code = await runInTerminal(step.type, { cwd, cols, rows, shell, env: spec.env })((text) => {
      const at = (Date.now() - start) / 1000;
      shown += Math.min(at - last, maxPause);
      last = at;
      // macOS's `script` writes "^D" and two backspaces when its input closes.
      out(text.replace(/\^D\x08\x08/g, ''), shown);
    });
    t = shown + 0.35;
    if (code !== 0) log(`    (exit ${code})`);
  }
  out(prompt());
  t += 1.6;
  return { cols, rows, title: spec.title, events, length: t };
}
