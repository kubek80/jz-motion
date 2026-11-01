import { Euler, Matrix4, Vector3 } from 'three';
import models from './iso-models.json';
import type { ColorName } from './palette';

// Isometric 3D: three.js does the 3D math (rotation, isometric projection); the result is flat SVG paths
// so 3D objects glow, draw on and zoom exactly like the rest of the board. DOM-free.

export interface IsoPart {
  shape: 'box' | 'cylinder';
  /** Width (x), height (y), depth (z) in world units. For a cylinder, x is the diameter. */
  size: [number, number, number];
  /** Center of the part's bottom face. y points up. */
  at: [number, number, number];
  color?: ColorName;
}

export interface IsoModel { description: string; parts: IsoPart[] }
export const isoModels: Record<string, IsoModel> = { ...(models as unknown as Record<string, IsoModel>) };

/** 3D models made in the app (library/), added at runtime. */
export function addIsoModels(more: Record<string, IsoModel>) {
  Object.assign(isoModels, more);
}

export interface IsoView {
  /** Turn around the vertical axis, degrees. */
  rotate: number;
  /** 0 = assembled; 1 = parts pushed apart to twice their distance from the middle. */
  explode: number;
}

export interface IsoFace {
  part: number;
  /** Closed path in the element's local board coordinates. */
  d: string;
}

const ISO_TILT = Math.atan(1 / Math.SQRT2); // 35.26°: the classic isometric elevation
const CYLINDER_SEGMENTS = 40;

function viewMatrix(rotate: number): Matrix4 {
  return new Matrix4().makeRotationFromEuler(new Euler(ISO_TILT, ((rotate + 45) * Math.PI) / 180, 0, 'XYZ'));
}

function partCenter(parts: IsoPart[]): Vector3 {
  const c = new Vector3();
  for (const p of parts) c.add(new Vector3(p.at[0], p.at[1] + p.size[1] / 2, p.at[2]));
  return c.divideScalar(Math.max(parts.length, 1));
}

/** Corner loops (in world space) of each face of a part, with outward normals. */
function partFaces(p: IsoPart, offset: Vector3): { loop: Vector3[]; normal: Vector3; side?: boolean }[] {
  const [w, h, dpt] = p.size;
  const base = new Vector3(p.at[0], p.at[1], p.at[2]).add(offset);
  if (p.shape === 'box') {
    const x0 = base.x - w / 2, x1 = base.x + w / 2;
    const y0 = base.y, y1 = base.y + h;
    const z0 = base.z - dpt / 2, z1 = base.z + dpt / 2;
    const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
    return [
      { loop: [v(x0, y1, z0), v(x1, y1, z0), v(x1, y1, z1), v(x0, y1, z1)], normal: v(0, 1, 0) },
      { loop: [v(x0, y0, z0), v(x0, y0, z1), v(x1, y0, z1), v(x1, y0, z0)], normal: v(0, -1, 0) },
      { loop: [v(x0, y0, z1), v(x0, y1, z1), v(x1, y1, z1), v(x1, y0, z1)], normal: v(0, 0, 1) },
      { loop: [v(x0, y0, z0), v(x1, y0, z0), v(x1, y1, z0), v(x0, y1, z0)], normal: v(0, 0, -1) },
      { loop: [v(x1, y0, z0), v(x1, y0, z1), v(x1, y1, z1), v(x1, y1, z0)], normal: v(1, 0, 0) },
      { loop: [v(x0, y0, z0), v(x0, y1, z0), v(x0, y1, z1), v(x0, y0, z1)], normal: v(-1, 0, 0) },
    ];
  }
  const r = w / 2;
  const ring = (y: number) => Array.from({ length: CYLINDER_SEGMENTS }, (_, i) => {
    const a = (i / CYLINDER_SEGMENTS) * Math.PI * 2;
    return new Vector3(base.x + r * Math.cos(a), y, base.z + r * Math.sin(a));
  });
  return [
    { loop: ring(base.y + h), normal: new Vector3(0, 1, 0) },
    { loop: ring(base.y), normal: new Vector3(0, -1, 0) },
    { loop: [], normal: new Vector3(), side: true },
  ];
}

/** Faces to draw, back to front, plus the 2D bounds. */
export function projectIso(parts: IsoPart[], view: IsoView, scale: number): { faces: IsoFace[]; box: { x: number; y: number; width: number; height: number } } {
  const m = viewMatrix(view.rotate);
  const center = partCenter(parts);
  const toScreen = (v: Vector3) => {
    const p = v.clone().sub(center).applyMatrix4(m);
    return { x: p.x * scale, y: -p.y * scale, z: p.z };
  };
  const path = (pts: { x: number; y: number }[]) => `M${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L')}Z`;
  const viewNormal = (n: Vector3) => n.clone().applyMatrix4(m).z;

  const placed = parts.map((p, i) => {
    const own = new Vector3(p.at[0], p.at[1] + p.size[1] / 2, p.at[2]);
    const offset = own.clone().sub(center).multiplyScalar(view.explode);
    const c = own.clone().add(offset);
    const [w, h, d] = p.size;
    return {
      p, i, offset,
      depth: toScreen(c).z,
      min: new Vector3(c.x - w / 2, c.y - h / 2, c.z - d / 2),
      max: new Vector3(c.x + w / 2, c.y + h / 2, c.z + d / 2),
    };
  });
  const ordered = paintOrder(placed, new Vector3(0, 0, 1).applyMatrix4(m.clone().invert()));

  const faces: IsoFace[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (pts: { x: number; y: number }[]) => {
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
  };

  for (const { p, i, offset } of ordered) {
    const all = partFaces(p, offset);
    const side = all.find((f) => f.side);
    const caps = all.filter((f) => !f.side);
    // Back faces are hidden for these convex shapes; front faces of one part never overlap.
    for (const f of caps) {
      if (viewNormal(f.normal) <= 1e-6) continue;
      const pts = f.loop.map(toScreen);
      grow(pts);
      faces.push({ part: i, d: path(pts) });
    }
    if (side) {
      // Cylinder wall: the front half of the bottom rim, then the front half of the top rim back again.
      const [top, bottom] = caps;
      const front = (v: Vector3, c: Vector3) => viewNormal(v.clone().sub(c).setY(0)) >= 0;
      const topC = top.loop.reduce((a, b) => a.add(b), new Vector3()).divideScalar(top.loop.length);
      const botC = bottom.loop.reduce((a, b) => a.add(b), new Vector3()).divideScalar(bottom.loop.length);
      const arc = (loop: Vector3[], c: Vector3) => {
        // Rotate the ring so the visible run is contiguous.
        const vis = loop.map((v) => front(v, c));
        const start = vis.findIndex((v, k) => v && !vis[(k - 1 + vis.length) % vis.length]);
        const run: Vector3[] = [];
        for (let k = 0; k < loop.length; k++) {
          const idx = (Math.max(start, 0) + k) % loop.length;
          if (vis[idx]) run.push(loop[idx]);
        }
        return run;
      };
      const pts = [...arc(bottom.loop, botC), ...arc(top.loop, topC).reverse()].map(toScreen);
      grow(pts);
      // Walls go under the top cap: insert before this part's caps.
      const firstCap = faces.findIndex((f) => f.part === i);
      faces.splice(firstCap < 0 ? faces.length : firstCap, 0, { part: i, d: path(pts) });
    }
  }
  return { faces, box: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } };
}

type Placed = { depth: number; min: Vector3; max: Vector3 };

/**
 * Back-to-front order for axis-aligned parts. A part is drawn first when it is entirely below the other,
 * or entirely on the far side of it along x or z (as seen from `toCamera`). Parts with no such separation
 * fall back to their center depth.
 */
function paintOrder<T extends Placed>(items: T[], toCamera: Vector3): T[] {
  const eps = 1e-6;
  const behind = (a: T, b: T): boolean | undefined => {
    if (a.max.y <= b.min.y + eps) return true;
    if (b.max.y <= a.min.y + eps) return false;
    for (const axis of ['x', 'z'] as const) {
      if (a.max[axis] <= b.min[axis] + eps) return toCamera[axis] > 0;
      if (b.max[axis] <= a.min[axis] + eps) return toCamera[axis] < 0;
    }
    return undefined;
  };
  const before = items.map(() => new Set<number>());
  items.forEach((a, i) => items.forEach((b, j) => {
    if (i < j) {
      const r = behind(a, b) ?? a.depth < b.depth;
      before[r ? j : i].add(r ? i : j);
    }
  }));
  const out: T[] = [];
  const done = new Set<number>();
  while (out.length < items.length) {
    // Among parts whose "behind" parts are all drawn, take the farthest; break cycles by depth.
    const ready = items.map((_, i) => i).filter((i) => !done.has(i) && [...before[i]].every((j) => done.has(j)));
    const pool = ready.length ? ready : items.map((_, i) => i).filter((i) => !done.has(i));
    const next = pool.reduce((a, b) => (items[a].depth <= items[b].depth ? a : b));
    done.add(next);
    out.push(items[next]);
  }
  return out;
}

export function resolveIsoParts(el: { model?: string; parts?: IsoPart[] }): IsoPart[] {
  if (el.parts?.length) return el.parts;
  return isoModels[el.model ?? '']?.parts ?? [];
}
