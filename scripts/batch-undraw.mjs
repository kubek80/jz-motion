#!/usr/bin/env node
// Batch-fetch a shortlist of UnDraw illustrations into library/iso-tiles/<filename>.svg.
// Each entry is [searchQuery, exactTitle, filename]. Reuses one Chromium session for the whole run.
//
// Usage:   node scripts/batch-undraw.mjs
// Add/remove tiles by editing the BATCH array below.

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

// [searchQuery, exactTitle, filename]
// Pass over titles missed in wave 3 — UnDraw often uses Title Case the first attempt missed,
// and a few alternates/replacements for gaps in the topic coverage.
const BATCH = [
  // Retries with likely capitalisation
  ['coworking', 'Co-working', 'coworking'],
  ['setup wizard', 'Setup Wizard', 'setup-wizard'],
  ['data center', 'Data Center', 'data-center'],
  ['network', 'Online Connection', 'online-connection'],
  ['hard drive', 'Hard Drive', 'hard-drive'],
  ['system update', 'System Update', 'system-update'],
  ['server status', 'Server Status', 'server-status'],
  ['browsing online', 'Browsing Online', 'browsing-online'],
  ['progressive app', 'Progressive App', 'progressive-app'],
  ['landing page', 'Landing Page', 'landing-page'],
  ['video call', 'Group Video', 'group-video'],
  ['video editor', 'Video Editor', 'video-editor'],
  ['watch video', 'Watching Movies', 'watching-movies'],
  ['chatbot', 'ChatBot', 'chatbot'],
  ['machine learning', 'Machine Learning', 'machine-learning'],
  ['neural network', 'Neural Network', 'neural-network'],
  // Topic gap-fills
  ['mobile app', 'Mobile App', 'mobile-app'],
  ['website builder', 'Website Builder', 'website-builder'],
  ['web search', 'Web Search', 'web-search'],
  ['web developer', 'Web Developer', 'web-developer'],
  ['social growth', 'Social Growth', 'social-growth'],
  ['connected world', 'Connected World', 'connected-world'],
  ['cloud files', 'Cloud Files', 'cloud-files'],
  ['remote design', 'Remote Design Team', 'remote-design-team'],
];

const outDir = resolve('library', 'undraw');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();

const results = [];
try {
  for (const [query, title, filename] of BATCH) {
    const out = resolve(outDir, `${filename}.svg`);
    try {
      console.log(`→ ${title}…`);
      await page.goto('https://undraw.co/search', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      const search = page.locator('input[placeholder*="Search"]');
      await search.waitFor({ timeout: 8000 });
      await search.fill(query);
      await page.waitForTimeout(300);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1200);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForTimeout(400);
      await page.evaluate(() => window.scrollBy(0, 400));
      await page.waitForTimeout(400);

      const clicked = await page.evaluate((want) => {
        const all = [...document.querySelectorAll('*')];
        const exact = all.find((el) => !el.children.length && (el.textContent || '').trim() === want);
        if (!exact) return false;
        const card = exact.closest('a, button, [role="button"], div[class*="card"]') ?? exact.parentElement;
        card?.scrollIntoView({ block: 'center' });
        (card ?? exact).click();
        return true;
      }, title);
      if (!clicked) throw new Error(`card titled "${title}" not found`);
      await page.waitForTimeout(1200);

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
        page.getByText(/Download SVG/i).first().click({ timeout: 5000 }).catch(() => undefined),
      ]);
      if (!download) throw new Error('download event not received');
      const path = await download.path();
      const text = await readFile(path, 'utf8');
      await writeFile(out, text);
      results.push({ title, filename, bytes: text.length, status: 'ok' });
      // Close modal via its X button (Escape doesn't work reliably).
      await page.locator('button[aria-label*="Close" i], button:has-text("×"), button:has-text("✕")').first()
        .click({ timeout: 2000 }).catch(async () => {
          await page.mouse.click(10, 10).catch(() => undefined);
        });
      await page.waitForTimeout(500);
    } catch (e) {
      results.push({ title, filename, status: 'fail', error: e.message });
      await page.keyboard.press('Escape').catch(() => undefined);
    }
  }
} finally {
  await browser.close();
}

console.log('\n=== results ===');
for (const r of results) {
  console.log(r.status === 'ok' ? `✓ ${r.filename}.svg (${(r.bytes / 1024).toFixed(1)} KB)` : `✗ ${r.filename}: ${r.error}`);
}
const ok = results.filter((r) => r.status === 'ok').length;
console.log(`\n${ok}/${results.length} succeeded`);
