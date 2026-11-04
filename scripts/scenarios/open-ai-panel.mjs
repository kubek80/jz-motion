// Clicks the AI tab in the editor so the next snap captures the chat/activity panel.
export async function run(page) {
  await page.waitForSelector('.tabs button', { timeout: 10000 });
  await page.waitForTimeout(600);
  await page.click('.tabs button:has-text("AI")');
  await page.waitForTimeout(800);
}
