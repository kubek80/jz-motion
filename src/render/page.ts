import '@fontsource/caveat/700.css';
import '@fontsource/bungee/400.css';
import '@fontsource/jetbrains-mono/500.css';
import { compile, Stage } from '../engine';
import { loadUserLibrary } from '../app/userLibrary';
import { stateAt, type Performance } from '../video/performance';
import { avatarFrame, planAvatar, type AvatarPlan, type AvatarSource } from '../video/avatarPlan';
import { AvatarLayer } from './avatarLayer';

// The page video export drives: the board and your avatar (from the voice clips), full window, drawn frame by frame
// on request; the avatar is placed with the board (src/video/avatarPlan.ts), so it glides between places and holds
// its last frame to the end of its scene.
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
const frameEl = document.createElement('div');
frameEl.style.cssText = 'position:fixed;inset:0;background:#000;overflow:hidden';
document.body.appendChild(frameEl);
const host = document.createElement('div');
host.style.cssText = 'position:absolute;inset:0';
frameEl.appendChild(host);
const stage = new Stage(host);
const avatar = new AvatarLayer(frameEl, host);
let perf: Performance = { events: [], duration: 0 };
let plan: AvatarPlan | null = null;

window.jzmRender = {
  async load(presentation, performance) {
    await loadUserLibrary();
    const r = compile(presentation);
    if (!r.ok) throw new Error(r.errors.join('\n'));
    await stage.load(r.presentation);
    plan = planAvatar(r.presentation, presentation as AvatarSource, performance);
    await document.fonts.ready;
    // Let the browser paint once with everything loaded before the first frame is captured.
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    perf = performance;
  },
  async frame(time, previous) {
    const st = stateAt(perf, time);
    const af = plan ? avatarFrame(plan, time) : null;
    if (af) await avatar.show(af, { exact: true });
    stage.renderAt(st.scene, st.time, time);
    // Recordings seek asynchronously; wait so the capture shows the right frame.
    await stage.settled();
    // A recording that finished loading meanwhile has its plays hooked up only now: draw the frame again with them.
    for (let i = 0; i < 3 && stage.redrawNeeded(); i++) {
      stage.renderAt(st.scene, st.time, time);
      await stage.settled();
    }
    if (previous === undefined) return false;
    const before = stateAt(perf, previous);
    const avatarSame = !plan || AvatarLayer.key(avatarFrame(plan, previous)) === AvatarLayer.key(af!);
    return avatarSame && before.scene === st.scene && !stage.changesBetween(before.time, st.time);
  },
};
