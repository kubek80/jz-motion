import '@fontsource/caveat/700.css';
import '@fontsource/bungee/400.css';
import '@fontsource/jetbrains-mono/500.css';
import { compile, Stage } from '../engine';
import { loadUserLibrary } from '../app/userLibrary';
import { stateAt, type Performance } from '../video/performance';

// The page video export drives: just the board, full window, drawn frame by frame on request.
// Opened as /?render by the exporter (server/export.ts).

export interface RenderApi {
  load(presentation: unknown, performance: Performance): Promise<void>;
  /**
   * Draws the frame at export time `time`. With `previous` (the export time of the frame before), resolves to
   * true when nothing on the board can have changed since then, so the exporter can repeat that frame.
   */
  frame(time: number, previous?: number): Promise<boolean>;
}

declare global {
  interface Window { jzmRender?: RenderApi }
}

document.body.style.cssText = 'margin:0;overflow:hidden;background:#000';
const host = document.createElement('div');
host.style.cssText = 'position:fixed;inset:0';
document.body.appendChild(host);
const stage = new Stage(host);
let perf: Performance = { events: [], duration: 0 };

window.jzmRender = {
  async load(presentation, performance) {
    await loadUserLibrary();
    const r = compile(presentation);
    if (!r.ok) throw new Error(r.errors.join('\n'));
    await stage.load(r.presentation);
    await document.fonts.ready;
    // Let the browser paint once with everything loaded before the first frame is captured.
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    perf = performance;
  },
  async frame(time, previous) {
    const st = stateAt(perf, time);
    stage.renderAt(st.scene, st.time, time);
    // Recordings seek asynchronously; wait so the capture shows the right frame.
    await stage.settled();
    if (previous === undefined) return false;
    const before = stateAt(perf, previous);
    return before.scene === st.scene && !stage.changesBetween(before.time, st.time);
  },
};
