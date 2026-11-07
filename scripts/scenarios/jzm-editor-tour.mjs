// The editor as a whiteboard: select an element (its properties), a beat, add an icon from the library, P to play.
// Run against a copy of a presentation (it adds an icon):
// npm run record -- 'http://localhost:5173/#/p/jzm-demo' jzm-editor-tour scripts/scenarios/jzm-editor-tour.mjs --size 1600x1000
import { glide, notes } from './jzm-helpers.mjs';

export async function run(page) {
  const n = notes('jzm-editor-tour');
  await page.waitForSelector('.scenes');
  await page.locator('.scenes .scene', { hasText: 'LLM first' }).first().click();
  await page.mouse.move(700, 500);
  await page.waitForTimeout(1500);
  n.start();
  for (const [label, sel] of [['left', 'aside.left'], ['scenes', '.scenes'], ['library', '.library'], ['board', '.frame'], ['askrow', '.ask-row'], ['storyboard', '.storyboard'], ['right', 'aside.right']]) await n.box(page, label, sel);
  await page.waitForTimeout(1500);
  n.step('editor');

  // Select an element: its properties fill the right panel.
  const el = page.locator('[data-id="model"]').first();
  const eb = await el.boundingBox();
  await glide(page, eb.x + eb.width / 2, eb.y + eb.height / 2, 500);
  await page.mouse.click(eb.x + eb.width / 2, eb.y + eb.height / 2);
  await page.waitForTimeout(2000);
  n.step('selected');
  await n.box(page, 'inspector', 'aside.right');

  // A beat: click the second card's title.
  const head = page.locator('.beat-card .beat-head').nth(1);
  const hb = await head.boundingBox();
  await glide(page, hb.x + hb.width / 2, hb.y + hb.height / 2, 500);
  await head.click();
  await page.waitForTimeout(2200);
  n.step('beat');
  await n.box(page, 'beatcard', '.beat-card >> nth=1');

  // The library: pick an icon; it lands on the board, drawn.
  const tile = page.locator('.library .icon-tile', { hasText: 'cloud' }).first();
  const tb = await tile.boundingBox();
  await glide(page, tb.x + tb.width / 2, tb.y + tb.height / 2, 600);
  await n.box(page, 'tile', '.library .icon-tile >> text=cloud');
  await tile.click();
  await page.waitForTimeout(2500);
  n.step('added');

  // P: Play, right where we are; the scene plays.
  await page.mouse.move(700, 300, { steps: 10 });
  await page.keyboard.press('p');
  await page.waitForTimeout(1200);
  n.step('play');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(3500);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(3500);
  n.step('played');
  await n.save(page);
}
