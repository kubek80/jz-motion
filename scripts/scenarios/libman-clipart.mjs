// Open the full-screen library, switch to the Clipart category, and select the designer tile so
// the detail panel on the right shows the clipart preview with white as the dominant marker.
export async function run(page) {
  await page.waitForSelector('.library .lib-search button', { timeout: 8000 });
  await page.waitForTimeout(800);
  await page.click('.library .lib-search button');
  await page.waitForTimeout(600);
  // Click the "Clipart" nav button.
  await page.evaluate(() => {
    const nav = document.querySelector('.libman-nav');
    const btns = nav?.querySelectorAll('button') ?? [];
    for (const b of btns) if ((b.textContent ?? '').trim().startsWith('Clipart')) b.click();
  });
  await page.waitForTimeout(400);
  // Click the "designer" tile so its detail opens.
  await page.evaluate(() => {
    const tiles = document.querySelectorAll('.lib-tile');
    for (const t of tiles) if ((t.querySelector('.name')?.textContent ?? '').trim() === 'designer') { t.click(); break; }
  });
  await page.waitForTimeout(1800);
}
