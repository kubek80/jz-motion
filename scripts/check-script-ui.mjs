import { chromium } from 'playwright';

const [,, baseUrl, out] = process.argv;
if (!baseUrl) {
  console.error('usage: node check-script-ui.mjs <baseUrl> <out-prefix>');
  process.exit(2);
}

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
page.on('console', (msg) => console.log(`[browser ${msg.type()}]`, msg.text()));
page.on('pageerror', (e) => console.log('[browser error]', e.message));

await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.card-open', { timeout: 10000 });
await page.locator('.card-open').first().click();

await page.waitForSelector('button:has-text("Script")', { timeout: 10000 });
await page.click('button:has-text("Script")');
await page.waitForSelector('.script-head', { timeout: 10000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}-script.png`, fullPage: false });

const headCounts = await page.locator('.script-head .muted').first().textContent();
const total = await page.locator('.script-total').textContent();
const beatCount = await page.locator('.script-beat').count();
console.log('counts:', headCounts);
console.log('total:', total);
console.log('beats rendered:', beatCount);

// Try editing the first beat
await page.locator('.script-notes').first().click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}-script-edit.png`, fullPage: false });

const editing = await page.locator('.script-beat.editing').count();
console.log('beats in edit mode:', editing);

await browser.close();
