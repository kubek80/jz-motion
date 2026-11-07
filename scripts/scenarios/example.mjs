// Example scenario for `npm run record`. The browser is already at the URL you passed and the page is
// loaded. Interact with it however you like — clicks, keyboard, waits — and return when the clip
// should end. The capture loop runs in parallel at the fps you asked for.
//
// Scenario files live in scripts/scenarios/. Keep them short (2–8 seconds of real time) so the recording
// stays small and the beat it plays over doesn't drag.

export async function run(page) {
  // Example: pretend we're on the jz-motion home screen and open the first card.
  await page.waitForSelector('.card-open', { timeout: 10000 }).catch(() => undefined);
  const card = page.locator('.card-open').first();
  if (await card.count()) {
    await card.hover();
    await page.waitForTimeout(400);
    await card.click();
    await page.waitForTimeout(1500);
  } else {
    await page.waitForTimeout(2000);
  }
}
