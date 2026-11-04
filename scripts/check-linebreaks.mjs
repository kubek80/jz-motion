import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
page.on('console', (msg) => console.log(`[browser ${msg.type()}]`, msg.text()));
page.on('pageerror', (e) => console.log('[browser error]', e.message));

await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.card-open', { timeout: 10000 });
await page.locator('.card-open').first().click();
await page.waitForSelector('button[title^="Time the beats"]', { timeout: 10000 });
await page.click('button[title^="Time the beats"]');
await page.waitForSelector('.timing-script .now .lines', { timeout: 10000 });

// Click the sentence block to edit
await page.click('.timing-script .now .lines');
await page.waitForSelector('.timing-script .notes-edit');

// Clear and type with line breaks (shift+enter avoids triggering Ctrl+Enter save)
const ta = page.locator('.timing-script .notes-edit');
await ta.fill('');
await ta.pressSequentially('Short bullet one');
await ta.press('Enter');
await ta.pressSequentially('Short bullet two');
await ta.press('Enter');
await ta.press('Enter');
await ta.pressSequentially('A paragraph with. Multiple sentences inside! A third one?');

console.log('textarea value after typing:', JSON.stringify(await ta.inputValue()));

// Save via Ctrl+Enter
await ta.press('Control+Enter');
await page.waitForTimeout(400);

const html = await page.locator('.timing-script .now .lines').innerHTML();
console.log('rendered HTML after save:\n', html);

const lineTexts = await page.locator('.timing-script .now .line-text').allTextContents();
console.log('line texts shown:', lineTexts);

// Re-open to check what persists
await page.click('.timing-script .now .lines');
await page.waitForSelector('.timing-script .notes-edit');
console.log('textarea value on reopen:', JSON.stringify(await page.locator('.timing-script .notes-edit').inputValue()));

await browser.close();
