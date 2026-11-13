// Flagging a step that doesn't work (consumer), where the flag shows, and the owner marking it fixed (editor).
// npm run record -- 'http://localhost:5180/#/p/request-gcp-project/list' pm-flag scripts/scenarios/process-manager/pm-flag.mjs --size 1600x1000
import { notes, prefs, scrollTo, tap } from './pm-helpers.mjs';

export async function setup(page) { await prefs(page, 'consumer'); }

export async function run(page) {
  const n = notes('pm-flag');
  const step2 = page.locator('.steps .step').nth(1);
  await scrollTo(page, '.list-view', 90);
  n.start();
  await page.waitForTimeout(1500);
  await n.box(page, 'step2', '.steps .step >> nth=1');
  await tap(page, step2.locator('.report'));
  await page.waitForTimeout(1500);
  n.step('form');
  await n.box(page, 'drawer', '.drawer');
  await tap(page, '.drawer .chip:has-text("Out of date")');
  await page.waitForTimeout(600);
  await tap(page, '.drawer textarea');
  await page.keyboard.type('The catalogue item is now called "Cloud project (GCP)".', { delay: 45 });
  await page.waitForTimeout(500);
  await tap(page, '.drawer .fb-send input');
  await page.keyboard.type('Anna', { delay: 90 });
  await page.waitForTimeout(900);
  n.step('typed');
  await tap(page, '.drawer .fb-send .btn');
  await page.waitForTimeout(2000);
  n.step('sent');
  await n.box(page, 'drawer-sent', '.drawer');
  await tap(page, '.drawer [aria-label="Close"]');
  await page.waitForTimeout(800);
  await n.box(page, 'flag-list', '.steps .step >> nth=1 >> .report');
  await scrollTo(page, '.tabs-row', 80);
  await tap(page, '.tabs button:has-text("Map")');
  await page.waitForTimeout(1000);
  await scrollTo(page, '.flow-wrap', 260);
  await page.waitForTimeout(1500);
  n.step('map');
  await n.box(page, 'block2', '.block >> nth=1');
  await n.box(page, 'tab-count', '.tabs button:has-text("Feedback")');
  await page.mouse.wheel(0, -2000);
  await page.waitForTimeout(500);
  await tap(page, '.back');
  await page.waitForTimeout(900);
  await scrollTo(page, '.card:has(.flagged)', 330);
  await page.waitForTimeout(1500);
  n.step('library');
  await n.box(page, 'card-flag', '.card:has(.flagged)');
  // the owner
  await tap(page, '.mode-switch button:has-text("Editor")');
  await page.waitForTimeout(1200);
  await tap(page, '.card:has(.flagged)');
  await page.waitForTimeout(1500);
  await tap(page, '.tabs button:has-text("Feedback")');
  await page.waitForTimeout(1800);
  n.step('owner');
  await n.box(page, 'fb-item', '.fb-item');
  await tap(page, '.fb-item .fb-actions .btn');
  await page.waitForTimeout(1800);
  n.step('fixed');
  await n.box(page, 'fb-item-fixed', '.fb-item');
  await n.save(page);
}
