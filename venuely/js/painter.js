// Painter: assets describe themselves as a list of simple solids in a local
// (element) frame: x right, y down (toward the "front"), z up, metres.
// The renderer projects the very same list for both the flat 2D and the
// isometric view, so every asset only has to be modelled once.

import { DEG, regPoly } from './util.js';

/*
 Primitive kinds
  s  : solid. Base polygon `b` at height z, extruded h up to the top polygon `t`
       (t === b scaled about the centroid -> prism / frustum / pyramid). h = 0 is a flat decal.
  q  : free 3D polygon `p` ([x,y,z]...). `out` = an interior point so the normal faces away from it.
  t  : text lying flat on the ground plane at height z.
  tv : text standing on a vertical plane facing local +y (only drawn in isometric).
 Shared options: c colour, tc top colour, fc side colours (cycled), a alpha,
 a2 alpha used in 2D only, st stroke colour, sw stroke width, o2 / o3 = draw only in 2D / isometric.
*/

export class Painter {
  constructor() {
    this.prims = [];
    this.stack = [{ c: 1, s: 0, x: 0, y: 0 }];
  }

  get m() { return this.stack[this.stack.length - 1]; }

  /** Push a child frame at (x,y) rotated by deg. */
  push(x = 0, y = 0, deg = 0) {
    const m = this.m, a = deg * DEG, c = Math.cos(a), s = Math.sin(a);
    this.stack.push({
      c: m.c * c - m.s * s, s: m.s * c + m.c * s,
      x: m.c * x - m.s * y + m.x, y: m.s * x + m.c * y + m.y,
    });
  }
  pop() { this.stack.pop(); }
  pt(x, y) { const m = this.m; return [m.c * x - m.s * y + m.x, m.s * x + m.c * y + m.y]; }
  get ang() { const m = this.m; return Math.atan2(m.s, m.c) / DEG; }

  // ---- generic solids ----------------------------------------------------
  solid(b, z, h, sc, c, o = {}) {
    let cx = 0, cy = 0;
    for (const p of b) { cx += p[0]; cy += p[1]; }
    cx /= b.length; cy /= b.length;
    const sx = Array.isArray(sc) ? sc[0] : sc, sy = Array.isArray(sc) ? sc[1] : sc;
    const B = b.map((p) => this.pt(p[0], p[1]));
    const T = h === 0 ? B : b.map((p) => this.pt(cx + (p[0] - cx) * sx, cy + (p[1] - cy) * sy));
    this.prims.push({ k: 's', b: B, t: T, z, h, c, ...o });
  }
  prism(b, z, h, c, o) { this.solid(b, z, h, 1, c, o); }
  frustum(b, z, h, sc, c, o) { this.solid(b, z, h, sc, c, o); }

  /** Box centred on (cx,cy). */
  box(cx, cy, z, w, d, h, c, o) {
    this.solid([[cx - w / 2, cy - d / 2], [cx + w / 2, cy - d / 2], [cx + w / 2, cy + d / 2], [cx - w / 2, cy + d / 2]], z, h, 1, c, o);
  }
  /** Box given by its min corner and size. */
  boxAt(x, y, z, w, d, h, c, o) { this.box(x + w / 2, y + d / 2, z, w, d, h, c, o); }
  cyl(cx, cy, z, r, h, c, o = {}, seg = 16) { this.solid(regPoly(seg, r, cx, cy, 45), z, h, 1, c, o); }
  cone(cx, cy, z, r, h, c, o = {}, seg = 12, topScale = 0) { this.solid(regPoly(seg, r, cx, cy, 45), z, h, topScale, c, o); }
  /** Flat polygon decal at height z. */
  flat(b, z, c, o) { this.solid(b, z, 0, 1, c, o); }
  frect(cx, cy, z, w, d, c, o) { this.box(cx, cy, z, w, d, 0, c, o); }
  disc(cx, cy, z, r, c, o = {}, seg = 20) { this.flat(regPoly(seg, r, cx, cy), z, c, o); }

  /** Free 3D polygon (e.g. awnings, gable ends, speaker cones). */
  quad(pts, c, o = {}) {
    const p = pts.map(([x, y, z]) => { const [wx, wy] = this.pt(x, y); return [wx, wy, z]; });
    const out = o.out ? [...this.pt(o.out[0], o.out[1]), o.out[2]] : null;
    this.prims.push({ k: 'q', p, c, ...o, out });
  }
  /** Circle drawn on the vertical plane y = const facing +y. */
  vcircle(cx, y, cz, r, c, o) {
    const pts = [];
    for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; pts.push([cx + r * Math.cos(a), y, cz + r * Math.sin(a)]); }
    this.quad(pts, c, { ...o, out: [cx, y - 1, cz] });
  }

  text(x, y, z, s, size, c, o = {}) {
    const [wx, wy] = this.pt(x, y);
    this.prims.push({ k: 't', x: wx, y: wy, z, s, size, c, rot: (o.rot || 0) + this.ang, bold: o.bold !== false, a: o.a, o2: o.o2, o3: o.o3 });
  }
  vtext(x, y, z, s, size, c, o = {}) {
    const [wx, wy] = this.pt(x, y);
    this.prims.push({ k: 'tv', x: wx, y: wy, z, s, size, c, ang: this.ang, bold: true, o3: true });
  }
}
