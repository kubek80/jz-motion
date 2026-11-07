// Shared by the jz-motion demo scenarios: a model set up in the capture browser (the mock one, `npm run mock-llm`,
// so AI steps run without a key), notes of when each step happened, and where things are on screen, so a scene
// can put its areas and pick its frames to match the recording.
import { mkdirSync, writeFileSync } from 'node:fs';

export async function useMockModel(page) {
  await page.evaluate(() => {
    localStorage.setItem('jzm.models', JSON.stringify([
      { id: 'demo', name: 'Claude Code', baseURL: 'http://localhost:5199/v1', model: 'mock', apiKey: '', enabled: true, size: 'large' },
      { id: 'demo-small', name: 'Small and fast (OpenRouter)', baseURL: 'http://localhost:5199/v1', model: 'mock', apiKey: '', enabled: true, size: 'small' },
    ]));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
}

/** Notes steps (seconds since the scenario began, which is when recording began) and boxes (in page points),
 *  written to scratch/captures/<name>-steps.json. `start()` notes a step called "start". */
export function notes(name) {
  const steps = [];
  const boxes = {};
  let t0 = Date.now();
  return {
    start: () => steps.push({ label: 'start', t: (Date.now() - t0) / 1000 }),
    step: (label) => steps.push({ label, t: (Date.now() - t0) / 1000 }),
    box: async (page, label, selector) => {
      const b = await page.locator(selector).first().boundingBox({ timeout: 1000 }).catch(() => null);
      if (b) boxes[label] = b;
    },
    save: async (page) => {
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      mkdirSync('scratch/captures', { recursive: true });
      writeFileSync(`scratch/captures/${name}-steps.json`, JSON.stringify({ viewport, steps, boxes }, null, 1));
    },
  };
}

/** Moves the mouse to a point in a visible glide, then rests on it. */
export async function glide(page, x, y, rest = 400) {
  await page.mouse.move(x, y, { steps: 18 });
  await page.waitForTimeout(rest);
}
