// Switch to scene 3 (team clipart), take screenshot A, wait 2s, take screenshot B. The final
// .png the snap script writes is B; compare against the a_idle_pair_A copy written here.
import { writeFile } from 'node:fs/promises';
export async function run(page) {
  await page.waitForTimeout(2500);
  const buttons = await page.$$('.scene-strip button, .scenes .scene, [data-scene-index]');
  if (buttons.length >= 3) await buttons[2].click();
  await page.waitForTimeout(1600);
  const a = await page.screenshot({ type: 'png', fullPage: false });
  await writeFile('images/jzm-idle-pair-A.png', a);
  await page.waitForTimeout(2200);
}
