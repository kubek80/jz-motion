import { chromium } from 'playwright';

const [,, baseUrl, out] = process.argv;
if (!baseUrl) {
  console.error('usage: node check-tts-ui.mjs <baseUrl> <out-prefix>');
  process.exit(2);
}

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
page.on('console', (msg) => console.log(`[browser ${msg.type()}]`, msg.text()));
page.on('pageerror', (e) => console.log('[browser error]', e.message));

await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

// Open the first saved presentation.
await page.waitForSelector('.card-open', { timeout: 10000 });
await page.locator('.card-open').first().click();
await page.waitForSelector('button[title^="Time the beats"]', { timeout: 10000 });
await page.screenshot({ path: `${out}-editor.png`, fullPage: false });

await page.click('button[title^="Time the beats"]');
await page.waitForSelector('.timing-head', { timeout: 10000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}-timing.png`, fullPage: false });

const headerTexts = await page.locator('.timing-head button').allTextContents();
console.log('header buttons:', headerTexts);

// Prompter mode
await page.click('button:has-text("Prompter")');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}-prompter.png`, fullPage: false });

const lines = await page.locator('.timing-script .line').count();
const nowLines = await page.locator('.timing-script .now .line-text').allTextContents();
const nowDurs = await page.locator('.timing-script .now .line-dur').allTextContents();
const budget = await page.locator('.timing-script .beat-budget').first().textContent();
console.log('sentences rendered in prompter:', lines);
console.log('first sentences of now:', nowLines);
console.log('line durations of now:', nowDurs);
console.log('beat budget:', budget);

// Open settings and go to Voice generation
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.click('button[title^="Models, API keys"]');
await page.waitForSelector('.modal h2');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}-settings.png`, fullPage: true });

const voiceHeading = await page.locator('.settings-section h3:has-text("Voice generation")').count();
console.log('voice settings heading present:', voiceHeading);

await browser.close();
