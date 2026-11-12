#!/usr/bin/env node
// Record a terminal session and add it to the media library (as WebM video), for a presentation to play like any
// screen recording ("play", "goto", "until"; best in an image with "frame": "window").
//
//   npm run terminal -- <steps.json|steps.mjs> <name> [--cols N] [--rows N] [--font PX] [--scale S] [--fps N]
//   npm run terminal -- <session.cast> <name> [...]       an asciinema recording (asciinema rec session.cast)
//
// A steps file lists commands: each is typed at a natural pace and run for real in a pseudo-terminal in your shell
// (scripts/terminalSession.mjs), so its colours and progress bars come out as in your terminal. The session is
// kept as scratch/captures/<name>.cast (draw it again with other options without running anything), drawn by
// xterm.js in JetBrains Mono, filmed (scripts/screencast.mjs) and added to the media library; the /media/… src is
// printed. Example: scripts/terminal/example.json.

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { launchForRecording } from './capturePage.mjs';
import { importIntoMedia, screencast } from './screencast.mjs';
import { readCast, readSteps, runSteps, writeCast } from './terminalSession.mjs';

const args = process.argv.slice(2);
const posArgs = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const value = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const [input, name] = posArgs;
if (!input || !name || !/^[\w-]+$/.test(name)) {
  console.error('usage: npm run terminal -- <steps.json|steps.mjs|session.cast> <name> [--cols N] [--rows N] [--font PX] [--scale S] [--fps N]');
  process.exit(2);
}
await mkdir('scratch/captures', { recursive: true });

// The session: run from steps, or read from a recording.
let session;
if (input.endsWith('.cast')) {
  session = await readCast(input);
  session.length = (session.events.at(-1)?.[0] ?? 0) + 1.6;
} else {
  const spec = await readSteps(input);
  for (const k of ['cols', 'rows']) if (value(k)) spec[k] = Number(value(k));
  console.log(`running ${spec.steps.length} steps in ${resolve(spec.cwd ?? '.')}`);
  session = await runSteps(spec);
  await writeCast(`scratch/captures/${name}.cast`, session, session.events);
  console.log(`session kept as scratch/captures/${name}.cast (${session.length.toFixed(1)}s)`);
}
if (value('cols')) session.cols = Number(value('cols'));
if (value('rows')) session.rows = Number(value('rows'));

const require = createRequire(import.meta.url);
const xtermJs = await readFile(require.resolve('@xterm/xterm/lib/xterm.js'), 'utf8');
const xtermCss = await readFile(require.resolve('@xterm/xterm/css/xterm.css'), 'utf8');
const font = (await readFile(require.resolve('@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2'))).toString('base64');
const fontBold = (await readFile(require.resolve('@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2'))).toString('base64');
const fontSize = Number(value('font', 18));
const PAD = 22;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'JetBrains Mono'; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 400; }
@font-face { font-family: 'JetBrains Mono'; src: url(data:font/woff2;base64,${fontBold}) format('woff2'); font-weight: 700; }
${xtermCss}
html, body { margin: 0; background: #101114; overflow: hidden; }
#t { position: absolute; left: ${PAD}px; top: ${PAD * 0.7}px; }
.xterm-viewport { overflow: hidden !important; }
</style></head><body><div id="t"></div><script>${xtermJs}</script></body></html>`;

const browser = await (async () => {
  // Measured first at scale 1, then filmed at the capture's sharpness (default 2: Retina-like, sharp under zooms).
  const scale = Number(value('scale', 2));
  return { scale, ...(await launchForRecording(chromium, { w: 1600, h: 1000, zoom: 1, scale })) };
})();
let shot;
try {
  const { page } = browser;
  await page.setContent(html);
  await page.evaluate(() => document.fonts.load("18px 'JetBrains Mono'"));
  const size = await page.evaluate(({ cols, rows, fontSize }) => {
    // eslint-disable-next-line no-undef
    const term = new Terminal({
      cols, rows, fontSize, fontFamily: "'JetBrains Mono', Menlo, monospace", lineHeight: 1.15, cursorBlink: false, allowProposedApi: true, scrollback: 0,
      theme: {
        background: '#101114', foreground: '#e3e5e8', cursor: '#e3e5e8', cursorAccent: '#101114', selectionBackground: '#3a3d45',
        black: '#1b1d22', red: '#ff6b6b', green: '#7ee787', yellow: '#f2cc60', blue: '#79c0ff', magenta: '#d2a8ff', cyan: '#56d4dd', white: '#e3e5e8',
        brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#a6f0b0', brightYellow: '#f8e3a1', brightBlue: '#a5d6ff', brightMagenta: '#e2c5ff', brightCyan: '#87e8ee', brightWhite: '#ffffff',
      },
    });
    term.open(document.getElementById('t'));
    // Focused, so the cursor is the solid block a terminal shows while you type (unfocused, only an outline).
    term.focus();
    window.term = term;
    const r = document.querySelector('.xterm-screen').getBoundingClientRect();
    return { w: Math.ceil(r.width), h: Math.ceil(r.height) };
  }, { cols: session.cols, rows: session.rows, fontSize });
  const view = { width: size.w + PAD * 2, height: Math.round(size.h + PAD * 1.4) };
  await page.setViewportSize(view);
  browser.pixels = `${view.width * browser.scale}×${view.height * browser.scale}`;
  browser.ratio = view.height / view.width;
  await page.waitForTimeout(300);
  shot = await screencast(page, () => page.evaluate(({ events, length }) => new Promise((done) => {
    const t0 = performance.now();
    let i = 0;
    const tick = () => {
      const now = (performance.now() - t0) / 1000;
      let text = '';
      while (i < events.length && events[i][0] <= now) text += events[i++][1];
      if (text) window.term.write(text);
      if (now >= length) done(); else setTimeout(tick, 8);
    };
    tick();
  }), session), { name, fps: Number(value('fps', 24)) });
} finally {
  await browser.browser.close();
}
console.log(`filmed ${shot.frames} frames: scratch/captures/${name}.mkv (${shot.seconds.toFixed(1)}s, ${session.cols}×${session.rows} at ${fontSize}px, ${browser.pixels} pixels)`);
console.log(`in a scene: width 1200, height ${Math.round(1200 * browser.ratio)} (keeps its shape)`);
importIntoMedia(shot.file, name);
