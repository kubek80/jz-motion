// Edit text, change colour, at a pace a viewer can follow: select the headline, recolour it twice, retype it.
// Against a board you can change (it saves its edits): a clean one with a "headline" text element.
// npm run record -- 'http://localhost:5173/#/p/jzm-board' jzm-edit-colour-b scripts/scenarios/jzm-edit-colour-b.mjs --size 1600x1000
import { glide, notes } from './jzm-helpers.mjs';

export async function run(page) {
  const n = notes('jzm-edit-colour-b');
  await page.waitForSelector('.frame', { timeout: 10000 });
  await page.mouse.move(400, 700);
  await page.waitForTimeout(1500);
  n.start();
  for (const [label, sel] of [['board', '.frame'], ['right', 'aside.right'], ['headline', '[data-id="headline"]']]) await n.box(page, label, sel);
  await page.waitForTimeout(1500);
  n.step('idle');

  const hb = await page.locator('[data-id="headline"]').first().boundingBox();
  const headline = { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 };
  await glide(page, headline.x - 200, headline.y + 80, 200);
  await glide(page, headline.x, headline.y, 600);
  await page.mouse.click(headline.x, headline.y);
  await page.waitForTimeout(1800);
  n.step('selected');
  await n.box(page, 'tray', '.marker-tray');

  for (const colour of ['yellow', 'pink']) {
    const b = page.locator(`.marker-tray button[title^="${colour}"]`);
    const bb = await b.boundingBox();
    await glide(page, bb.x + bb.width / 2, bb.y + bb.height / 2, 700);
    await b.click();
    await page.waitForTimeout(1800);
    n.step(colour);
  }

  await glide(page, headline.x - 150, headline.y + 60, 200);
  await glide(page, headline.x, headline.y, 500);
  await page.mouse.dblclick(headline.x, headline.y);
  await page.waitForTimeout(900);
  n.step('editing');
  await page.keyboard.press('Control+A');
  await page.waitForTimeout(300);
  for (const ch of 'MARKER BOARD') {
    await page.keyboard.type(ch);
    await page.waitForTimeout(110);
  }
  await page.waitForTimeout(800);
  n.step('typed');
  await page.keyboard.press('Enter');
  await page.mouse.move(400, 750, { steps: 12 });
  await page.waitForTimeout(2200);
  n.step('done');
  await n.box(page, 'headline2', '[data-id="headline"]');
  await n.save(page);
}
