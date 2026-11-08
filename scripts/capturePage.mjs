// The browser page that snap and record capture from, set up for sharp captures that hold up under camera zooms.
//
// --size WxH  the browser window the page is laid out in, as on a laptop screen (default 1280x800)
// --zoom Z    browser zoom: text and controls Z times bigger, as with Ctrl/Cmd + (default 1.25)
// --scale S   pixels per point, like a Retina screen (default 2)
//
// The page lays out in (size / zoom) CSS pixels and is captured at size × scale pixels: by default 2560×1600,
// so a camera move can zoom in two times on a 1080p video before the interface goes soft.

/**
 * JZM_FAKE_MIC=<file.wav>: the capture browser's microphone plays that recording (and asks no permission), so a
 * demo of a microphone meter or a recording shows real speech.
 */
export function fakeMic() {
  const wav = process.env.JZM_FAKE_MIC;
  return wav ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`] : [];
}

export function captureOptions(value) {
  const [w, h] = value('size', '1280x800').split('x').map(Number);
  const zoom = Number(value('zoom', 1.25));
  const scale = Number(value('scale', 2));
  if (!(w > 0 && h > 0 && zoom > 0 && scale > 0)) throw new Error('--size WxH, --zoom and --scale must be positive numbers');
  return { w, h, zoom, scale, pixels: `${Math.round(w * scale)}×${Math.round(h * scale)}` };
}

export async function openCapturePage(browser, { w, h, zoom, scale }) {
  return browser.newPage({ viewport: { width: Math.round(w / zoom), height: Math.round(h / zoom) }, deviceScaleFactor: scale * zoom });
}

/**
 * A browser for recording: rendering at the capture's pixel density from the start (rather than per screenshot),
 * so Chrome's screencast streams full-size frames as fast as the page repaints.
 */
export async function launchForRecording(chromium, { w, h, zoom, scale }) {
  const args = [`--force-device-scale-factor=${scale * zoom}`, ...fakeMic()];
  // Google Chrome when installed (as on a Mac), otherwise Playwright's own Chromium.
  const browser = await chromium.launch({ channel: 'chrome', args }).catch(() => chromium.launch({ args }));
  const page = await (await browser.newContext({ viewport: null })).newPage();
  await page.setViewportSize({ width: Math.round(w / zoom), height: Math.round(h / zoom) });
  return { browser, page };
}
