// Drive the Creator through a two-prompt clipart conversation (lightbulb off → lightbulb on)
// using Claude Sonnet via the local Claude Code subscription (agent mode: uses the project's
// library-item skill, slow but much better results). Used by snap to produce the Creator
// screenshot for slide 9 of the "JZ-motion" explainer.
//
// Preseeds localStorage with a single Claude Sonnet (subscription) profile so the dropdown is
// unambiguous and agent mode is on. Does NOT touch the user's real Chrome profile.
export async function run(page) {
  // Preseed a single Claude-Code Sonnet profile with agent mode ON (profile.agent !== false).
  await page.evaluate(() => {
    const prof = {
      id: 'scenario-claude-sonnet-sub',
      name: 'Claude Sonnet (subscription)',
      baseURL: 'claude-code:',
      model: 'sonnet',
      apiKey: '',
      enabled: true,
      size: 'medium',
    };
    localStorage.setItem('jzm.models', JSON.stringify([prof]));
    // Clear any remembered "picked model" from past sessions so pickFor uses our single profile.
    localStorage.removeItem('jzm.recommend');
  });
  // Navigate into the editor — the Library sidebar (with its full-screen search button) only
  // exists there, not on the Home screen. Any presentation works; use the one this scenario
  // ships with.
  await page.goto('http://localhost:5173/#/p/9df1df97', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(800);

  // Open the full-screen library.
  await page.waitForSelector('.library .lib-search button', { timeout: 15000 });
  await page.click('.library .lib-search button');
  await page.waitForSelector('.libman-nav', { timeout: 5000 });
  await page.waitForTimeout(300);

  // Switch to the Clipart tab (so "New with AI → Clipart" starts in clipart mode).
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('.libman-nav button')) {
      if ((b.textContent ?? '').trim().startsWith('Clipart')) { b.click(); return; }
    }
  });
  await page.waitForTimeout(300);

  // Click "New with AI → Clipart" (the row has class .new-ai).
  const createClicked = await page.evaluate(() => {
    for (const b of document.querySelectorAll('.new-ai button')) {
      if ((b.textContent ?? '').trim() === 'Clipart') { b.click(); return true; }
    }
    return false;
  });
  if (!createClicked) throw new Error('"New with AI · Clipart" button not found');
  await page.waitForSelector('.modal.creator', { timeout: 5000 });
  await page.waitForTimeout(600);

  // Type the first prompt.
  const textarea = page.locator('.modal.creator textarea').first();
  await textarea.fill('a turned-off lightbulb, side view: glass bulb on top, socket base below');
  await page.waitForTimeout(300);

  // Primary chat button inside the input row (not the "Save to library" one in the side panel).
  const send = page.locator('.modal.creator .creator-input button.primary').first();
  await send.click();

  // Wait for the first version to land. Agent mode via Claude Code is slow (minutes).
  await page.waitForFunction(
    () => document.querySelectorAll('.modal.creator .msg.version.ok').length >= 1,
    null,
    { timeout: 10 * 60 * 1000, polling: 2000 },
  );
  console.log('version 1 landed');
  await page.waitForTimeout(800);

  // Second prompt: turn it on.
  await textarea.fill('now turn it on so it is glowing yellow');
  await page.waitForTimeout(300);
  await send.click();

  await page.waitForFunction(
    () => document.querySelectorAll('.modal.creator .msg.version.ok').length >= 2,
    null,
    { timeout: 10 * 60 * 1000, polling: 2000 },
  );
  console.log('version 2 landed');

  // Scroll the thread so both versions are in view at top.
  await page.evaluate(() => { document.querySelector('.modal.creator .creator-thread')?.scrollTo({ top: 0 }); });
  await page.waitForTimeout(1200);
}
