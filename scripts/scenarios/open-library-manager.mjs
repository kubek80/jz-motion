// Open the full-screen library browser by clicking the ⤢ button in the library sidebar.
export async function run(page) {
  await page.waitForSelector('.library .lib-search button', { timeout: 8000 });
  await page.waitForTimeout(800);
  await page.click('.library .lib-search button');
  await page.waitForTimeout(900);
}
