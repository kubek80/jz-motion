// A recording on the board, frame by frame: select it, step through its frames, drag to one, and make a beat go
// to that frame. Against a copy of a presentation with screen recordings (no voice-over needed):
// npm run record -- 'http://localhost:5173/#/p/jzm-frames' jzm-frames scripts/scenarios/jzm-frames.mjs --size 1600x1000
import { glide, notes } from './jzm-helpers.mjs';

const SCENE = process.env.JZM_SCENE ?? 'Start with a sentence (B)';

export async function setup(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.frame');
  await page.waitForTimeout(1500);
  await page.locator('.scenes .scene', { hasText: SCENE }).last().click();
  await page.waitForTimeout(1500);
  await page.mouse.move(640, 300);
  await page.waitForTimeout(800);
}

/** Selects the recording: its browser bar, at the top of the board (no area lies over it). */
async function selectRecording(page) {
  const fr = await page.locator('.frame').boundingBox();
  const x = fr.x + fr.width * 0.68, y = fr.y + fr.height * 0.152;
  await glide(page, x, y, 500);
  await page.mouse.click(x, y);
}

export async function run(page) {
  const n = notes('jzm-frames');
  await page.waitForTimeout(1000);
  n.step('editor');
  await n.box(page, 'board', '.frame');
  await n.box(page, 'beats', '.storyboard');
  await selectRecording(page);
  await page.waitForSelector('.frame-stepper .which');
  await page.waitForTimeout(1200);
  n.step('selected');
  await n.box(page, 'stepper', '.frame-stepper');

  // Step frame by frame.
  const next = page.locator('.frame-stepper button[title="Next frame"]');
  const nb = await next.boundingBox();
  await glide(page, nb.x + nb.width / 2, nb.y + nb.height / 2, 500);
  for (let i = 0; i < 5; i++) { await next.click(); await page.waitForTimeout(700); }
  n.step('stepped');

  // Drag through to a later frame.
  const range = page.locator('.frame-stepper input[type=range]');
  const rb = await range.boundingBox();
  const from = rb.x + rb.width * 0.06, to = rb.x + rb.width * 0.62, y = rb.y + rb.height / 2;
  await glide(page, from, y, 400);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) { await page.mouse.move(from + ((to - from) * i) / 30, y); await page.waitForTimeout(60); }
  await page.mouse.up();
  await page.waitForTimeout(1200);
  n.step('dragged');

  // Into the first beat: a "Go to frame" action.
  await page.locator('.frame-stepper select').selectOption({ index: 1 });
  await page.waitForTimeout(500);
  const go = page.locator('.frame-stepper button', { hasText: 'Go to frame' });
  const gb = await go.boundingBox();
  await glide(page, gb.x + gb.width / 2, gb.y + gb.height / 2, 600);
  await go.click();
  await page.waitForTimeout(1500);
  n.step('added');
  await n.box(page, 'beat1', '.storyboard .beat-card');
  await page.mouse.move(640, 650, { steps: 12 });
  await page.waitForTimeout(1500);
  await n.save(page);
}
