#!/usr/bin/env node
// The YouTube channel banner: a background at 2560×1440 (YouTube's size), the jz-motion logo and the tagline inside
// the strip every device shows (1546×423 in the middle; TVs show it all, desktops a 2560×423 band).
//
//   node scripts/youtube-banner.mjs [background.jpg]     (default brand/youtube-banner-background.jpg)
//
// Writes brand/youtube-banner.png (upload this) and brand/youtube-banner-guides.png (the phone strip in red, the
// desktop band in yellow). Change the tagline below and run it again: the background stays.
//
// The background was made on fal.ai (fal-ai/flux-pro/v1.1-ultra, 16:9, about 6¢), prompt: "A wide YouTube channel
// banner background. A dark charcoal chalkboard, softly lit, very subtle texture and smudges. On it, hand-drawn
// line art in glowing neon marker (cyan, hot pink, yellow and lime green, with a soft glow, like neon pens on a dark
// board): technical explainer doodles — a server rack, a database cylinder, a cloud, a laptop, a chat bubble, gears,
// an isometric stack of 3D blocks, a small bar chart, curly code brackets, connected nodes of a network graph,
// flowchart boxes joined by arrows, a lightbulb, sparkles. Composition: the doodles cluster toward the far left and
// far right edges and the corners, fading out; the whole central horizontal band (the middle 60% of the width and
// the middle third of the height) is calm, empty dark board, kept clear for a logo. Clean, crisp lines, sparse and
// elegant, not cluttered. Absolutely no text, no letters, no words, no numbers, no logos, no watermark."
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
const here = resolve('brand');
const repo = resolve('.');
const require = createRequire(join(repo, 'package.json'));
const b64 = (p) => readFileSync(p).toString('base64');
const caveat = b64(require.resolve('@fontsource/caveat/files/caveat-latin-700-normal.woff2'));
const mono = b64(require.resolve('@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2'));
const logo = readFileSync(join(repo, 'public/logo.svg'), 'utf8');
const bg = b64(resolve(process.argv[2] ?? 'brand/youtube-banner-background.jpg'));
const html = (guides) => `<!doctype html><html><head><style>
@font-face { font-family: Caveat; src: url(data:font/woff2;base64,${caveat}); font-weight: 700; }
@font-face { font-family: Mono; src: url(data:font/woff2;base64,${mono}); font-weight: 500; }
html, body { margin: 0; width: 2560px; height: 1440px; overflow: hidden; background: #0d1114; }
.bg { position: absolute; inset: 0; background: url(data:image/jpeg;base64,${bg}) center / cover; }
/* A soft dark pool behind the lettering, so it reads over any doodle. */
.pool { position: absolute; left: 50%; top: 50%; width: 1900px; height: 640px; transform: translate(-50%, -50%); background: radial-gradient(closest-side, rgba(10,13,16,0.85), rgba(10,13,16,0.55) 60%, transparent); }
.safe { position: absolute; left: 507px; top: 508px; width: 1546px; height: 424px; display: flex; align-items: center; justify-content: center; gap: 64px; }
.logo { height: 350px; }
.logo svg { height: 100%; width: auto; display: block; }
.words { display: flex; flex-direction: column; gap: 6px; }
.tag { font-family: Caveat; font-weight: 700; font-size: 112px; line-height: 0.95; color: #fff; text-shadow: 0 0 6px rgba(255,255,255,0.9), 0 0 22px rgba(62,240,255,0.55), 0 0 48px rgba(62,240,255,0.35); }
.tag .hi { color: #f2cc60; text-shadow: 0 0 6px rgba(242,204,96,0.9), 0 0 24px rgba(242,204,96,0.5); }
.sub { margin-top: 26px; font-family: Mono; font-weight: 500; font-size: 34px; letter-spacing: 0.08em; color: #7ee8f0; text-shadow: 0 0 14px rgba(62,240,255,0.5); }
.guide { position: absolute; border: 4px dashed #ff3b6b; }
</style></head><body>
<div class="bg"></div><div class="pool"></div>
<div class="safe"><div class="logo">${logo}</div><div class="words"><div class="tag">Technical explainers,</div><div class="tag">drawn <span class="hi">live</span></div><div class="sub">SOFTWARE · AI · SYSTEMS</div></div></div>
${guides ? '<div class="guide" style="left:507px;top:508px;width:1546px;height:424px"></div><div class="guide" style="left:0;top:509px;width:2552px;height:416px;border-color:#f2cc60"></div>' : ''}
</body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
for (const [guides, out] of [[false, 'youtube-banner.png'], [true, 'youtube-banner-guides.png']]) {
  await page.setContent(html(guides));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(here, out) });
}
await browser.close();
console.log('written brand/youtube-banner.png (and -guides.png)');
