// Open the library, go to 3D models, click the snowman to show the new sphere primitive preview.
export async function run(page) {
  await page.waitForSelector('.library .lib-search button', { timeout: 8000 });
  await page.waitForTimeout(800);
  await page.click('.library .lib-search button');
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const nav = document.querySelector('.libman-nav');
    for (const b of nav?.querySelectorAll('button') ?? []) if ((b.textContent ?? '').trim().startsWith('3D models')) b.click();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    for (const t of document.querySelectorAll('.lib-tile')) if ((t.querySelector('.name')?.textContent ?? '').trim() === 'snowman') { t.click(); break; }
  });
  await page.waitForTimeout(1800);
}
