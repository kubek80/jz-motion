import '@fontsource/caveat/700.css';
import { compile, Stage } from '../engine';
import { stateAt, type Performance } from '../video/performance';

// The page video export drives: just the board, full window, drawn frame by frame on request.
// Opened as /?render by the exporter (server/export.ts).

export interface RenderApi {
  load(presentation: unknown, performance: Performance): Promise<void>;
  frame(time: number): void;
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
    const r = compile(presentation);
    if (!r.ok) throw new Error(r.errors.join('\n'));
    await stage.load(r.presentation);
    await document.fonts.ready;
    perf = performance;
  },
  frame(time) {
    const st = stateAt(perf, time);
    stage.renderAt(st.scene, st.time, time);
  },
};
