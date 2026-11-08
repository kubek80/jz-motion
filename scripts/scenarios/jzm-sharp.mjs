// The editor on a scene with a recording, for a still: an ordinary screenshot next to a sharp capture of the same
// screen shows why captures are made larger (camera zooms stay sharp). Against a copy of a presentation:
// npm run snap -- 'http://localhost:5173/#/p/jzm-frames' jzm-sharp-1x --size 1280x800 --zoom 1 --scale 1 --scenario scripts/scenarios/jzm-sharp.mjs
// npm run snap -- 'http://localhost:5173/#/p/jzm-frames' jzm-sharp-2x --size 1600x1000 --scenario scripts/scenarios/jzm-sharp.mjs
const SCENE = process.env.JZM_SCENE ?? 'Start with a sentence (B)';

export async function run(page) {
  await page.waitForSelector('.frame');
  await page.waitForTimeout(1500);
  await page.locator('.scenes .scene', { hasText: SCENE }).last().click();
  await page.waitForTimeout(1500);
  await page.mouse.move(5, 795);
  await page.waitForTimeout(500);
}
