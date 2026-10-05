// Array modifier: turns one element into a grid / ring / fan of elements.
// Result element positions are relative to the *centre of the whole bounding box*.

import { DEG, rot2 } from './util.js';
import { ASSETS } from './assets.js';

export const DEFAULT_ARRAY = {
  mode: 'grid', cols: 6, rows: 4, gx: 0.1, gy: 0.1,
  blockX: 0, aisleX: 1.2, blockY: 0, aisleY: 1.2,
  count: 12, radius: 3, start: 0, sweep: 360, face: 'in',
};

/** Size of one element including anything that sticks out (e.g. chairs around a table). */
export function elementSize(o) {
  const a = ASSETS[o.type];
  if (a && a.bounds) return a.bounds(o);
  return { w: o.w, d: o.d };
}

function axisPositions(n, size, gap, block, aisle) {
  const pos = [];
  let p = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) { p += gap; if (block > 0 && i % block === 0) p += aisle; }
    pos.push(p + size / 2);
    p += size;
  }
  return { pos, total: p };
}

export function gridExtent(a, n, size, gap, block, aisle) {
  return axisPositions(n, size, gap, block, aisle).total;
}

function bboxOf(els, ew, ed) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of els) {
    const hw = ew / 2, hd = ed / 2;
    for (const [cx, cy] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) {
      const [rx, ry] = rot2(cx, cy, e.r);
      x0 = Math.min(x0, e.x + rx); x1 = Math.max(x1, e.x + rx);
      y0 = Math.min(y0, e.y + ry); y1 = Math.max(y1, e.y + ry);
    }
  }
  return { x0, y0, x1, y1 };
}

/** @returns {{els:{x:number,y:number,r:number}[], w:number, d:number}} */
export function arrayLayout(o) {
  const { w: ew, d: ed } = elementSize(o);
  const a = o.arr;
  if (!a) return { els: [{ x: 0, y: 0, r: 0 }], w: ew, d: ed, ew, ed };

  let els = [];
  if (a.mode === 'grid') {
    const X = axisPositions(Math.max(1, a.cols | 0), ew, a.gx, a.blockX, a.aisleX);
    const Y = axisPositions(Math.max(1, a.rows | 0), ed, a.gy, a.blockY, a.aisleY);
    for (const y of Y.pos) for (const x of X.pos) els.push({ x: x - X.total / 2, y: y - Y.total / 2, r: 0 });
    return { els, w: X.total, d: Y.total, ew, ed };
  }

  if (a.mode === 'circle') {
    const n = Math.max(1, a.count | 0);
    const full = Math.abs(a.sweep) >= 359.9;
    const step = n > 1 ? a.sweep / (full ? n : n - 1) : 0;
    for (let i = 0; i < n; i++) {
      const t = a.start + step * i;
      const x = a.radius * Math.sin(t * DEG), y = -a.radius * Math.cos(t * DEG);
      els.push({ x, y, r: a.face === 'in' ? t : a.face === 'out' ? t + 180 : 0 });
    }
  } else if (a.mode === 'arc') {
    const rows = Math.max(1, a.rows | 0), cols = Math.max(1, a.cols | 0);
    const r0 = Math.max(0.5, a.radius);
    for (let j = 0; j < rows; j++) {
      const R = r0 + j * (ed + a.gy);
      const n = Math.max(1, Math.round((cols * R) / r0));
      for (let i = 0; i < n; i++) {
        const t = a.start + (n > 1 ? (a.sweep / (n - 1)) * i - a.sweep / 2 : 0);
        els.push({ x: R * Math.sin(t * DEG), y: -R * Math.cos(t * DEG), r: a.face === 'out' ? t + 180 : t });
      }
    }
  }

  const bb = bboxOf(els, ew, ed);
  const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
  els = els.map((e) => ({ x: e.x - cx, y: e.y - cy, r: e.r }));
  return { els, w: bb.x1 - bb.x0, d: bb.y1 - bb.y0, ew, ed };
}

/** Cached layout (invalidated through o.rev). */
export function layoutOf(o) {
  if (o._lay && o._layRev === o.rev) return o._lay;
  o._lay = arrayLayout(o);
  o._layRev = o.rev;
  return o._lay;
}
