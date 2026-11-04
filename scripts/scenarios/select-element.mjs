// Opens a presentation and clicks on the board to select an element, so a static snap of the
// resulting editor shows the Properties panel with the marker tray.
export async function run(page) {
  await page.waitForSelector('.card-open', { timeout: 10000 });
  await page.locator('.card-open').first().click();
  await page.waitForSelector('.frame', { timeout: 10000 });
  await page.waitForTimeout(1200);
  const beat = page.locator('.beat-card').nth(1);
  if (await beat.count()) {
    await beat.click();
    await page.waitForTimeout(400);
  }
  const frame = await page.locator('.frame').boundingBox();
  // Try multiple spots to hit a text/icon.
  for (const y of [0.4, 0.5, 0.6, 0.3]) {
    await page.mouse.click(frame.x + frame.width / 2, frame.y + frame.height * y);
    await page.waitForTimeout(300);
    if (await page.locator('.marker-tray').count()) break;
  }
  await page.waitForTimeout(400);
}
