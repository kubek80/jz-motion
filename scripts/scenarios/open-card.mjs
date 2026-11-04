// Hovers over a card on the home screen and opens it.
export async function run(page) {
  await page.waitForSelector('.card-open', { timeout: 10000 });
  const card = page.locator('.card-open').first();
  await card.hover();
  await page.waitForTimeout(500);
  await card.click();
  await page.waitForTimeout(1800);
}
