// Timing as a prompter: open it on a scene, play (the prompter follows the voice), and the clip menu (clean up, transcribe).
// Against a copy of a presentation with a voice-over (the voice-generation settings show each line's target time):
// npm run record -- 'http://localhost:5173/#/p/jzm-timing' jzm-timing scripts/scenarios/jzm-timing.mjs --size 1600x1000
import { glide, notes } from './jzm-helpers.mjs';

const SCENE = process.env.JZM_SCENE ?? 'Timing, prompter and voice-over';

export async function setup(page) {
  await page.evaluate(() => localStorage.setItem('jzm.voicer', JSON.stringify({ baseURL: 'https://openrouter.ai/api/v1', model: 'mistralai/voxtral-mini-tts-2603', voice: 'en_paul_neutral', apiKey: 'proxy-injected' })));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.frame');
  await page.waitForTimeout(1500);
  const scene = page.locator('.scenes .scene', { hasText: SCENE }).last();
  for (let i = 0; i < 5 && !(await scene.getAttribute('class')).includes('active'); i++) {
    await scene.click();
    await page.waitForTimeout(800);
  }
  await page.mouse.move(700, 400);
  await page.waitForTimeout(1000);
}

export async function run(page) {
  const n = notes('jzm-timing');
  await page.waitForTimeout(1200);
  n.step('editor');
  const btn = page.getByRole('button', { name: 'Timing', exact: true });
  const bb = await btn.boundingBox();
  await glide(page, bb.x + bb.width / 2, bb.y + bb.height / 2, 500);
  await btn.click();
  await page.waitForSelector('.timing');
  await page.waitForTimeout(2500);
  n.step('timing');
  for (const [label, sel] of [['script', '.timing-script'], ['now', '.timing-script .now'], ['board', '.timing-board'], ['controls', '.timing-controls'], ['lanes', '.timing .clip-lanes'], ['record', '.timing .rec-btn']]) await n.box(page, label, sel);

  await page.mouse.move(800, 300, { steps: 8 });
  await page.keyboard.press('Space');
  await page.waitForTimeout(6000);
  n.step('played');
  await page.keyboard.press('Space');
  await page.waitForTimeout(800);
  n.step('paused');

  // The clip menu: clean up the voice, transcribe it.
  const clip = page.locator('.timing .clip-block').first();
  const cb = await clip.boundingBox();
  await glide(page, cb.x + Math.min(cb.width / 2, 60), cb.y + cb.height / 2, 400);
  await page.mouse.click(cb.x + Math.min(cb.width / 2, 60), cb.y + cb.height / 2, { button: 'right' });
  await page.waitForTimeout(800);
  n.step('menu');
  await n.box(page, 'menu', '.context-menu');
  await page.waitForTimeout(2000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await n.save(page);
}
