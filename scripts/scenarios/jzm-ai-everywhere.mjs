// Where the AI is: the home box, the scene bar above the beats, the AI tab, and "New with AI" in the library.
// With the mock model (`npm run mock-llm`), against a fresh copy of a presentation (the scene bar and the chat change it):
// npm run record -- 'http://localhost:5173/#/p/jzm-demo' jzm-ai-everywhere scripts/scenarios/jzm-ai-everywhere.mjs --size 1600x1000
import { glide, notes, useMockModel } from './jzm-helpers.mjs';

const typeSlowly = async (page, text) => { for (const ch of text) { await page.keyboard.type(ch); await page.waitForTimeout(35); } };

let presentation;
export async function setup(page) {
  presentation = page.url();
  await useMockModel(page);
  await page.goto(new URL('/', presentation).href);
}

export async function run(page) {
  const n = notes('jzm-ai-everywhere');
  await page.waitForSelector('.start-box textarea');
  await page.waitForTimeout(800);
  n.start();
  await n.box(page, 'home-box', '.start-box');

  // 1. Home: a sentence in the box.
  await page.locator('.start-box textarea').click();
  await typeSlowly(page, 'How a web request reaches the database');
  await page.waitForTimeout(1500);
  n.step('home');

  // 2. The editor's scene bar: change just this scene.
  await page.goto(presentation);
  await page.waitForSelector('.scenes');
  await page.locator('.scenes .scene', { hasText: 'Start with a sentence' }).first().click();
  await page.waitForTimeout(1500);
  n.step('editor');
  await n.box(page, 'askrow', '.ask-row');
  const ask = page.locator('.scene-ask input');
  const ab = await ask.boundingBox();
  await glide(page, ab.x + 80, ab.y + ab.height / 2, 300);
  await ask.click();
  await typeSlowly(page, 'make a new scene for the part about no Photoshop');
  await page.waitForTimeout(800);
  n.step('ask typed');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3500);
  n.step('ask done');
  await n.box(page, 'askrow2', '.ask-row');
  await n.box(page, 'scenes', '.scenes');

  // 3. The AI tab: a bigger change, every step shown.
  const tab = page.locator('aside.right .tabs button', { hasText: 'AI' });
  const tb = await tab.boundingBox();
  await glide(page, tb.x + tb.width / 2, tb.y + tb.height / 2, 400);
  await tab.click();
  await page.waitForTimeout(1200);
  const area = page.locator('aside.right textarea');
  await area.click();
  await typeSlowly(page, 'Make every scene end by pulling back to the whole board');
  await page.waitForTimeout(800);
  n.step('tab typed');
  await n.box(page, 'right', 'aside.right');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);
  n.step('tab done');
  await n.box(page, 'right2', 'aside.right');

  // 4. The library: describe a missing picture.
  const create = page.locator('.library .ai-add');
  await create.scrollIntoViewIfNeeded();
  const cb = await create.boundingBox();
  await glide(page, cb.x + cb.width / 2, cb.y + cb.height / 2, 400);
  await create.click();
  await page.waitForTimeout(1200);
  await page.locator('.creator-input textarea').click();
  await typeSlowly(page, 'a paint brush crossed out with a marker line');
  await page.waitForTimeout(700);
  n.step('creator typed');
  await page.keyboard.press('Enter');
  await page.locator('.modal .version-art').first().waitFor({ timeout: 20000 }).catch(() => undefined);
  await page.waitForTimeout(3000);
  n.step('creator done');
  await n.box(page, 'creator', '.modal');
  await n.save(page);
}
