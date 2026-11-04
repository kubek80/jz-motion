// Open the Timing + Prompter on this presentation at scene 8 ("LLM first") beat 1, with the
// drawing animation nudged forward so the board isn't empty. Used by snap to produce the
// screenshot for slide 15 of the "JZ-motion" explainer.
export async function run(page) {
  // Editor loaded.
  await page.waitForSelector('button[title^="Time the beats"]', { timeout: 15000 });
  await page.waitForTimeout(600);

  // Open Timing.
  await page.click('button[title^="Time the beats"]');
  await page.waitForSelector('.timing-head', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Enter Prompter mode (the big, readable sentences layout).
  const prompterClicked = await page.evaluate(() => {
    for (const b of document.querySelectorAll('.timing-controls button')) {
      if ((b.textContent ?? '').trim() === 'Prompter') { b.click(); return true; }
    }
    return false;
  });
  if (!prompterClicked) throw new Error('Prompter button not found');
  await page.waitForSelector('.timing-body.prompter', { timeout: 5000 });
  await page.waitForTimeout(500);

  // Seek to exactly 2:31 (151 s) — a specific moment the author wants shown. Computed by reading
  // pixel-per-second off two ruler marks, then clicking the lane at the matching X. The lane's
  // onPointerDown converts clientX → time via `(x - laneLeft + scrollLeft - 20) / pps`.
  const info = await page.evaluate((targetT) => {
    const lane = document.querySelector('.timing-lane');
    const marks = [...document.querySelectorAll('.timing-track .ruler > span')];
    const parsePx = (el) => parseFloat(el.style.left) || 0;
    const parseLabel = (txt) => {
      const [m, s] = txt.trim().split(':').map(Number);
      return m * 60 + s;
    };
    // Need two marks with distinct t values to derive pps.
    let a, b;
    for (const m of marks) {
      const t = parseLabel(m.textContent ?? '');
      if (a === undefined) { a = { t, x: parsePx(m) }; continue; }
      if (t !== a.t) { b = { t, x: parsePx(m) }; break; }
    }
    if (!a || !b) throw new Error('could not find two ruler marks for pps');
    const pps = (b.x - a.x) / (b.t - a.t);
    const targetX = 20 + targetT * pps;
    const laneRect = lane.getBoundingClientRect();
    const scrollLeft = lane.scrollLeft;
    return {
      clickX: laneRect.left + targetX - scrollLeft,
      clickY: laneRect.top + laneRect.height / 2,
      pps,
      targetX,
    };
  }, 151);
  console.log('seek click', info);
  await page.mouse.click(info.clickX, info.clickY);
  await page.waitForTimeout(1000);
}
