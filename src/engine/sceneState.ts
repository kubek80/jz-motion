// A scene's elements outside the timeline: putting them into a given state (the scene's start), and
// redrawing each frame what is computed rather than tweened (pictures, charts, 3D, flows).
import gsap from 'gsap';
import { renderChart } from './chart';
import type { ElementState } from './compile';
import { palette } from './palette';
import { FLOW_PERIOD, partState, renderImage, renderIso, type ElementNodes, type FlowState } from './stageNodes';

export function applyState(nodes: Map<string, ElementNodes>, flows: Map<string, FlowState>, states: Record<string, ElementState>) {
  for (const [id, s] of Object.entries(states)) {
    const n = nodes.get(id);
    if (!n) continue;
    gsap.set(n.outer, { x: s.x, y: s.y, opacity: s.visible ? 1 : 0, color: palette[s.color], filter: 'blur(0px)' });
    for (const part of n.parts) gsap.set(...partState(part, true));
    if (n.iso && s.iso) {
      Object.assign(n.iso.view, { rotate: s.iso.rotate, explode: s.iso.explode });
      Object.assign(n.iso.spin, { on: s.iso.spin === null ? 0 : 1, speed: s.iso.spin ?? 30 });
      n.iso.phase = 0;
      n.iso.progress.forEach((c) => (c.v = 1));
    }
    if (n.chart && s.chart) {
      s.chart.values.forEach((v, i) => (n.chart!.values[i].v = v));
      n.chart.growth.forEach((c) => (c.v = 1));
      n.chart.intro.v = 1;
      renderChart(n.chart);
    }
    if (n.flowPath) flows.set(id, { on: s.flow ? 1 : 0, dir: s.flow?.reverse ? -1 : 1, speed: s.flow?.speed ?? 160 });
  }
}

/** Pictures, charts, 3D (spinning by `dt` seconds) and flows (at `ambient` seconds on the clock). */
export function redrawComputed(nodes: Map<string, ElementNodes>, flows: Map<string, FlowState>, dt: number, ambient: number) {
  for (const n of nodes.values()) {
    if (n.image) renderImage(n);
    if (n.idle) {
      // 0 → 1 → 0 on a smooth curve (like a sine yoyo), from the clock, so exports land on exact positions.
      const k = 0.5 - 0.5 * Math.cos(2 * Math.PI * (ambient / n.idle.period + n.idle.phase));
      const i = n.idle;
      i.g.setAttribute('transform', `translate(0 ${(-i.rise * k).toFixed(3)}) rotate(${(i.turn * k).toFixed(3)} ${i.cx} ${i.cy})`);
    }
  }
  for (const n of nodes.values()) {
    if (n.chart) renderChart(n.chart);
    if (!n.iso) continue;
    if (n.iso.spin.on > 0.5) n.iso.phase += dt * n.iso.spin.speed;
    renderIso(n.iso);
  }
  for (const [id, f] of flows) {
    const path = nodes.get(id)?.flowPath;
    if (!path) continue;
    path.style.opacity = f.on > 0.5 ? '1' : '0';
    path.style.strokeDashoffset = String(-((ambient * f.speed * f.dir) % FLOW_PERIOD));
  }
}
