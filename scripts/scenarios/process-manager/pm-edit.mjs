// Editing on the map (editor): + on an arrow, the small form, the new step in its lane, what to do, Save changes.
// npm run record -- 'http://localhost:5180/#/p/request-gcp-project/flow' pm-edit scripts/scenarios/process-manager/pm-edit.mjs --size 1600x1000
import { notes, prefs, scrollTo, tap } from './pm-helpers.mjs';

export async function setup(page) { await prefs(page, 'editor'); }

export async function run(page) {
  const n = notes('pm-edit');
  await scrollTo(page, '.flow-wrap', 130);
  n.start();
  await n.box(page, 'flow', '.flow-wrap');
  await n.box(page, 'mode', '.mode-switch');
  await page.waitForTimeout(1500);
  await n.box(page, 'plus', '.edge-add');
  await tap(page, '.edge-add', 700);
  await page.waitForTimeout(1200);
  n.step('form');
  await n.box(page, 'quick', '.quick-add');
  await page.keyboard.type('Check the naming convention', { delay: 60 });
  await page.waitForTimeout(600);
  await tap(page, '.quick-types button[title^="Check the result"]');
  await page.waitForTimeout(900);
  n.step('filled');
  await tap(page, '.quick-add .btn.primary');
  await page.waitForTimeout(2000);
  n.step('added');
  await n.box(page, 'drawer', '.drawer');
  await n.box(page, 'newblock', '.block.selected');
  await tap(page, '.drawer button:has-text("Add action")');
  await page.waitForTimeout(500);
  await page.locator('.drawer .rows .row input, .drawer .rows .row textarea').first().click();
  await page.keyboard.type('Compare the name with the naming page on the wiki.', { delay: 45 });
  await page.waitForTimeout(1200);
  n.step('action');
  await n.box(page, 'save', '.tabs-row .btn.primary');
  await tap(page, '.tabs-row .btn.primary', 700);
  await page.waitForTimeout(2000);
  n.step('saved');
  await n.box(page, 'saved', '.tabs-row .saved');
  await n.box(page, 'status', '.tabs-row .status');
  await n.save(page);
}
