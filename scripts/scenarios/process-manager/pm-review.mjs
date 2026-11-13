// The periodic review (editor): what is due, the overdue banner, Mark as reviewed, the new date.
// npm run record -- 'http://localhost:5180/#/' pm-review scripts/scenarios/process-manager/pm-review.mjs --size 1600x1000
import { notes, prefs, tap } from './pm-helpers.mjs';

export async function setup(page) { await prefs(page, 'editor', '#/'); }

export async function run(page) {
  const n = notes('pm-review');
  n.start();
  await n.box(page, 'strip', '.review-strip');
  await page.waitForTimeout(1800);
  await tap(page, '.review-strip', 700);
  await page.waitForTimeout(1500);
  n.step('due');
  await n.box(page, 'cards', '.cards');
  await tap(page, '.card:has-text("Akamai")');
  await page.waitForTimeout(2000);
  n.step('opened');
  await n.box(page, 'banner', '.check.bad.banner');
  await n.box(page, 'tag', '.review-tag');
  await n.box(page, 'button', '.btn.review-due');
  await n.box(page, 'head', '.process-head');
  await page.waitForTimeout(1500);
  await tap(page, '.btn.review-due', 800);
  await page.waitForTimeout(2200);
  n.step('reviewed');
  await n.box(page, 'tag-after', '.review-tag');
  await n.save(page);
}
