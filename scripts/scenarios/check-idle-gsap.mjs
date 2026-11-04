// Confirm the GSAP-driven idle tween is actually moving the clipart group over time.
// Navigates to scene 3 (team clipart), then samples the transform attribute at two points ~1s
// apart. The transform is expected to change between samples; if they're identical the tween
// isn't running on the element we think it is.
export async function run(page) {
  await page.waitForTimeout(2500);
  const buttons = await page.$$('.scene-strip button, .scenes .scene, [data-scene-index]');
  if (buttons.length >= 3) await buttons[2].click();
  await page.waitForTimeout(1500);
  const dump = () => page.evaluate(() => {
    const svgs = document.querySelectorAll('svg');
    const info = {
      svgCount: svgs.length,
      totalGs: 0,
      biggestGs: [],
    };
    const all = [];
    for (const svg of svgs) {
      const gs = svg.querySelectorAll('g');
      info.totalGs += gs.length;
      gs.forEach((g) => {
        all.push({ children: g.children.length, transform: g.getAttribute('transform') ?? '' });
      });
    }
    info.biggestGs = all.sort((a, b) => b.children - a.children).slice(0, 10);
    return JSON.stringify(info, null, 2);
  });
  console.log('— sample A —');
  console.log(await dump());
  await page.waitForTimeout(1100);
  console.log('— sample B —');
  console.log(await dump());
}
