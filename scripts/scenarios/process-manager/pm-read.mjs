// Reading a process as a consumer: find it, the map, what must be in place, a step's details, the checklist, a tick.
// npm run record -- 'http://localhost:5180/#/' pm-read scripts/scenarios/process-manager/pm-read.mjs --size 1600x1000
import { notes, prefs, scrollTo, tap } from './pm-helpers.mjs';

export async function setup(page) { await prefs(page, 'consumer', '#/'); }

export async function run(page) {
  const n = notes('pm-read');
  n.start();
  await n.box(page, 'search', '.filters');
  await page.waitForTimeout(1500);
  await tap(page, '.search input');
  await page.keyboard.type('gcp', { delay: 160 });
  await page.waitForTimeout(1200);
  n.step('searched');
  await n.box(page, 'card', '.card');
  await tap(page, '.card');
  await page.waitForTimeout(1800);
  n.step('opened');
  await n.box(page, 'head', '.process-head');
  await n.box(page, 'prereqs', '.prereq-grid');
  await tap(page, '.prereq .tick');
  await page.waitForTimeout(1200);
  n.step('prereq');
  await scrollTo(page, '.flow-wrap', 100);
  await page.waitForTimeout(1500);
  n.step('map');
  await n.box(page, 'flow', '.flow-wrap');
  await n.box(page, 'lane-me', '.lane.me');
  await tap(page, '.block .block-main');
  await page.waitForTimeout(2000);
  n.step('drawer');
  await n.box(page, 'drawer', '.drawer');
  await tap(page, '.drawer [aria-label="Close"]');
  await page.waitForTimeout(700);
  await scrollTo(page, '.tabs-row', 80);
  await tap(page, '.tabs button:has-text("Checklist")');
  await page.waitForTimeout(1500);
  await scrollTo(page, '.list-view', 90);
  await page.waitForTimeout(1200);
  n.step('checklist');
  await n.box(page, 'listbar', '.list-bar');
  await n.box(page, 'step1', '.steps .step');
  await tap(page, '.steps .step .tick');
  await page.waitForTimeout(1800);
  n.step('ticked');
  await n.save(page);
}
