// Reproduce the "Refine with AI" flow from the library and capture what's visible: Is the
// Creator open? Is the model dropdown rendered? Are there profiles loaded? What's in localStorage
// for jzm.models?
export async function run(page) {
  await page.waitForSelector('.library .lib-search button', { timeout: 8000 });
  await page.waitForTimeout(800);
  // Open full-screen library.
  await page.click('.library .lib-search button');
  await page.waitForTimeout(500);
  // Switch to Clipart.
  await page.evaluate(() => {
    const nav = document.querySelector('.libman-nav');
    for (const b of nav?.querySelectorAll('button') ?? []) if ((b.textContent ?? '').trim().startsWith('Clipart')) b.click();
  });
  await page.waitForTimeout(400);
  // Click the designer tile to open its detail.
  await page.evaluate(() => {
    for (const t of document.querySelectorAll('.lib-tile')) if ((t.querySelector('.name')?.textContent ?? '').trim() === 'designer') { t.click(); break; }
  });
  await page.waitForTimeout(600);
  // Click "Refine with AI".
  const clicked = await page.evaluate(() => {
    for (const b of document.querySelectorAll('.detail button')) if ((b.textContent ?? '').trim() === 'Refine with AI') { b.click(); return true; }
    return false;
  });
  console.log('clicked refine:', clicked);
  await page.waitForTimeout(1200);
  // Now inspect.
  const info = await page.evaluate(() => {
    const creator = document.querySelector('.modal.creator');
    const modelSelect = document.querySelector('.modal.creator .model-select select') ?? document.querySelector('.model-select select');
    const options = modelSelect ? [...modelSelect.querySelectorAll('option')].map((o) => ({ value: o.value, text: o.textContent })) : [];
    let profiles = null;
    try { profiles = JSON.parse(localStorage.getItem('jzm.models') ?? '[]'); } catch { profiles = 'read-error'; }
    return {
      creatorOpen: !!creator,
      modelSelectExists: !!modelSelect,
      modelDisabled: modelSelect ? modelSelect.disabled : null,
      options,
      profileCount: Array.isArray(profiles) ? profiles.length : profiles,
      profileNames: Array.isArray(profiles) ? profiles.map((p) => p.name) : null,
    };
  });
  console.log(JSON.stringify(info, null, 2));
}
