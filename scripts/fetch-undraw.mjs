// Fetch a single UnDraw illustration via headless Chrome and save as an SVG to library/iso-tiles/.
// Usage: node scripts/fetch-undraw.mjs <search-term> <name>
// Example: node scripts/fetch-undraw.mjs "programmer" programmer

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [,, query, name] = process.argv;
if (!query || !name) {
  console.error('usage: node scripts/fetch-undraw.mjs <search-term> <name>');
  process.exit(2);
}

const outDir = resolve('library', 'iso-tiles');
await mkdir(outDir, { recursive: true });
const out = resolve(outDir, `${name}.svg`);

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  // Go to the search page, then type the query and submit.
  await page.goto('https://undraw.co/search', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(800);

  // Fill the Algolia search box and submit.
  const search = page.locator('input[placeholder*="Search"]');
  await search.waitFor({ timeout: 8000 });
  await search.fill(query);
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(500);

  // Screenshot the search page for debugging.
  await page.screenshot({ path: resolve('scripts', 'undraw-search.png'), fullPage: false });

  // Scroll past the header/branding to the illustrations grid.
  await page.evaluate(() => window.scrollBy(0, 400));
  await page.waitForTimeout(600);

  // Scroll into the grid.
  await page.evaluate(() => window.scrollBy(0, 400));
  await page.waitForTimeout(600);

  // Click the card for the illustration. Each card has a title label; using exact text matches
  // avoids the full-page textContent trap. The 4th arg (defaults to the capitalised query) is the
  // exact card title. Fallback: try the capitalised form of the search term.
  const wantTitle = process.argv[4] ?? (query.charAt(0).toUpperCase() + query.slice(1));
  console.log('looking for card titled:', wantTitle);
  const clicked = await page.evaluate((want) => {
    // Find elements whose OWN textContent (excluding children) is exactly the title.
    const all = [...document.querySelectorAll('*')];
    const exact = all.find((el) => {
      if (el.children.length) return false;
      const t = (el.textContent || '').trim();
      return t === want;
    });
    if (!exact) return { found: false };
    const card = exact.closest('a, button, [role="button"], div[class*="card"]') ?? exact.parentElement;
    card?.scrollIntoView({ block: 'center' });
    (card ?? exact).click();
    return { found: true, rect: card?.getBoundingClientRect() };
  }, wantTitle);
  console.log('click result:', clicked);
  await page.waitForTimeout(1500);

  // The modal has a "Download SVG for your projects" button. Click it and intercept the download.
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }).catch(() => null),
    page.getByText(/Download SVG/i).first().click({ timeout: 5000 }).catch((e) => console.log('download click:', e.message)),
  ]);

  let svgInfo = null;
  if (download) {
    const path = await download.path();
    const { readFile } = await import('node:fs/promises');
    const text = await readFile(path, 'utf8');
    svgInfo = { kind: 'download', html: text };
    console.log(`downloaded ${text.length} bytes`);
  } else {
    console.log('no download event, screenshotting state');
    await page.screenshot({ path: resolve('scripts', 'undraw-no-download.png'), fullPage: false });
  }

  if (!svgInfo) {
    console.error('No SVG found on the page. The page may require login or the DOM structure is different than expected.');
    console.error('Attempting a screenshot of the page to debug…');
    await page.screenshot({ path: resolve('scripts', 'undraw-debug.png'), fullPage: true });
    process.exit(3);
  }

  let svg;
  if (svgInfo.kind === 'img') {
    if (svgInfo.src.startsWith('data:image/svg')) {
      // Decode the data URI.
      const base64 = svgInfo.src.split(',')[1] || '';
      svg = Buffer.from(base64, 'base64').toString('utf8');
      if (!svg.startsWith('<svg')) svg = decodeURIComponent(svgInfo.src.split(',')[1]);
    } else {
      // External URL — fetch it.
      svg = await (await fetch(svgInfo.src)).text();
    }
  } else {
    svg = svgInfo.html;
  }

  await writeFile(out, svg);
  console.log(`→ ${out} (${svg.length} bytes)`);
} finally {
  await browser.close();
}
