// The voice tools: Timing, a clip's window (its wave and loudness, a part selected, the microphone test, record or
// generate it again), then My voice (the sample cloning copies, the accent). Against a copy of a presentation with a
// voice-over, with a recording as the microphone so the meter shows speech:
// JZM_FAKE_MIC=voice.wav npm run record -- 'http://localhost:5173/#/p/jzm-voice' jzm-voice scripts/scenarios/jzm-voice.mjs --size 1600x1000
import { glide, notes } from './jzm-helpers.mjs';

const SCENE = process.env.JZM_SCENE ?? 'Why I built it';

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
  const n = notes('jzm-voice');
  await page.waitForTimeout(800);
  const timing = page.getByRole('button', { name: 'Timing', exact: true });
  await hover(page, timing, 400);
  await timing.click();
  await page.waitForSelector('.timing .clip-block');
  await page.waitForTimeout(2500);
  n.step('timing');
  await n.box(page, 'lanes', '.timing .clip-lanes');

  // The scene's clip: double-click it (near its start, away from its ✕).
  const clip = page.locator('.timing .clip-block.sounding').first();
  const target = (await clip.count()) ? clip : page.locator('.timing .clip-block').nth(2);
  const cb = await target.boundingBox();
  await glide(page, cb.x + 24, cb.y + cb.height / 2, 600);
  await page.mouse.dblclick(cb.x + 24, cb.y + cb.height / 2);
  await page.waitForSelector('.clip-detail .wave canvas');
  await page.waitForTimeout(2500);
  n.step('clip');
  await n.box(page, 'window', '.clip-detail');
  await n.box(page, 'wave', '.clip-detail .clip-wave');

  // Select a part of the wave.
  const wb = await page.locator('.clip-detail .wave').boundingBox();
  const y = wb.y + wb.height / 2;
  await glide(page, wb.x + wb.width * 0.32, y, 400);
  await page.mouse.down();
  for (let i = 1; i <= 25; i++) { await page.mouse.move(wb.x + wb.width * (0.32 + (0.24 * i) / 25), y); await page.waitForTimeout(40); }
  await page.mouse.up();
  await page.waitForTimeout(1500);
  n.step('selected');

  // The microphone test.
  const fold = page.locator('.clip-detail button.fold', { hasText: 'Check the microphone' });
  await fold.scrollIntoViewIfNeeded();
  await hover(page, fold, 500);
  await fold.click();
  await page.waitForTimeout(3500);
  n.step('mic');
  await n.box(page, 'mic', '.clip-detail .mic-check, .clip-detail .level-meter');

  // Record it again, or generate it again.
  const again = page.locator('.clip-detail .rerecord');
  await again.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await hover(page, again.locator('button', { hasText: 'Record again' }), 900);
  n.step('record-again');
  await hover(page, again.locator('button', { hasText: 'Generate again' }), 1200);
  n.step('generate-again');
  await n.box(page, 'again', '.clip-detail .rerecord');
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);

  // My voice: the sample cloning copies, and the accent.
  const mv = page.getByRole('button', { name: /My voice/ }).first();
  await hover(page, mv, 500);
  await mv.click();
  await page.waitForSelector('.my-voice');
  await page.waitForTimeout(2000);
  n.step('my-voice');
  await n.box(page, 'my-voice', '.my-voice');
  const accent = page.locator('.my-voice label.field', { hasText: 'accent' });
  await hover(page, accent.locator('select'), 1500);
  n.step('accent');
  await n.box(page, 'accent', '.my-voice label.field:has-text("accent")');
  await n.box(page, 'sample', '.my-voice section >> nth=0');
  await page.waitForTimeout(1200);
  await n.save(page);
}
