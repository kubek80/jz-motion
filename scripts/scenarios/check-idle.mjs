// Switch to scene 3 (the "why" scene, which has the team clipart) then confirm the clipart
// idle-animation wrapper is applied in the live DOM.
export async function run(page) {
  await page.waitForTimeout(2500);
  const buttons = await page.$$('.scene-strip button, .scenes .scene, [data-scene-index]');
  if (buttons.length >= 3) await buttons[2].click();
  await page.waitForTimeout(1500);
  const report = await page.evaluate(() => {
    const groups = Array.from(document.querySelectorAll('g.clipart-idle'));
    return {
      count: groups.length,
      firstChildren: groups[0]?.children.length ?? 0,
      animationName: groups[0] ? getComputedStyle(groups[0]).animationName : null,
      animationDuration: groups[0] ? getComputedStyle(groups[0]).animationDuration : null,
    };
  });
  console.log(JSON.stringify(report));
}
