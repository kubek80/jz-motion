// The home screen, from one sentence to a first draft (with the mock model: `npm run mock-llm`).
// npm run record -- http://localhost:5173/ jzm-home-start scripts/scenarios/jzm-home-start.mjs
// Makes a new presentation (from a bundled example): delete it afterwards.
import { glide, notes, useMockModel } from './jzm-helpers.mjs';

export const setup = useMockModel;

export async function run(page) {
  const n = notes('jzm-home-start');
  await page.waitForSelector('.start-box textarea');
  n.start();
  await n.box(page, 'box', '.start-box');
  await n.box(page, 'textarea', '.start-box textarea');
  await n.box(page, 'modes', '.mode-chips');
  await n.box(page, 'model', '.model-select');
  await page.waitForTimeout(1500);
  n.step('idle');

  const ta = page.locator('.start-box textarea');
  const tb = await ta.boundingBox();
  await glide(page, tb.x + 120, tb.y + tb.height / 2, 300);
  await ta.click();
  await page.keyboard.type('How jz-motion turns one sentence into an explainer video', { delay: 55 });
  await page.waitForTimeout(1200);
  n.step('typed');

  for (const label of ['Script', 'Recording', 'Topic']) {
    const chip = page.locator('.mode-chips button', { hasText: label });
    const cb = await chip.boundingBox();
    await glide(page, cb.x + cb.width / 2, cb.y + cb.height / 2, 350);
    await chip.click();
    await page.waitForTimeout(1300);
    n.step(`mode ${label}`);
  }
  if (!(await ta.inputValue())) await ta.fill('How jz-motion turns one sentence into an explainer video');

  const send = page.locator('.start-box button.send');
  const sb = await send.boundingBox();
  await glide(page, sb.x + sb.width / 2, sb.y + sb.height / 2, 400);
  await send.click();
  n.step('sent');
  // A conversation opens: what was asked, what came back, and a preview of the draft.
  const create = page.getByRole('button', { name: 'Create presentation' });
  await create.waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
  n.step('draft ready');
  await n.box(page, 'dialog', '.modal');
  await page.locator('.modal').getByText('What happened').click().catch(() => undefined);
  await page.waitForTimeout(2200);
  n.step('what happened');
  const cr = await create.boundingBox();
  await glide(page, cr.x + cr.width / 2, cr.y + cr.height / 2, 500);
  await create.click();
  await page.waitForSelector('.scenes', { timeout: 15000 });
  await page.waitForTimeout(2500);
  n.step('editor');
  await n.box(page, 'board', '.frame');
  await n.box(page, 'storyboard', '.storyboard');
  await n.save(page);
}
