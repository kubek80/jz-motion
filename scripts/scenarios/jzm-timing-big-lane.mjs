// Open Timing (not prompter), bump the lane-height CSS var so the timeline takes more room, then
// seek partway so the playhead sits in a dense cluster of beat flags.
export async function run(page) {
  await page.waitForSelector('button[title^="Time the beats"]', { timeout: 15000 });
  await page.click('button[title^="Time the beats"]');
  await page.waitForSelector('.timing-head', { timeout: 10000 });
  await page.waitForTimeout(600);
  // Bake a larger lane height via localStorage so it survives the current render.
  await page.evaluate(() => { localStorage.setItem('jzm.layout.timing-lane-h', '450'); });
  await page.reload();
  await page.waitForSelector('button[title^="Time the beats"]', { timeout: 15000 });
  await page.click('button[title^="Time the beats"]');
  await page.waitForSelector('.timing-head', { timeout: 10000 });
  await page.waitForTimeout(800);
}
