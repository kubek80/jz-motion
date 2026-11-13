// Shared by the Process Manager demo scenarios (the app from kubek80/process-manager, run locally on port 5180).
// Record against a checkout you can reset: the scenarios save feedback, a new step and a review date
// (`git checkout -- processes && rm -rf feedback/*.json` in that repository afterwards).
import { glide } from '../jzm-helpers.mjs';
export { glide, notes } from '../jzm-helpers.mjs';

/** The dark interface, consumer or editor, nothing ticked; then the page again so it starts that way. */
export async function prefs(page, mode, hash) {
  await page.evaluate(([m]) => {
    localStorage.clear();
    localStorage.setItem('pm:theme', 'dark');
    localStorage.setItem('pm:mode', m);
  }, [mode]);
  if (hash) await page.evaluate((h) => { location.hash = h; }, hash);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(800);
}

/** Glide to the middle of something, rest so the pointer is seen, click. */
export async function tap(page, locator, rest = 450) {
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator;
  const b = await el.boundingBox();
  await glide(page, b.x + b.width / 2, b.y + b.height / 2, rest);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}

/** Scroll the page in small steps until the element's top is `top` points from the top of the window. */
export async function scrollTo(page, selector, top = 90) {
  const b = await page.locator(selector).first().boundingBox();
  const delta = b.y - top;
  const n = Math.max(1, Math.round(Math.abs(delta) / 60));
  for (let i = 0; i < n; i++) { await page.mouse.wheel(0, delta / n); await page.waitForTimeout(40); }
  await page.waitForTimeout(500);
}
