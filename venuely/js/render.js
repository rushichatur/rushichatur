// Camera + renderer. One scene, two views:
//   '2d'  : flat top-down plan
//   'iso' : true isometric (30°), rotatable in 90° steps

import { ASSETS } from './assets.js';
import { Painter } from './painter.js';
import { layoutOf } from './layout.js';
import { DEG, clamp, shade, rot2, hull, luminance } from './util.js';
import { planMap, imageFor, isActive, attributionFor } from './maps.js';

const C30 = Math.cos(Math.PI / 6), S30 = 0.5;

export const GROUNDS = {
  grass: { name: 'Grass', top: '#8bd066', side: '#6bab4d', grid: [0, 0.07], bg: '#eaf2f8', ink: '#1f2937' },
  sand: { name: 'Sand / beach', top: '#f0dca4', side: '#d2bb80', grid: [0, 0.08], bg: '#eaf2f8', ink: '#1f2937' },
  concrete: { name: 'Concrete / indoor', top: '#d9dde3', side: '#b5bbc4', grid: [0, 0.09], bg: '#eef1f5', ink: '#1f2937' },
  paper: { name: 'Cream paper', top: '#f3ecdc', side: '#ee7fb0', grid: [0, 0.09], bg: '#efe7d3', ink: '#1f2937' },
  snow: { name: 'Snow', top: '#f4f8fc', side: '#cfdae6', grid: [0, 0.08], bg: '#dfe9f3', ink: '#1f2937' },
  night: { name: 'Night', top: '#2b303a', side: '#1b1f27', grid: [255, 0.07], bg: '#13161c', ink: '#e7ebf2' },
};

const LIGHT = (() => { const l = [0.3, 0.6, 0.75], n = Math.hypot(...l); return l.map((v) => v / n); })();
const TOP_DOT = LIGHT[2];

export class Camera {
  constructor() { this.mode = 'iso'; this.yaw = 0; this.zoom = 18; this.px = 0; this.py = 0; }
  clone() { return Object.assign(new Camera(), this); }

  _rot(x, y) { const a = this.yaw * DEG, c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; }

  project(x, y, z = 0) {
    if (this.mode === '2d') return [x * this.zoom + this.px, y * this.zoom + this.py];
    const [rx, ry] = this._rot(x, y);
    return [(rx - ry) * C30 * this.zoom + this.px, (rx + ry) * S30 * this.zoom - z * this.zoom + this.py];
  }

  /** Screen point -> world point on the ground plane (z = 0). */
  unproject(sx, sy) {
    if (this.mode === '2d') return [(sx - this.px) / this.zoom, (sy - this.py) / this.zoom];
    const u = (sx - this.px) / this.zoom / C30, v = (sy - this.py) / this.zoom / S30;
    const rx = (u + v) / 2, ry = (v - u) / 2;
    return rot2(rx, ry, -this.yaw);
  }

  /** Affine matrix mapping world (x,y) at height z to the screen. */
  basis(z = 0) {
    const p0 = this.project(0, 0, z), px = this.project(1, 0, z), py = this.project(0, 1, z);
    return [px[0] - p0[0], px[1] - p0[1], py[0] - p0[0], py[1] - p0[1], p0[0], p0[1]];
  }

  viewN(nx, ny, nz) {
    if (this.mode === '2d') return [nx, ny, nz];
    const [a, b] = this._rot(nx, ny);
    return [a, b, nz];
  }
  visible(n) { return this.mode === '2d' ? n[2] > 0.05 : n[0] + n[1] + n[2] > 0.001; }
  depth(x, y, z) {
    if (this.mode === '2d') return z;
    const [rx, ry] = this._rot(x, y);
    return rx + ry + z;
  }

  /** Fit a set of world points [x,y,z] into a W×H viewport. */
  fit(points, W, H, margin = 40) {
    const keep = { zoom: this.zoom, px: this.px, py: this.py };
    this.zoom = 1; this.px = 0; this.py = 0;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y, z] of points) {
      const [sx, sy] = this.project(x, y, z || 0);
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    const bw = Math.max(1e-3, x1 - x0), bh = Math.max(1e-3, y1 - y0);
    if (!isFinite(bw)) { Object.assign(this, keep); return; }
    this.zoom = clamp(Math.min((W - margin * 2) / bw, (H - margin * 2) / bh), 2, 120);
    this.px = W / 2 - ((x0 + x1) / 2) * this.zoom;
    this.py = H / 2 - ((y0 + y1) / 2) * this.zoom;
  }

  zoomAt(sx, sy, factor) {
    const [wx, wy] = this.unproject(sx, sy);
    this.zoom = clamp(this.zoom * factor, 2, 140);
    const [nx, ny] = this.project(wx, wy, 0);
    this.px += sx - nx; this.py += sy - ny;
  }
}

// ---------------------------------------------------------------------------
export function primsOf(o) {
  if (o._pr && o._prRev === o.rev) return o._pr;
  const P = new Painter();
  const a = ASSETS[o.type];
  try { a.build(o, P); } catch (e) { console.error('build failed for', o.type, e); }
  o._pr = P.prims; o._prRev = o.rev;
  return o._pr;
}

/** World-space box of an object: centre, size and rotation. */
export function boxOf(o) {
  const a = ASSETS[o.type];
  if (a.world) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of o.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, d: y1 - y0, rot: 0, h: 0.05 };
  }
  const lay = layoutOf(o);
  return { cx: o.x, cy: o.y, w: lay.w, d: lay.d, rot: o.rot, h: a.ground ? 0.05 : o.h };
}

export function boxCorners(b, z = 0) {
  const out = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const [rx, ry] = rot2((sx * b.w) / 2, (sy * b.d) / 2, b.rot);
    out.push([b.cx + rx, b.cy + ry, z]);
  }
  return out;
}

export function hullOf(o, cam) {
  const b = boxOf(o);
  const pts = [...boxCorners(b, 0), ...boxCorners(b, b.h)].map(([x, y, z]) => cam.project(x, y, z));
  return hull(pts);
}

// ---------------------------------------------------------------------------
function shadeMul(n) {
  const d = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
  return 0.5 + 0.56 * Math.min(1, d / TOP_DOT);
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

function polyArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
  return Math.abs(a / 2);
}

/** Turn one primitive into drawable commands. `T` = {ca,sa,tx,ty}. */
function emitPrim(pr, T, cam, out, tag) {
  const is2 = cam.mode === '2d';
  if ((pr.o2 && !is2) || (pr.o3 && is2)) return;
  const alpha = is2 && pr.a2 !== undefined ? pr.a2 : pr.a === undefined ? 1 : pr.a;
  const { ca, sa, tx, ty } = T;
  const W = (x, y) => [x * ca - y * sa + tx, x * sa + y * ca + ty];

  if (pr.k === 's') {
    const n = pr.b.length, h = pr.h;
    const B = pr.b.map((p) => W(p[0], p[1])), Tp = h === 0 ? B : pr.t.map((p) => W(p[0], p[1]));
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { cx += B[i][0] + Tp[i][0]; cy += B[i][1] + Tp[i][1]; }
    cx /= 2 * n; cy /= 2 * n;
    const faces = [];
    const pushFace = (ptsW, normal, color) => {
      const nv = cam.viewN(normal[0], normal[1], normal[2]);
      if (!cam.visible(nv)) return;
      faces.push({ pts: ptsW.map((p) => cam.project(p[0], p[1], p[2])), color, m: shadeMul(nv) });
    };
    if (h > 0) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const e1 = [B[j][0] - B[i][0], B[j][1] - B[i][1], 0], e2 = [Tp[i][0] - B[i][0], Tp[i][1] - B[i][1], h];
        let nrm = cross(e1, e2);
        const mx = (B[i][0] + B[j][0]) / 2 - cx, my = (B[i][1] + B[j][1]) / 2 - cy;
        if (nrm[0] * mx + nrm[1] * my < 0) nrm = [-nrm[0], -nrm[1], -nrm[2]];
        if (Math.hypot(nrm[0], nrm[1], nrm[2]) < 1e-9) continue;
        const color = pr.fc ? pr.fc[i % pr.fc.length] : pr.c;
        pushFace([[B[i][0], B[i][1], pr.z], [B[j][0], B[j][1], pr.z], [Tp[j][0], Tp[j][1], pr.z + h], [Tp[i][0], Tp[i][1], pr.z + h]], norm(nrm), color);
      }
    }
    if (h === 0 || polyArea(Tp) > 1e-5) pushFace(Tp.map((p) => [p[0], p[1], pr.z + h]), [0, 0, 1], pr.tc || pr.c);
    if (!faces.length) return;
    out.push({ d: cam.depth(cx, cy, pr.z + h / 2), kind: 'faces', faces, alpha, pr });
    return;
  }

  if (pr.k === 'q') {
    const P3 = pr.p.map(([x, y, z]) => { const [wx, wy] = W(x, y); return [wx, wy, z]; });
    let nrm = norm(cross([P3[1][0] - P3[0][0], P3[1][1] - P3[0][1], P3[1][2] - P3[0][2]], [P3[2][0] - P3[0][0], P3[2][1] - P3[0][1], P3[2][2] - P3[0][2]]));
    let c = [0, 0, 0];
    for (const p of P3) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
    c = c.map((v) => v / P3.length);
    if (pr.out) {
      const [ox, oy] = W(pr.out[0], pr.out[1]);
      if (nrm[0] * (c[0] - ox) + nrm[1] * (c[1] - oy) + nrm[2] * (c[2] - pr.out[2]) < 0) nrm = nrm.map((v) => -v);
    }
    let nv = cam.viewN(nrm[0], nrm[1], nrm[2]);
    if (!cam.visible(nv)) {
      if (!pr.dbl) return;
      nv = nv.map((v) => -v);
      if (!cam.visible(nv)) return;
    }
    out.push({ d: cam.depth(c[0], c[1], c[2]), kind: 'faces', alpha, pr, faces: [{ pts: P3.map((p) => cam.project(p[0], p[1], p[2])), color: pr.c, m: shadeMul(nv) }] });
    return;
  }

  if (pr.k === 't') {
    const [wx, wy] = W(pr.x, pr.y);
    out.push({ d: cam.depth(wx, wy, pr.z), kind: 'text', x: wx, y: wy, z: pr.z, rot: pr.rot + T.rotDeg, s: pr.s, size: pr.size, c: pr.c, bold: pr.bold, alpha: pr.a === undefined ? 1 : pr.a });
    return;
  }

  if (pr.k === 'tv') {
    if (is2) return;
    const [wx, wy] = W(pr.x, pr.y);
    const ang = pr.ang + T.rotDeg;
    const nv = cam.viewN(-Math.sin(ang * DEG), Math.cos(ang * DEG), 0);
    if (!cam.visible(nv)) return;
    out.push({ d: cam.depth(wx, wy, pr.z) + 0.02, kind: 'vtext', x: wx, y: wy, z: pr.z, ang, s: pr.s, size: pr.size, c: pr.c, alpha: 1 });
  }
}

// ---------------------------------------------------------------------------
export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.stats = { prims: 0 };
  }

  /** Emit draw commands for every object. */
  collect(objects, cam, view) {
    const ground = [], items = [], tags = [];
    for (const o of objects) {
      if (o.hidden) continue;
      const a = ASSETS[o.type];
      const prims = primsOf(o);
      const target = a.ground ? ground : items;
      if (a.world) {
        const T = { ca: 1, sa: 0, tx: 0, ty: 0, rotDeg: 0 };
        for (const pr of prims) emitPrim(pr, T, cam, target);
      } else {
        const lay = layoutOf(o);
        // cheap viewport culling: skip elements whose bounding circle is fully off-screen
        const reach = ((Math.hypot(lay.ew, lay.ed) / 2 + (a.ground ? 0 : o.h)) * cam.zoom) * 1.3 + 8;
        for (const el of lay.els) {
          const [ox, oy] = rot2(el.x, el.y, o.rot);
          if (view) {
            const [cx, cy] = cam.project(o.x + ox, o.y + oy, 0);
            if (cx < -reach || cy < -reach - o.h * cam.zoom || cx > view.W + reach || cy > view.H + reach) continue;
          }
          const ang = (o.rot + el.r) * DEG;
          const T = { ca: Math.cos(ang), sa: Math.sin(ang), tx: o.x + ox, ty: o.y + oy, rotDeg: o.rot + el.r };
          for (const pr of prims) emitPrim(pr, T, cam, target);
        }
      }
      if (o.showLabel && !(a.noTag && a.noTag(o))) tags.push(o);
    }
    return { ground, items, tags };
  }

  /**
   * opt: { style, grounds, grid, tags, scaleBar, bg, venue, hideTags, after(ctx,cam) }
   */
  draw(scene, cam, opt = {}) {
    const ctx = this.ctx, cv = this.cv;
    const dpr = opt.dpr || 1;
    const W = cv.width / dpr, H = cv.height / dpr;
    const theme = GROUNDS[scene.meta.ground] || GROUNDS.grass;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (opt.bg !== false) { ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H); }
    this.style = opt.style || 'outline';
    this.cam = cam;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    const mapOn = opt.venue !== false && isActive(scene.meta.map);
    if (mapOn) this.drawMap(scene, cam, theme);

    // venue slab (replaced by the map when one is shown)
    if (opt.venue !== false && !mapOn) {
      const v = scene.meta.venue;
      const slab = { k: 's', b: [[0, 0], [v.w, 0], [v.w, v.d], [0, v.d]], t: [[0, 0], [v.w, 0], [v.w, v.d], [0, v.d]], z: -0.7, h: 0.7, c: theme.side, tc: theme.top };
      const out = [];
      emitPrim(slab, { ca: 1, sa: 0, tx: 0, ty: 0, rotDeg: 0 }, cam, out);
      for (const c of out) this.drawCmd(c, theme.grid[0] ? '#ffffff' : '#000000');
      if (opt.grid !== false) this.drawGrid(scene, cam, theme);
    }
    if (mapOn && opt.grid !== false) this.drawGrid(scene, cam, { ...theme, grid: [255, 0.16] });

    const { ground, items, tags } = this.collect(scene.objects, cam, { W, H });
    this.stats.prims = ground.length + items.length;
    for (const c of ground) this.drawCmd(c);
    items.sort((a, b) => a.d - b.d);
    for (const c of items) this.drawCmd(c);

    for (const o of scene.objects) o._tag = null;
    if (opt.tags !== false) for (const o of tags) this.drawTag(o, cam);

    if (opt.after) opt.after(ctx, cam, W, H);
    if (opt.scaleBar) this.drawScaleBar(cam, W, H, theme, opt.scaleBarX);
    if (mapOn && opt.attrib !== false) this.drawAttribution(scene.meta.map, W, H, opt.attribY);
  }

  /** Map imagery laid flat on the ground plane, plus the venue outline. */
  drawMap(scene, cam, theme) {
    const ctx = this.ctx, map = scene.meta.map, v = scene.meta.venue;
    const plan = planMap(map, v);
    if (!plan) return;
    const m = cam.basis(0);
    const cx = v.w / 2 + map.ox, cy = v.d / 2 + map.oy;
    ctx.save();
    ctx.globalAlpha = clamp(map.opacity, 0, 1);
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.translate(cx, cy);
    ctx.rotate(map.rot * DEG);
    ctx.imageSmoothingQuality = 'high';
    for (const it of plan.items) {
      const e = imageFor(it.url);
      if (e.state === 'ok') {
        const ov = it.w / 256 * 0.35; // hide hairline seams between neighbouring tiles
        ctx.drawImage(e.img, it.x0 - ov / 2, it.y0 - ov / 2, it.w + ov, it.h + ov);
      } else if (e.state === 'loading') {
        ctx.fillStyle = 'rgba(120,130,150,.12)'; ctx.fillRect(it.x0, it.y0, it.w, it.h);
      }
    }
    ctx.restore();
    // venue outline so the editable area stays visible on top of busy imagery
    ctx.save();
    ctx.lineJoin = 'round';
    const pts = [[0, 0], [v.w, 0], [v.w, v.d], [0, v.d]].map(([x, y]) => cam.project(x, y, 0));
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.setLineDash([9, 6]); ctx.stroke();
    ctx.restore();
  }

  drawAttribution(map, W, H, y) {
    const yy = y == null ? H - 22 : y;
    const t = attributionFor(map);
    if (!t) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '500 10.5px Inter, system-ui, sans-serif';
    const w = ctx.measureText(t).width + 14;
    ctx.fillStyle = 'rgba(255,255,255,.82)';
    ctx.beginPath(); roundRect(ctx, W / 2 - w / 2, yy, w, 17, 6); ctx.fill();
    ctx.fillStyle = '#334155'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t, W / 2, yy + 9);
    ctx.restore();
  }

  drawCmd(c) {
    const ctx = this.ctx, cam = this.cam;
    if (c.kind === 'faces') {
      const pr = c.pr;
      ctx.globalAlpha = c.alpha;
      for (const f of c.faces) {
        const p = f.pts;
        ctx.beginPath();
        ctx.moveTo(p[0][0], p[0][1]);
        for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
        ctx.closePath();
        const none = f.color === 'none' || pr.nofill;
        const fill = none ? null : shade(f.color, f.m);
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (pr.st) {
          ctx.strokeStyle = pr.st; ctx.lineWidth = pr.sw || 1;
          if (pr.dash) ctx.setLineDash(pr.dash);
          ctx.stroke();
          if (pr.dash) ctx.setLineDash([]);
        } else if (pr.ns) {
          if (fill) { ctx.strokeStyle = fill; ctx.lineWidth = 0.6; ctx.stroke(); }
        } else if (this.style === 'outline') {
          ctx.strokeStyle = '#1e2433'; ctx.lineWidth = clamp(cam.zoom * 0.045, 0.7, 1.5); ctx.stroke();
        } else if (fill) {
          ctx.strokeStyle = shade(f.color, f.m * 0.82); ctx.lineWidth = 0.8; ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    } else if (c.kind === 'text') {
      const m = cam.basis(c.z);
      ctx.save();
      ctx.globalAlpha = c.alpha;
      ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot * DEG);
      ctx.scale(0.01, 0.01);
      ctx.font = `${c.bold ? 800 : 500} ${c.size * 100}px "Inter", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = c.c;
      ctx.fillText(c.s, 0, 0);
      ctx.restore();
    } else if (c.kind === 'vtext') {
      const a = c.ang * DEG;
      const p0 = cam.project(c.x, c.y, c.z), p1 = cam.project(c.x + Math.cos(a), c.y + Math.sin(a), c.z);
      ctx.save();
      ctx.transform(p1[0] - p0[0], p1[1] - p0[1], 0, cam.zoom, p0[0], p0[1]);
      ctx.scale(0.01, 0.01);
      ctx.font = `800 ${c.size * 100}px "Inter", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = c.c;
      ctx.fillText(c.s, 0, 0);
      ctx.restore();
    }
  }

  drawGrid(scene, cam, theme) {
    const ctx = this.ctx, v = scene.meta.venue;
    const px = cam.zoom;
    const step = px >= 12 ? 1 : px >= 5 ? 5 : 10;
    const [tone, a] = theme.grid, col = tone ? '255,255,255' : '0,0,0';
    ctx.lineWidth = 1;
    for (let x = 0; x <= v.w + 1e-6; x += step) {
      const major = Math.round(x) % 5 === 0;
      ctx.strokeStyle = `rgba(${col},${major ? a * 1.7 : a})`;
      const p = cam.project(x, 0, 0), q = cam.project(x, v.d, 0);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    }
    for (let y = 0; y <= v.d + 1e-6; y += step) {
      const major = Math.round(y) % 5 === 0;
      ctx.strokeStyle = `rgba(${col},${major ? a * 1.7 : a})`;
      const p = cam.project(0, y, 0), q = cam.project(v.w, y, 0);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    }
  }

  drawTag(o, cam) {
    const ctx = this.ctx, a = ASSETS[o.type];
    const text = (o.label || o.name || '').toString();
    if (!text) return;
    let ax, ay, az;
    if (a.world) {
      const b = boxOf(o);
      ax = b.cx; ay = b.cy; az = 0.2;
      if (a.poly) { let sx = 0, sy = 0; for (const p of o.pts) { sx += p[0]; sy += p[1]; } ax = sx / o.pts.length; ay = sy / o.pts.length; }
    } else {
      ax = o.x; ay = o.y; az = a.ground ? 0.2 : o.h;
    }
    const [sx, sy] = cam.project(ax, ay, az);
    const isLabel = o.type === 'label';
    const bg = isLabel ? o.color : '#ffffff', fg = isLabel ? o.color2 : '#1f2937';
    const fs = 12;
    ctx.font = `700 ${fs}px "Inter", system-ui, sans-serif`;
    const tw = ctx.measureText(text).width;
    const padX = 9, h = 22, w = tw + padX * 2 + (a.ground && !isLabel ? 14 : 0);
    const x = sx - w / 2, y = sy - h - 7 - (a.ground ? 0 : 2);
    ctx.save();
    ctx.shadowColor = 'rgba(15,23,42,.28)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    ctx.fillStyle = bg;
    ctx.beginPath(); roundRect(ctx, x, y, w, h, 11); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sx - 5, y + h - 0.5); ctx.lineTo(sx + 5, y + h - 0.5); ctx.lineTo(sx, y + h + 6); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (a.ground && !isLabel) { ctx.fillStyle = o.color || '#4dabf7'; ctx.beginPath(); ctx.arc(x + 12, y + h / 2, 4.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + padX + (a.ground && !isLabel ? 14 : 0), y + h / 2 + 0.5);
    o._tag = { x, y, w, h: h + 7 };
  }

  drawScaleBar(cam, W, H, theme, x0 = 18) {
    const ctx = this.ctx;
    const nice = [1, 2, 5, 10, 20, 50, 100];
    let m = nice.find((n) => n * cam.zoom >= 70) || 100;
    const len = m * cam.zoom, x = x0, y = H - 22;
    ctx.save();
    ctx.strokeStyle = theme.ink === '#1f2937' ? '#1f2937' : '#e7ebf2';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + len, y); ctx.lineTo(x + len, y - 5); ctx.stroke();
    ctx.font = '600 11px "Inter", system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${m} m`, x + 4, y - 4);
    ctx.restore();
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
