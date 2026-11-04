// Deliberate-pace demo of "edit text, change colour" against presentations/sandbox.json.
// The sandbox has a plain cyan headline at board (960, 460), size 110. We hover before every
// click and pause after every change so the viewer can follow each step on the APNG.
//
// What the clip shows, in order:
//   1. The editor idle (small pause so the first frame is readable).
//   2. Mouse approaches EXPLAINERS, FAST — hover — click to select it.
//   3. Marker tray lifts yellow — click yellow — headline recolours yellow.
//   4. Mouse approaches pink marker — click — headline recolours pink.
//   5. Mouse approaches headline — double-click to open the inline editor.
//   6. Type "MARKER BOARD" character by character — Enter to commit.
//
// Reset the sandbox between recording sessions:  git checkout -- presentations/sandbox.json

export async function run(page) {
  await page.waitForSelector('.frame', { timeout: 10000 });
  await page.waitForTimeout(1800);

  const box = await page.locator('.frame').boundingBox();
  // The headline on the sandbox lives at board (960, 460). At zoom 1 the whole 1920×1080 board
  // fits the frame, so screen = frame-origin + board × (frame-size / 1920 or 1080).
  const toScreen = (bx, by) => ({
    x: box.x + (bx / 1920) * box.width,
    y: box.y + (by / 1080) * box.height,
  });
  const headline = toScreen(960, 460);

  // 1. Settle on the first frame.
  await page.waitForTimeout(800);

  // 2. Walk the mouse to the headline (so the viewer sees it approach), then click.
  await page.mouse.move(headline.x - 200, headline.y + 60, { steps: 10 });
  await page.waitForTimeout(300);
  await page.mouse.move(headline.x, headline.y, { steps: 20 });
  await page.waitForTimeout(600);
  await page.mouse.click(headline.x, headline.y);
  await page.waitForTimeout(900);

  // 3. Hover yellow, pause so the lifted marker is visible, then click.
  const yellow = page.locator('.marker-tray button[title^="yellow"]');
  await yellow.hover();
  await page.waitForTimeout(600);
  await yellow.click();
  await page.waitForTimeout(1100);

  // 4. Second recolour — pink — so viewer sees the mechanism isn't a one-off.
  const pink = page.locator('.marker-tray button[title^="pink"]');
  await pink.hover();
  await page.waitForTimeout(500);
  await pink.click();
  await page.waitForTimeout(1200);

  // 5. Back to the headline, double-click to open the inline editor.
  await page.mouse.move(headline.x - 150, headline.y + 50, { steps: 10 });
  await page.waitForTimeout(300);
  await page.mouse.move(headline.x, headline.y, { steps: 15 });
  await page.waitForTimeout(400);
  await page.mouse.dblclick(headline.x, headline.y);
  await page.waitForTimeout(700);

  // 6. Select all, type a new headline slowly, commit with Enter.
  await page.keyboard.press('Control+A');
  await page.waitForTimeout(300);
  for (const ch of 'MARKER BOARD') {
    await page.keyboard.type(ch);
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(600);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
}
