// Scroll the editor's library sidebar down so the Pictures section comes into view.
export async function run(page) {
  await page.waitForSelector('.library', { timeout: 8000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const el = document.querySelector('.library'); if (el) el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(600);
}
