// Open the full-screen library and switch to the Clipart category so the user can see all the
// UnDraw tiles in the grid, grouped under HAND-DRAWN + FROM UNDRAW headings.
export async function run(page) {
  await page.waitForSelector('.library .lib-search button', { timeout: 8000 });
  await page.waitForTimeout(800);
  await page.click('.library .lib-search button');
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const nav = document.querySelector('.libman-nav');
    const btns = nav?.querySelectorAll('button') ?? [];
    for (const b of btns) if ((b.textContent ?? '').trim().startsWith('Clipart')) b.click();
  });
  await page.waitForTimeout(400);
}
