// The avatar tools: Timing on a scene with the avatar (playing a moment), the video lane, right-clicking a clip
// (Make my avatar for this clip, not clicked), then My avatar (the avatar in use, its style, how it moves).
// Against a copy of a presentation with avatars:
// npm run record -- 'http://localhost:5173/#/p/jzm-avatar' jzm-avatar scripts/scenarios/jzm-avatar.mjs --size 1600x1000
import { glide, notes } from './jzm-helpers.mjs';

const SCENE = process.env.JZM_SCENE ?? 'JZ-motion';

export async function setup(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.frame');
  await page.waitForTimeout(1500);
  await page.locator('.scenes .scene', { hasText: SCENE }).first().click();
  await page.waitForTimeout(1200);
  await page.mouse.move(640, 300);
  await page.waitForTimeout(600);
}

async function hover(page, locator, rest = 600) {
  const b = await locator.boundingBox();
  await glide(page, b.x + b.width / 2, b.y + b.height / 2, rest);
  return b;
}

export async function run(page) {
  const n = notes('jzm-avatar');
  await page.waitForTimeout(800);
  const timing = page.getByRole('button', { name: 'Timing', exact: true });
  await hover(page, timing, 400);
  await timing.click();
  await page.waitForSelector('.timing .avatar-block');
  await page.waitForTimeout(2500);
  n.step('timing');
  await n.box(page, 'board', '.timing-board');
  await n.box(page, 'lane', '.timing .avatar-lane');

  // A moment of the avatar speaking.
  await page.mouse.move(700, 300, { steps: 6 });
  await page.keyboard.press('Space');
  await page.waitForTimeout(4000);
  await page.keyboard.press('Space');
  await page.waitForTimeout(600);
  n.step('played');

  // The video lane: the avatar under the sound it says.
  await hover(page, page.locator('.timing .avatar-block').first(), 1500);
  n.step('lane');

  // Right-click a voice clip: make my avatar for it.
  const clip = page.locator('.timing .clip-block').nth(2);
  const cb = await clip.boundingBox();
  await glide(page, cb.x + 30, cb.y + cb.height / 2, 500);
  await page.mouse.click(cb.x + 30, cb.y + cb.height / 2, { button: 'right' });
  await page.waitForSelector('.context-menu');
  await page.waitForTimeout(500);
  await hover(page, page.locator('.context-menu').getByText(/Make my avatar/), 1500);
  n.step('menu');
  await n.box(page, 'menu', '.context-menu');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);

  // My avatar: the avatar in use, its style, how it moves.
  const mine = page.getByRole('button', { name: /My avatar/ }).first();
  await hover(page, mine, 500);
  await mine.click();
  await page.waitForSelector('.my-avatar .avatar-in-use img');
  await page.waitForTimeout(2000);
  n.step('my-avatar');
  await n.box(page, 'in-use', '.my-avatar .avatar-in-use');
  await n.box(page, 'style', '.my-avatar textarea');
  const moves = page.locator('.my-avatar h4', { hasText: 'How it moves' });
  await moves.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  n.step('moves');
  await n.box(page, 'moves', '.my-avatar section:has(h4:has-text("How it moves"))');
  await page.waitForTimeout(1000);
  await n.save(page);
}
