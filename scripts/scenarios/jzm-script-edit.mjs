// Deliberate-pace demo of editing a sentence in the Script view, against the sandbox.
// The clip shows: open Script → first sentence appears → click → textarea opens → type → Save.
export async function run(page) {
  await page.waitForSelector('button:has-text("Script")', { timeout: 10000 });
  await page.waitForTimeout(1000);
  await page.click('button:has-text("Script")');

  await page.waitForSelector('.script-notes', { timeout: 10000 });
  await page.waitForTimeout(900);

  const first = page.locator('.script-notes').first();
  await first.hover();
  await page.waitForTimeout(600);
  await first.click();

  const ta = page.locator('.script-edit textarea');
  await ta.waitFor();
  await page.waitForTimeout(500);
  await ta.press('End');
  await page.waitForTimeout(300);
  for (const ch of ' Hello!') {
    await page.keyboard.type(ch);
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(700);
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(900);
}
