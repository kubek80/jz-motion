// Opens a presentation, clicks Timing, enters Prompter mode so the next snap captures the prompter
// view with sentences, duration labels and the running clock visible.
export async function run(page) {
  await page.waitForSelector('button[title^="Time the beats"]', { timeout: 10000 });
  await page.waitForTimeout(600);
  await page.click('button[title^="Time the beats"]');
  await page.waitForSelector('.timing-head', { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.click('button:has-text("Prompter")');
  await page.waitForTimeout(800);
}
