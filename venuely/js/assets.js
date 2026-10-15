// Asset library. Every asset describes itself with Painter primitives in a local
// frame (x right, y = "front", z up, metres) and exposes a property schema that
// the properties panel renders automatically.

import { regPoly, shade, mix, prand, DEG } from './util.js';

export const ASSETS = {};
export const CATEGORIES = ['Seating', 'Tables', 'Stage & AV', 'Truss & Lights', 'Tents', 'Vendors & Services', 'Structures', 'Nature', 'Ground & Zones'];

// ---- schema helpers -------------------------------------------------------
const sel = (k, l, o, extra) => ({ k, l, t: 'sel', o, ...extra });
const num = (k, l, min, max, step, extra) => ({ k, l, t: 'num', min, max, step, ...extra });
const col = (k, l, extra) => ({ k, l, t: 'color', ...extra });
const bool = (k, l, extra) => ({ k, l, t: 'bool', ...extra });
const txt = (k, l, extra) => ({ k, l, t: 'text', ...extra });

function def(id, cfg) {
  ASSETS[id] = { id, p: {}, schema: [], resize: { w: 1, d: 1, h: 1 }, ...cfg };
}

export const SURFACES = {
  asphalt: { name: 'Asphalt road', c: '#555b66' },
  paver: { name: 'Paved path', c: '#e8dbc0' },
  concrete: { name: 'Concrete', c: '#c7ccd3' },
  gravel: { name: 'Gravel', c: '#bfb8ab' },
  sand: { name: 'Sand', c: '#eed9a2' },
  carpet: { name: 'Red carpet', c: '#c9333f' },
  wood: { name: 'Wood floor', c: '#c99d68' },
  grass: { name: 'Grass', c: '#7cc468' },
  water: { name: 'Water', c: '#6cb8ea' },
};
const SURF_OPTS = Object.entries(SURFACES).map(([k, v]) => [k, v.name]);

const RAINBOW = ['#ff4d6d', '#ffd23f', '#3bceac', '#4cc9f0', '#b57bff'];
const METAL = '#9aa3ae', DARK = '#2a2e37', BLACK = '#1b1e25', WOOD = '#b9854f';

// ---- shared sub-builders ---------------------------------------------------
function chairBuild(P, w, d, h, c, c2, style = 'standard') {
  const sh = h * 0.5;
  if (style !== 'padded') {
    const lx = w / 2 - 0.04, ly = d / 2 - 0.04;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) P.box(sx * lx, sy * ly, 0, 0.035, 0.035, sh - 0.04, METAL);
    P.box(0, 0, sh - 0.05, w, d, 0.05, c);
  } else {
    P.box(0, 0, 0, w * 0.82, d * 0.82, sh - 0.1, shade(c, 0.78));
    P.box(0, 0, sh - 0.1, w, d, 0.1, c, { tc: shade(c, 1.12) });
  }
  if (style === 'standard') P.box(0, -d / 2 + 0.03, sh, w - 0.02, 0.04, h - sh, c2);
  if (style === 'padded') P.box(0, -d / 2 + 0.04, sh, w, 0.08, h - sh, c2);
}

function fixture(P, x, y, z, type, color, beam) {
  // z is the underside of the truss the fixture is clamped to
  if (type === 'moving') {
    P.box(x, y, z - 0.14, 0.2, 0.2, 0.14, DARK);
    P.cyl(x, y, z - 0.52, 0.14, 0.38, color, {}, 10);
    P.cyl(x, y, z - 0.54, 0.1, 0.04, '#fff7d6', { ns: true }, 10);
  } else if (type === 'spot') {
    P.box(x, y, z - 0.1, 0.12, 0.12, 0.1, DARK);
    P.cyl(x, y, z - 0.52, 0.17, 0.42, color, {}, 12);
  } else {
    P.box(x, y, z - 0.08, 0.1, 0.1, 0.08, DARK);
    P.cyl(x, y, z - 0.38, 0.11, 0.3, color, {}, 10);
  }
  if (beam) {
    P.solid(regPoly(14, 1.2, x, y), 0.01, Math.max(0.1, z - 0.5), [0.08, 0.08], color, { a: 0.13, ns: true, a2: 0.2 });
  }
}

/** One axis-aligned truss section from a to b (3D points), cross-section s. */
function trussSeg(P, a, b, s, style, color) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz);
  if (L < 0.05) return;
  const A = [dx / L, dy / L, dz / L];
  let U, V;
  if (Math.abs(A[2]) > 0.5) { U = [1, 0, 0]; V = [0, 1, 0]; }
  else if (Math.abs(A[0]) > 0.5) { U = [0, 1, 0]; V = [0, 0, 1]; }
  else { U = [1, 0, 0]; V = [0, 0, 1]; }
  const at = (t, u, v) => [a[0] + A[0] * t + U[0] * u + V[0] * v, a[1] + A[1] * t + U[1] * u + V[1] * v, a[2] + A[2] * t + U[2] * u + V[2] * v];
  const th = 0.05, diag = shade(color, 0.8);
  const bar = (c, len) => {
    if (Math.abs(A[0]) > 0.5) P.box(c[0], c[1], c[2] - th / 2, len, th, th, color);
    else if (Math.abs(A[1]) > 0.5) P.box(c[0], c[1], c[2] - th / 2, th, len, th, color);
    else P.box(c[0], c[1], c[2] - len / 2, th, th, len, color);
  };
  const half = s / 2;
  const chords = style === 'flat' ? [[0, -half], [0, half]] : [[-half, -half], [half, -half], [half, half], [-half, half]];
  const piece = 3;
  for (const [u, v] of chords) {
    for (let t0 = 0; t0 < L - 0.001; t0 += piece) {
      const len = Math.min(piece, L - t0);
      bar(at(t0 + len / 2, u, v), len);
    }
  }
  // zig-zag bracing on each face
  const N = Math.max(1, Math.round(L / Math.max(0.45, s * 1.6)));
  const faces = style === 'flat' ? [[0, 'v']] : [[half, 'v'], [-half, 'v'], [half, 'u'], [-half, 'u']];
  for (const [off, spans] of faces) {
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * L, t1 = ((i + 1) / N) * L;
      const lo = -half, hi = half, up = i % 2 === 0;
      const pa = spans === 'v' ? at(t0, off, up ? lo : hi) : at(t0, up ? lo : hi, off);
      const pb = spans === 'v' ? at(t1, off, up ? hi : lo) : at(t1, up ? hi : lo, off);
      const g = 0.04;
      P.quad([pa, pb, [pb[0] + A[0] * g, pb[1] + A[1] * g, pb[2] + A[2] * g], [pa[0] + A[0] * g, pa[1] + A[1] * g, pa[2] + A[2] * g]], diag, { dbl: true, ns: true });
    }
  }
  // 2D plan band so trusses read as solid bands from above
  const top = Math.max(a[2], b[2]) + half;
  if (Math.abs(A[2]) > 0.5) P.frect(a[0], a[1], top + 0.01, s, s, '#d3d8df', { o2: true, st: '#6d7683' });
  else {
    const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
    if (Math.abs(A[0]) > 0.5) P.frect(cx, cy, top + 0.01, L, s, '#d3d8df', { o2: true, st: '#6d7683' });
    else P.frect(cx, cy, top + 0.01, s, L, '#d3d8df', { o2: true, st: '#6d7683' });
  }
}

function lightRow(P, x0, x1, y, z, n, type, color, rainbow, beam) {
  for (let i = 0; i < n; i++) {
    const x = x0 + ((i + 0.5) * (x1 - x0)) / n;
    fixture(P, x, y, z, type, rainbow ? RAINBOW[i % RAINBOW.length] : color, beam);
  }
}

function surfacePolys(P, surf, color, polys, z) {
  for (const poly of polys) P.flat(poly, z, color, { st: shade(color, 0.85), ns: surf !== 'water' });
}

function segmentPoly(a, b, hw) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * hw, ny = (dx / l) * hw;
  return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]];
}

/** Road / path along a polyline (world coords), with surface-specific markings. */
function buildStrip(P, pts, width, surface, colorOverride) {
  const s = SURFACES[surface] || SURFACES.asphalt;
  const c = colorOverride || s.c;
  const hw = width / 2;
  const z = 0.03;
  for (let i = 0; i < pts.length - 1; i++) P.flat(segmentPoly(pts[i], pts[i + 1], hw), z, c, { ns: true });
  // round joins between segments; the two ends stay square so roads run flush to the venue edge
  for (let i = 1; i < pts.length - 1; i++) P.disc(pts[i][0], pts[i][1], z, hw, c, { ns: true }, 18);
  const lineAlong = (off, w, color, dash) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
      if (l < 0.01) continue;
      const ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
      const step = dash ? dash[0] + dash[1] : l;
      for (let t = 0; t < l - 0.01; t += step) {
        const t1 = Math.min(l, t + (dash ? dash[0] : l));
        const p0 = [a[0] + ux * t + nx * off, a[1] + uy * t + ny * off];
        const p1 = [a[0] + ux * t1 + nx * off, a[1] + uy * t1 + ny * off];
        P.flat(segmentPoly(p0, p1, w / 2), z + 0.005, color, { ns: true });
      }
    }
  };
  if (surface === 'asphalt' && width >= 2.2) {
    lineAlong(0, 0.14, '#f2cb55', [1.6, 1.4]);
    lineAlong(hw - 0.25, 0.1, '#eceff3');
    lineAlong(-(hw - 0.25), 0.1, '#eceff3');
  } else if (surface === 'carpet') {
    lineAlong(hw - 0.08, 0.06, '#e9c46a');
    lineAlong(-(hw - 0.08), 0.06, '#e9c46a');
  } else if (surface === 'paver') {
    lineAlong(hw - 0.05, 0.08, '#cdbd9b');
    lineAlong(-(hw - 0.05), 0.08, '#cdbd9b');
  }
}

function sizeOfText(s, w, d) { return Math.max(0.3, Math.min(w * 0.85 / Math.max(1, s.length * 0.62), d * 0.6)); }

// ===========================================================================
// SEATING
// ===========================================================================
def('chair', {
  name: 'Chair', cat: 'Seating', w: 0.46, d: 0.46, h: 0.9, color: '#5b8def', color2: '#3f6fd1',
  p: { style: 'standard' },
  schema: [sel('style', 'Style', [['standard', 'Standard'], ['padded', 'Padded / banquet'], ['backless', 'Backless']]), col('color', 'Seat'), col('color2', 'Back')],
  build: (o, P) => chairBuild(P, o.w, o.d, o.h, o.color, o.color2, o.p.style),
});

def('bench', {
  name: 'Bench', cat: 'Seating', w: 1.8, d: 0.45, h: 0.45, color: WOOD, resize: { w: 1, d: 1, h: 0 },
  schema: [col('color', 'Wood')],
  build(o, P) {
    const { w, d, h } = o;
    for (const sx of [-1, 1]) P.box(sx * (w / 2 - 0.12), 0, 0, 0.06, d - 0.06, h - 0.05, shade(o.color, 0.7));
    P.box(0, 0, h - 0.05, w, d, 0.05, o.color);
  },
});

def('stool', {
  name: 'Stool', cat: 'Seating', w: 0.4, d: 0.4, h: 0.65, color: '#f0883e', round: true, resize: { w: 1, d: 1, h: 0 },
  schema: [col('color', 'Seat')],
  build(o, P) {
    const r = o.w / 2;
    P.cyl(0, 0, 0, 0.03, o.h - 0.05, METAL, {}, 8);
    P.cyl(0, 0, 0, r * 0.7, 0.03, METAL, {}, 12);
    P.cyl(0, 0, o.h - 0.06, r, 0.06, o.color, {}, 14);
  },
});

def('pouf', {
  name: 'Pouf / ottoman', cat: 'Seating', w: 0.7, d: 0.7, h: 0.4, color: '#f2b84b', round: true, resize: { w: 1, d: 1, h: 0 },
  schema: [col('color', 'Fabric')],
  build(o, P) { P.cyl(0, 0, 0, o.w / 2, o.h * 0.8, o.color, {}, 16); P.cyl(0, 0, o.h * 0.8, o.w / 2 - 0.04, o.h * 0.2, o.color, { tc: shade(o.color, 1.15) }, 16); },
});

def('sofa', {
  name: 'Sofa', cat: 'Seating', w: 2.1, d: 0.95, h: 0.85, color: '#4f6d9a', color2: '#6b8cbf',
  p: { shape: 'straight', seats: 3, wing: 'right' },
  schema: [
    sel('shape', 'Shape', [['straight', 'Straight'], ['L', 'L-shaped']]),
    num('seats', 'Seats (cushions)', 1, 8, 1),
    sel('wing', 'L corner side', [['left', 'Left'], ['right', 'Right']], { show: (o) => o.p.shape === 'L' }),
    col('color', 'Frame'), col('color2', 'Cushions'),
  ],
  onChange(o, k) {
    if (k === 'seats' && o.p.shape === 'straight') o.w = 0.4 + 0.57 * o.p.seats + 0.1 * o.p.seats;
    if (k === 'shape') {
      if (o.p.shape === 'L') { o.w = 2.9; o.d = 2.1; } else { o.w = 0.4 + 0.67 * o.p.seats; o.d = 0.95; }
    }
  },
  build(o, P) {
    const { w, d, h } = o, c = o.color, cu = o.color2, n = Math.max(1, o.p.seats | 0);
    const bt = 0.22, at = 0.2, baseH = 0.28, cuH = 0.15, armH = h * 0.72;
    if (o.p.shape !== 'L') {
      P.box(0, bt / 2, 0, w - 2 * at, d - bt, baseH, c);
      P.box(-w / 2 + at / 2, bt / 2, 0, at, d - bt, armH, c);
      P.box(w / 2 - at / 2, bt / 2, 0, at, d - bt, armH, c);
      P.box(0, -d / 2 + bt / 2, 0, w, bt, h, c);
      const iw = w - 2 * at, cw = iw / n;
      for (let i = 0; i < n; i++) {
        const x = -iw / 2 + cw * (i + 0.5);
        P.box(x, bt / 2, baseH, cw - 0.03, d - bt - 0.04, cuH, cu);
        P.box(x, -d / 2 + bt + 0.09, baseH + cuH, cw - 0.03, 0.17, h - baseH - cuH - 0.06, cu);
      }
      return;
    }
    // L-shaped
    const sd = Math.min(0.95, d * 0.6), ww = Math.min(0.95, w * 0.5), side = o.p.wing === 'left' ? -1 : 1;
    P.box(0, -d / 2 + bt / 2, 0, w, bt, h, c);
    P.box(0, -d / 2 + bt + (sd - bt) / 2, 0, w - 2 * at, sd - bt, baseH, c);
    P.box(-side * (w / 2 - at / 2), -d / 2 + bt + (sd - bt) / 2, 0, at, sd - bt, armH, c);
    P.box(side * (w / 2 - at / 2), bt / 2, 0, at, d - bt, armH, c);
    P.box(side * (w / 2 - (ww + at) / 2), sd / 2, 0, ww - at, d - sd, baseH, c);
    const yMain = -d / 2 + bt + (sd - bt) / 2;
    const Lm = w - at - ww, cw = Lm / n;
    const xFar = -side * (w / 2 - at);
    for (let i = 0; i < n; i++) {
      const x = xFar + side * cw * (i + 0.5);
      P.box(x, yMain, baseH, cw - 0.03, sd - bt - 0.04, cuH, cu);
      P.box(x, -d / 2 + bt + 0.09, baseH + cuH, cw - 0.03, 0.17, h - baseH - cuH - 0.06, cu);
    }
    const xc = side * (w / 2 - (ww + at) / 2);
    P.box(xc, yMain, baseH, ww - at - 0.03, sd - bt - 0.04, cuH, cu);
    P.box(xc, -d / 2 + bt + 0.09, baseH + cuH, ww - at - 0.03, 0.17, h - baseH - cuH - 0.06, cu);
    const m = Math.max(1, Math.round((d - sd) / 0.75)), ch = (d - sd) / m;
    for (let j = 0; j < m; j++) P.box(xc, -d / 2 + sd + ch * (j + 0.5), baseH, ww - at - 0.03, ch - 0.03, cuH, cu);
  },
});

// ===========================================================================
// TABLES
// ===========================================================================
def('table_round', {
  name: 'Round table', cat: 'Tables', w: 1.8, d: 1.8, h: 0.75, color: '#f4f1ea', color2: '#c9a24a', round: true, resize: { w: 1, d: 1, h: 0 },
  p: { seats: 8, cloth: true, center: 'flowers', chairStyle: 'padded', chairColor: '#d8d2c4' },
  schema: [
    num('seats', 'Chairs around', 0, 14, 1), bool('cloth', 'Table cloth'),
    sel('center', 'Centrepiece', [['none', 'None'], ['flowers', 'Flowers'], ['candle', 'Candle']]),
    sel('chairStyle', 'Chair style', [['standard', 'Standard'], ['padded', 'Padded'], ['backless', 'Backless']]),
    col('color', 'Cloth / top'), col('chairColor', 'Chair colour', { p: true }),
  ],
  bounds(o) { const s = o.p.seats > 0 ? o.w + 2 * 0.75 : o.w; return { w: s, d: s }; },
  build(o, P) {
    const r = o.w / 2, h = o.h, n = o.p.seats | 0;
    const R = r + 0.3;
    for (let i = 0; i < n; i++) {
      const t = (360 / n) * i;
      P.push(R * Math.sin(t * DEG), -R * Math.cos(t * DEG), t);
      chairBuild(P, 0.46, 0.46, 0.9, o.p.chairColor, shade(o.p.chairColor, 0.82), o.p.chairStyle);
      P.pop();
    }
    if (o.p.cloth) { P.cyl(0, 0, 0, r * 0.97, h - 0.04, o.color, {}, 22); P.cyl(0, 0, h - 0.04, r, 0.04, o.color, { tc: shade(o.color, 1.04) }, 22); }
    else { P.cyl(0, 0, 0, 0.07, h - 0.04, METAL, {}, 8); P.cyl(0, 0, 0, r * 0.35, 0.03, METAL, {}, 12); P.cyl(0, 0, h - 0.04, r, 0.04, o.color2, {}, 22); }
    if (o.p.cloth) P.cyl(0, 0, h, r * 0.5, 0.012, o.color2, { ns: true }, 22);
    if (o.p.center === 'flowers') { P.cyl(0, 0, h, 0.07, 0.18, '#7ec8a0', {}, 8); for (let i = 0; i < 5; i++) P.cyl(0.1 * Math.cos(i * 1.256), 0.1 * Math.sin(i * 1.256), h + 0.16, 0.06, 0.08, ['#ff7a9c', '#ffd166', '#ff9ec7', '#fff'][i % 4], { ns: true }, 6); }
    if (o.p.center === 'candle') { P.cyl(0, 0, h, 0.04, 0.2, '#fff6df', {}, 8); P.cyl(0, 0, h + 0.2, 0.015, 0.05, '#ffb02e', {}, 6); }
  },
});

def('table_rect', {
  name: 'Rectangular table', cat: 'Tables', w: 2.4, d: 0.9, h: 0.75, color: '#f4f1ea', color2: '#c9a24a',
  p: { cloth: true, seatsLong: 4, seatsEnd: 0, food: false, chairStyle: 'standard', chairColor: '#5b8def' },
  schema: [
    bool('cloth', 'Table cloth'), num('seatsLong', 'Chairs per long side', 0, 12, 1), num('seatsEnd', 'Chair at each end', 0, 1, 1),
    bool('food', 'Buffet trays'),
    sel('chairStyle', 'Chair style', [['standard', 'Standard'], ['padded', 'Padded'], ['backless', 'Backless']]),
    col('color', 'Cloth / top'), col('chairColor', 'Chair colour', { p: true }),
  ],
  bounds(o) {
    const sl = o.p.seatsLong > 0, se = o.p.seatsEnd > 0;
    return { w: o.w + (se ? 1.5 : 0), d: o.d + (sl ? 1.5 : 0) };
  },
  build(o, P) {
    const { w, d, h } = o, n = o.p.seatsLong | 0;
    const cc = o.p.chairColor, c2 = shade(cc, 0.82);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + ((i + 0.5) * w) / n;
      P.push(x, -(d / 2 + 0.3), 0); chairBuild(P, 0.46, 0.46, 0.9, cc, c2, o.p.chairStyle); P.pop();
      P.push(x, d / 2 + 0.3, 180); chairBuild(P, 0.46, 0.46, 0.9, cc, c2, o.p.chairStyle); P.pop();
    }
    if (o.p.seatsEnd > 0) {
      P.push(-w / 2 - 0.3, 0, -90); chairBuild(P, 0.46, 0.46, 0.9, cc, c2, o.p.chairStyle); P.pop();
      P.push(w / 2 + 0.3, 0, 90); chairBuild(P, 0.46, 0.46, 0.9, cc, c2, o.p.chairStyle); P.pop();
    }
    if (o.p.cloth) { P.box(0, 0, 0, w * 0.97, d * 0.97, h - 0.04, o.color); P.box(0, 0, h - 0.04, w, d, 0.04, o.color, { tc: shade(o.color, 1.04) }); }
    else {
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) P.box(sx * (w / 2 - 0.08), sy * (d / 2 - 0.08), 0, 0.05, 0.05, h - 0.04, METAL);
      P.box(0, 0, h - 0.04, w, d, 0.04, o.color2);
    }
    if (o.p.food) {
      const k = Math.max(2, Math.floor(w / 0.7));
      for (let i = 0; i < k; i++) {
        const x = -w / 2 + ((i + 0.5) * w) / k;
        P.box(x, 0, h, Math.min(0.5, (w / k) * 0.8), d * 0.6, 0.06, '#c8ccd2');
        P.box(x, 0, h + 0.06, Math.min(0.42, (w / k) * 0.66), d * 0.45, 0.07, ['#e8a24a', '#7bbf5a', '#e2573f', '#f0d36a'][i % 4], { ns: true });
      }
    }
  },
});

def('table_cocktail', {
  name: 'Cocktail table', cat: 'Tables', w: 0.7, d: 0.7, h: 1.1, color: '#2d3340', round: true, resize: { w: 1, d: 1, h: 0 },
  p: { cloth: true },
  schema: [bool('cloth', 'Cloth (skirt)'), col('color', 'Colour')],
  build(o, P) {
    const r = o.w / 2;
    if (o.p.cloth) P.cone(0, 0, 0, r * 0.75, o.h - 0.03, o.color, {}, 16, 0.55);
    else { P.cyl(0, 0, 0, 0.04, o.h - 0.03, METAL, {}, 8); P.cyl(0, 0, 0, r * 0.6, 0.03, METAL, {}, 12); }
    P.cyl(0, 0, o.h - 0.03, r, 0.03, shade(o.color, 1.25), {}, 18);
  },
});

// ===========================================================================
// STAGE & AV
// ===========================================================================
def('stage', {
  name: 'Stage', cat: 'Stage & AV', w: 12, d: 6, h: 1.2, color: '#454b59', color2: '#2f3440',
  p: { deck: '#6b7385', steps: true, backdrop: 'led', backH: 4, screen: '#4ea1ff', text: '' },
  schema: [
    sel('backdrop', 'Back wall', [['led', 'LED screen'], ['curtain', 'Curtain'], ['none', 'None']]),
    num('backH', 'Back wall height', 1, 10, 0.5, { show: (o) => o.p.backdrop !== 'none' }),
    txt('text', 'Screen text', { show: (o) => o.p.backdrop === 'led' }),
    col('screen', 'Screen / curtain', { p: true }),
    bool('steps', 'Front steps'), col('color', 'Skirt'), col('deck', 'Deck', { p: true }),
  ],
  build(o, P) {
    const { w, d, h } = o;
    P.box(0, 0, 0, w, d, h, o.color, { tc: o.p.deck });
    P.frect(0, d / 2 - 0.12, h + 0.01, w - 0.2, 0.05, shade(o.p.deck, 1.2), { o2: true });
    if (o.p.steps) {
      const sw = Math.min(2, w * 0.2);
      P.box(w / 2 - sw / 2 - 0.4, d / 2 + 0.3, 0, sw, 0.6, h * 0.5, o.color, { tc: shade(o.p.deck, 1.1) });
      P.box(w / 2 - sw / 2 - 0.4, d / 2 + 0.75, 0, sw, 0.3, h * 0.25, o.color, { tc: shade(o.p.deck, 1.1) });
    }
    const bh = o.p.backH;
    if (o.p.backdrop === 'led') {
      P.box(0, -d / 2 + 0.35, h, w - 0.6, 0.3, bh, DARK);
      P.box(0, -d / 2 + 0.35 + 0.17, h + 0.25, w - 1.1, 0.05, bh - 0.5, o.p.screen, { tc: o.p.screen });
      if (o.p.text) P.vtext(0, -d / 2 + 0.35 + 0.21, h + bh / 2 - 0.1, o.p.text, Math.min(1.6, (w - 2) / Math.max(4, o.p.text.length * 0.7)) * 1.2, '#ffffff');
    } else if (o.p.backdrop === 'curtain') {
      const n = Math.max(2, Math.round(w / 1.2));
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + 0.3 + ((i + 0.5) * (w - 0.6)) / n;
        P.box(x, -d / 2 + 0.3, h, (w - 0.6) / n - 0.02, 0.12, bh, i % 2 ? shade(o.p.screen, 0.85) : o.p.screen);
      }
    }
  },
});

def('dancefloor', {
  name: 'Dance floor', cat: 'Stage & AV', w: 6, d: 6, h: 0.1, ground: true, color: '#2e3a59', color2: '#4b64a8', resize: { w: 1, d: 1, h: 0 },
  p: { cell: 0.75 }, schema: [num('cell', 'Tile size', 0.3, 2, 0.05), col('color', 'Tile A'), col('color2', 'Tile B')],
  build(o, P) {
    const nx = Math.max(1, Math.round(o.w / o.p.cell)), ny = Math.max(1, Math.round(o.d / o.p.cell));
    const cw = o.w / nx, cd = o.d / ny;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) P.frect(-o.w / 2 + cw * (i + 0.5), -o.d / 2 + cd * (j + 0.5), 0.04, cw, cd, (i + j) % 2 ? o.color2 : o.color, { ns: true });
  },
});

def('mandap', {
  name: 'Mandap / wedding stage', cat: 'Stage & AV', w: 5, d: 5, h: 3.6, color: '#f1e2c4', color2: '#d4a24c',
  p: { roof: '#e0585f', drape: '#f8f1e4' },
  schema: [col('color', 'Platform'), col('color2', 'Pillars'), col('roof', 'Roof', { p: true }), col('drape', 'Drapes', { p: true })],
  resize: { w: 1, d: 1, h: 1 },
  build(o, P) {
    const { w, d, h } = o, ph = 0.35;
    P.box(0, 0, 0, w, d, ph, o.color, { tc: shade(o.color, 1.06) });
    const px = w / 2 - 0.35, py = d / 2 - 0.35;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      P.cyl(sx * px, sy * py, ph, 0.12, h - ph - 0.5, o.color2, {}, 10);
      P.cyl(sx * px, sy * py, ph, 0.2, 0.15, shade(o.color2, 0.85), {}, 10);
    }
    const bz = h - 0.55;
    P.box(0, -py, bz, 2 * px + 0.3, 0.18, 0.25, o.color2);
    P.box(0, py, bz, 2 * px + 0.3, 0.18, 0.25, o.color2);
    P.box(-px, 0, bz, 0.18, 2 * py, 0.25, o.color2);
    P.box(px, 0, bz, 0.18, 2 * py, 0.25, o.color2);
    P.solid([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]], h - 0.3, 0.55, [0.35, 0.35], o.p.roof, { a2: 0.6 });
    P.box(0, -py, ph, 2 * px, 0.08, h - ph - 0.7, o.p.drape, { a2: 0.9 });
    for (const sx of [-1, 1]) P.box(sx * px, 0, ph, 0.08, 2 * py * 0.5, h - ph - 0.9, o.p.drape);
    for (let i = 0; i < 6; i++) P.cyl(-px + (i * 2 * px) / 5, py + 0.1, ph, 0.1, 0.18, ['#ff7a9c', '#ffd166', '#fff', '#ff9ec7'][i % 4], { ns: true }, 6);
  },
});

def('dj_booth', {
  name: 'DJ booth', cat: 'Stage & AV', w: 3, d: 1.3, h: 1.1, color: '#262a35', color2: '#5fa8ff', resize: { w: 1, d: 1, h: 0 },
  schema: [col('color', 'Body'), col('color2', 'Front glow')],
  build(o, P) {
    const { w, d, h } = o;
    P.box(0, 0, 0, w, d, h, o.color);
    P.box(0, d / 2 + 0.005, 0.1, w - 0.3, 0.03, h - 0.3, o.color2, { ns: true });
    P.box(-w * 0.22, 0, h, 0.7, 0.5, 0.06, '#c9ced6'); P.box(w * 0.22, 0, h, 0.7, 0.5, 0.06, '#c9ced6');
    P.cyl(-w * 0.22, 0, h + 0.06, 0.2, 0.02, BLACK, { ns: true }, 12); P.cyl(w * 0.22, 0, h + 0.06, 0.2, 0.02, BLACK, { ns: true }, 12);
    P.box(0, -0.1, h, 0.5, 0.35, 0.05, '#8a929d');
  },
});

def('podium', {
  name: 'Podium', cat: 'Stage & AV', w: 0.7, d: 0.55, h: 1.1, color: '#6b4a2f', resize: { w: 1, d: 1, h: 0 },
  schema: [col('color', 'Wood')],
  build(o, P) {
    P.box(0, 0, 0, o.w, o.d, o.h - 0.12, o.color);
    P.solid([[-o.w / 2 - 0.02, -o.d / 2 - 0.02], [o.w / 2 + 0.02, -o.d / 2 - 0.02], [o.w / 2 + 0.02, o.d / 2 + 0.02], [-o.w / 2 - 0.02, o.d / 2 + 0.02]], o.h - 0.12, 0.12, [1, 0.8], shade(o.color, 1.15));
    P.cyl(0, -0.05, o.h, 0.012, 0.28, '#222', { ns: true }, 6);
  },
});

def('led_screen', {
  name: 'LED screen', cat: 'Stage & AV', w: 6, d: 0.35, h: 3.5, color: '#4ea1ff', color2: '#23262e', resize: { w: 1, d: 1, h: 1 },
  p: { text: '' },
  schema: [txt('text', 'Screen text'), col('color', 'Screen'), col('color2', 'Frame')],
  build(o, P) {
    const { w, d, h } = o;
    for (const sx of [-1, 1]) P.box(sx * (w / 2 - 0.4), 0, 0, 0.12, d + 0.5, 0.1, o.color2);
    P.box(0, 0, 0.2, w, d, h - 0.2, o.color2);
    P.box(0, d / 2 + 0.01, 0.3, w - 0.2, 0.04, h - 0.4, o.color, { tc: shade(o.color, 1.15), ns: true });
    if (o.p.text) P.vtext(0, d / 2 + 0.06, h / 2 - 0.1, o.p.text, Math.min(h * 0.4, (w - 0.6) / Math.max(3, o.p.text.length * 0.65)) * 1.1, '#fff');
  },
});

def('speaker', {
  name: 'Speaker stack', cat: 'Stage & AV', w: 0.7, d: 0.6, h: 1.6, color: '#20242c', resize: { w: 1, d: 1, h: 1 },
  p: { size: 'stack' }, schema: [col('color', 'Cabinet')],
  build(o, P) {
    const { w, d, h } = o;
    P.box(0, 0, 0, w, d, h, o.color);
    const n = Math.max(1, Math.round(h / 0.75));
    for (let i = 0; i < n; i++) {
      const cz = ((i + 0.5) * h) / n;
      P.vcircle(0, d / 2 + 0.005, cz, Math.min(w, h / n) * 0.36, '#3a404c', { ns: true });
      P.vcircle(0, d / 2 + 0.008, cz, Math.min(w, h / n) * 0.14, '#12151a', { ns: true });
    }
  },
});

// ===========================================================================
// TRUSS & LIGHTS
// ===========================================================================
const TRUSS_SHAPES = [['portal', 'Goalpost (portal)'], ['straight', 'Straight beam'], ['T', 'T-truss'], ['L', 'L-truss'], ['square', 'Box rig (4 towers)'], ['tower', 'Single tower']];
const TRUSS_PRESET = {
  portal: { w: 10, d: 0.6, h: 5 }, straight: { w: 6, d: 0.3, h: 4.3 }, T: { w: 8, d: 0.6, h: 5 },
  L: { w: 6, d: 0.6, h: 5 }, square: { w: 8, d: 6, h: 5 }, tower: { w: 0.5, d: 0.5, h: 4 },
};
def('truss', {
  name: 'Truss', cat: 'Truss & Lights', w: 10, d: 0.6, h: 5, color: '#b9c1cc',
  p: { shape: 'portal', style: 'box', size: 0.3, elev: 4, lights: 6, lightType: 'par', lightColor: '#ffcf5a', rainbow: false, beams: false },
  schema: [
    sel('shape', 'Shape', TRUSS_SHAPES),
    sel('style', 'Truss type', [['box', 'Box truss (4 chords)'], ['flat', 'Flat / ladder truss']]),
    num('size', 'Truss width', 0.2, 0.6, 0.05),
    num('elev', 'Beam height above ground', 0, 12, 0.25, { show: (o) => o.p.shape === 'straight' }),
    num('lights', 'Lights on beam', 0, 24, 1, { show: (o) => o.p.shape !== 'tower' }),
    sel('lightType', 'Light type', [['par', 'LED par'], ['moving', 'Moving head'], ['spot', 'Spot / Fresnel']]),
    col('lightColor', 'Light colour', { p: true }), bool('rainbow', 'Multi-colour lights'), bool('beams', 'Show light beams'),
    col('color', 'Truss'),
  ],
  resize: (o) => ({ portal: { w: 1, d: 0, h: 1 }, straight: { w: 1, d: 0, h: 0 }, T: { w: 1, d: 0, h: 1 }, L: { w: 1, d: 0, h: 1 }, square: { w: 1, d: 1, h: 1 }, tower: { w: 0, d: 0, h: 1 } }[o.p.shape]),
  onChange(o, k) {
    if (k === 'shape') Object.assign(o, TRUSS_PRESET[o.p.shape]);
    if (k === 'elev' && o.p.shape === 'straight') o.h = o.p.elev + o.p.size;
    if (k === 'size' && o.p.shape === 'straight') o.d = o.p.size;
  },
  build(o, P) {
    const { w, d, h } = o, p = o.p, s = p.size, c = o.color;
    const seg = (a, b) => trussSeg(P, a, b, s, p.style, c);
    const plate = (x, y) => P.box(x, y, 0, s * 2, s * 2, 0.04, '#69727e');
    const type = p.lightType, lc = p.lightColor, rb = p.rainbow, bm = p.beams;
    const header = (y, zc, x0, x1) => { seg([x0, y, zc], [x1, y, zc]); };
    const hs = s / 2;
    switch (p.shape) {
      case 'straight': {
        const z = p.elev + hs;
        header(0, z, -w / 2, w / 2);
        lightRow(P, -w / 2 + 0.4, w / 2 - 0.4, 0, z - hs, p.lights, type, lc, rb, bm);
        break;
      }
      case 'portal': case 'T': case 'L': {
        const tx = p.shape === 'T' ? [0] : p.shape === 'L' ? [-w / 2 + hs] : [-w / 2 + hs, w / 2 - hs];
        for (const x of tx) { seg([x, 0, 0], [x, 0, h - s]); plate(x, 0); }
        header(0, h - hs, -w / 2, w / 2);
        lightRow(P, -w / 2 + 0.5, w / 2 - 0.5, 0, h - s, p.lights, type, lc, rb, bm);
        break;
      }
      case 'square': {
        const px = w / 2 - hs, py = d / 2 - hs;
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) { seg([sx * px, sy * py, 0], [sx * px, sy * py, h - s]); plate(sx * px, sy * py); }
        for (const sy of [-1, 1]) header(sy * py, h - hs, -w / 2, w / 2);
        for (const sx of [-1, 1]) seg([sx * px, -d / 2, h - hs], [sx * px, d / 2, h - hs]);
        lightRow(P, -w / 2 + 0.5, w / 2 - 0.5, -py, h - s, p.lights, type, lc, rb, bm);
        lightRow(P, -w / 2 + 0.5, w / 2 - 0.5, py, h - s, p.lights, type, lc, rb, bm);
        break;
      }
      case 'tower': {
        seg([0, 0, 0], [0, 0, h]); plate(0, 0);
        fixture(P, -s, 0, h - 0.1, type, rb ? RAINBOW[0] : lc, bm); fixture(P, s, 0, h - 0.1, type, rb ? RAINBOW[2] : lc, bm);
        break;
      }
    }
  },
});

def('light_stand', {
  name: 'Light stand', cat: 'Truss & Lights', w: 1.6, d: 0.6, h: 3.4, color: '#2c313b', resize: { w: 1, d: 0, h: 1 },
  p: { lights: 4, lightType: 'par', lightColor: '#ff5db1', rainbow: false, beams: false },
  schema: [num('lights', 'Number of lights', 1, 8, 1), sel('lightType', 'Light type', [['par', 'LED par'], ['moving', 'Moving head'], ['spot', 'Spot / Fresnel']]), col('lightColor', 'Light colour', { p: true }), bool('rainbow', 'Multi-colour'), bool('beams', 'Show beams'), col('color', 'Stand')],
  build(o, P) {
    const { w, h } = o;
    P.cyl(0, 0, 0, 0.04, h, o.color, {}, 8);
    for (const a of [0, 120, 240]) { P.push(0, 0, a); P.box(0.28, 0, 0, 0.56, 0.05, 0.05, o.color); P.pop(); }
    P.cyl(0, 0, 0, 0.32, 0.03, o.color, {}, 12);
    P.box(0, 0, h - 0.05, w, 0.06, 0.06, o.color);
    lightRow(P, -w / 2 + 0.15, w / 2 - 0.15, 0, h - 0.05, o.p.lights, o.p.lightType, o.p.lightColor, o.p.rainbow, o.p.beams);
  },
});

// ===========================================================================
// TENTS
// ===========================================================================
def('marquee', {
  name: 'Marquee tent', cat: 'Tents', w: 6, d: 9, h: 4.2, color: '#f6f6f2', color2: '#e9edf2',
  p: { roofStyle: 'gable', wallH: 2.4, walls: 'open' },
  schema: [
    sel('roofStyle', 'Roof', [['gable', 'Gable (ridge)'], ['peak', 'Pyramid peak']]),
    sel('walls', 'Side walls', [['open', 'Open'], ['back', 'Back wall only'], ['closed', 'Closed']]),
    num('wallH', 'Wall height', 1.8, 4, 0.1), col('color', 'Roof'), col('color2', 'Walls'),
  ],
  build(o, P) {
    const { w, d, h } = o, wh = o.p.wallH, hw = w / 2, hd = d / 2;
    for (let i = 0; i * 3 <= w + 0.01; i++) { const x = -hw + (i * w) / Math.max(1, Math.round(w / 3)); if (x > hw + 0.01) break; for (const y of [-hd, hd]) P.cyl(x, y, 0, 0.06, wh, '#c6ccd4', {}, 8); }
    for (let j = 1; j * 3 < d; j++) { const y = -hd + (j * d) / Math.max(1, Math.round(d / 3)); for (const x of [-hw, hw]) P.cyl(x, y, 0, 0.06, wh, '#c6ccd4', {}, 8); }
    const wall = (cx, cy, ww, dd, a) => P.box(cx, cy, 0, ww, dd, wh, o.color2, { a2: a });
    if (o.p.walls === 'back' || o.p.walls === 'closed') wall(0, -hd, w, 0.06, 0.8);
    if (o.p.walls === 'closed') { wall(0, hd, w, 0.06, 0.8); wall(-hw, 0, 0.06, d, 0.8); wall(hw, 0, 0.06, d, 0.8); }
    const out = [0, 0, wh / 2];
    if (o.p.roofStyle === 'peak') {
      P.solid([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]], wh, h - wh, w >= d ? [(w - d) / w, 0] : [0, (d - w) / d], o.color, { a2: 0.5 });
    } else {
      const along = w >= d; // ridge along the longer side
      const rh = h;
      if (along) {
        P.quad([[-hw, -hd, wh], [hw, -hd, wh], [hw, 0, rh], [-hw, 0, rh]], o.color, { out, a2: 0.5 });
        P.quad([[-hw, hd, wh], [hw, hd, wh], [hw, 0, rh], [-hw, 0, rh]], o.color, { out, a2: 0.5 });
        P.quad([[-hw, -hd, wh], [-hw, hd, wh], [-hw, 0, rh]], shade(o.color, 0.97), { out, a2: 0.5 });
        P.quad([[hw, -hd, wh], [hw, hd, wh], [hw, 0, rh]], shade(o.color, 0.97), { out, a2: 0.5 });
      } else {
        P.quad([[-hw, -hd, wh], [-hw, hd, wh], [0, hd, rh], [0, -hd, rh]], o.color, { out, a2: 0.5 });
        P.quad([[hw, -hd, wh], [hw, hd, wh], [0, hd, rh], [0, -hd, rh]], o.color, { out, a2: 0.5 });
        P.quad([[-hw, -hd, wh], [hw, -hd, wh], [0, -hd, rh]], shade(o.color, 0.97), { out, a2: 0.5 });
        P.quad([[-hw, hd, wh], [hw, hd, wh], [0, hd, rh]], shade(o.color, 0.97), { out, a2: 0.5 });
      }
    }
  },
});

def('canopy', {
  name: 'Pop-up canopy', cat: 'Tents', w: 3, d: 3, h: 3, color: '#3b82f6', color2: '#ffffff',
  p: { stripes: false },
  schema: [bool('stripes', 'Striped'), col('color', 'Roof'), col('color2', 'Stripe')],
  build(o, P) {
    const { w, d, h } = o, hw = w / 2, hd = d / 2, eh = h * 0.72;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) P.box(sx * (hw - 0.05), sy * (hd - 0.05), 0, 0.06, 0.06, eh, '#d7dce3');
    const base = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    P.solid(base, eh, 0.1, 1, o.color, { a2: 0.6 });
    P.solid(base, eh + 0.1, h - eh - 0.1, 0.35, o.color, { a2: 0.6, fc: o.p.stripes ? [o.color, o.color2] : null });
  },
});

def('bigtop', {
  name: 'Big top (circus tent)', cat: 'Tents', w: 12, d: 12, h: 7, color: '#d94b4b', color2: '#f7f2e8', round: true,
  p: { wallH: 3 },
  schema: [num('wallH', 'Wall height', 2, 5, 0.25), col('color', 'Stripe A'), col('color2', 'Stripe B')],
  build(o, P) {
    const r = o.w / 2, wh = o.p.wallH, seg = 16;
    P.solid(regPoly(seg, r, 0, 0, 0), 0, wh, 1, o.color, { fc: [o.color, o.color2], a2: 0.55 });
    P.solid(regPoly(seg, r, 0, 0, 0), wh, o.h - wh, 0.04, o.color, { fc: [o.color, o.color2], a2: 0.55 });
    P.cyl(0, 0, o.h, 0.04, 0.8, '#c6ccd4', {}, 6);
    P.quad([[0, 0, o.h + 0.8], [0, 0, o.h + 0.35], [0.9, 0, o.h + 0.6]], '#f2c14e', { dbl: true, ns: true });
  },
});

def('umbrella', {
  name: 'Parasol', cat: 'Tents', w: 2.4, d: 2.4, h: 2.4, color: '#f2c14e', color2: '#ffffff', round: true,
  schema: [col('color', 'Colour A'), col('color2', 'Colour B')],
  build(o, P) {
    P.cyl(0, 0, 0, 0.03, o.h, '#8a929d', {}, 6);
    P.solid(regPoly(12, o.w / 2, 0, 0, 0), o.h * 0.78, o.h * 0.22, 0.05, o.color, { fc: [o.color, o.color2], a2: 0.7 });
  },
});

def('dome', {
  name: 'Dome tent', cat: 'Tents', w: 6, d: 6, h: 3.4, color: '#f3f7fb', color2: '#4a9cf0', round: true,
  schema: [col('color', 'Dome'), col('color2', 'Accent')],
  build(o, P) {
    const R = o.w / 2, angs = [0, 28, 52, 74, 90];
    const ring = (a) => R * Math.cos(a * DEG);
    for (let k = 0; k < angs.length - 1; k++) {
      const r0 = ring(angs[k]), r1 = ring(angs[k + 1]);
      const z0 = o.h * Math.sin(angs[k] * DEG), z1 = o.h * Math.sin(angs[k + 1] * DEG);
      P.solid(regPoly(12, r0, 0, 0, 15), z0, z1 - z0, r1 / r0, o.color, { fc: k === 1 ? [o.color, o.color2] : null, a2: 0.75 });
    }
    P.quad([[-0.7, R * 0.99, 0], [0.7, R * 0.99, 0], [0.7, R * 0.99, 1.7], [-0.7, R * 0.99, 1.7]], '#27405f', { ns: true, out: [0, 0, 1] });
  },
});

// ===========================================================================
// VENDORS & SERVICES
// ===========================================================================
def('food_stall', {
  name: 'Food stall', cat: 'Vendors & Services', w: 3, d: 2.2, h: 2.6, color: '#f0883e', color2: '#fff4e0',
  p: { text: 'FOOD' },
  schema: [txt('text', 'Sign text'), col('color', 'Awning'), col('color2', 'Stall body')],
  build(o, P) {
    const { w, d, h } = o, hw = w / 2, hd = d / 2;
    P.box(0, -hd + 0.05, 0, w, 0.1, h, o.color2);
    for (const sx of [-1, 1]) P.box(sx * (hw - 0.05), -0.05, 0, 0.1, d - 0.2, h, o.color2);
    P.box(0, hd - 0.4, 0, w - 0.2, 0.7, 1.0, WOOD, { tc: shade(WOOD, 1.2) });
    P.box(-hw * 0.4, hd - 0.4, 1.0, 0.5, 0.35, 0.2, '#e8e0cf'); P.box(hw * 0.35, hd - 0.4, 1.0, 0.4, 0.3, 0.25, '#d9534f');
    P.box(0, 0, h, w + 0.2, d + 0.2, 0.1, o.color2, { a2: 0.85 });
    const n = Math.max(4, Math.round(w / 0.4)), z0 = h, z1 = h - 0.45, y0 = hd + 0.1, y1 = hd + 0.6;
    for (let i = 0; i < n; i++) {
      const x0 = -hw - 0.1 + (i * (w + 0.2)) / n, x1 = -hw - 0.1 + ((i + 1) * (w + 0.2)) / n;
      P.quad([[x0, y0, z0], [x1, y0, z0], [x1, y1, z1], [x0, y1, z1]], i % 2 ? '#fffaf0' : o.color, { out: [0, 0, 0.5], ns: true, a2: 0.8 });
    }
    if (o.p.text) P.text(0, 0, h + 0.11, o.p.text, sizeOfText(o.p.text, w, d), shade(o.color, 0.8), { o2: true });
  },
});

def('food_truck', {
  name: 'Food truck', cat: 'Vendors & Services', w: 6, d: 2.4, h: 3, color: '#e2573f', color2: '#f4efe6',
  schema: [col('color', 'Body'), col('color2', 'Trim')],
  build(o, P) {
    const { w, d } = o, hw = w / 2, hd = d / 2;
    for (const sx of [-1.8, 1.8]) for (const sy of [-1, 1]) P.box(sx, sy * (hd - 0.1), 0, 0.9, 0.3, 0.9, '#1d2027');
    P.box(-0.7, 0, 0.45, w - 1.6, d, 1.4, o.color);
    P.box(-0.7, 0, 1.85, w - 1.6, d, 1.05, shade(o.color, 1.04), { tc: o.color2 });
    P.box(hw - 0.7, 0, 0.45, 1.4, d, 1.1, shade(o.color, 0.9));
    P.box(hw - 0.55, 0, 1.55, 0.95, d - 0.1, 0.6, '#9cc9ee');
    P.quad([[-hw + 1.2, hd + 0.01, 1.45], [hw - 2.6, hd + 0.01, 1.45], [hw - 2.6, hd + 0.01, 2.5], [-hw + 1.2, hd + 0.01, 2.5]], '#2b3340', { out: [0, 0, 1.5], ns: true });
    const n = 8, x0 = -hw + 1.0, x1 = hw - 2.5;
    for (let i = 0; i < n; i++) {
      const a = x0 + (i * (x1 - x0)) / n, b = x0 + ((i + 1) * (x1 - x0)) / n;
      P.quad([[a, hd, 2.55], [b, hd, 2.55], [b, hd + 0.6, 2.2], [a, hd + 0.6, 2.2]], i % 2 ? '#fff' : o.color2 === '#f4efe6' ? '#ffd166' : o.color2, { out: [0, 0, 1], ns: true });
    }
  },
});

def('bar', {
  name: 'Bar counter', cat: 'Vendors & Services', w: 4, d: 0.9, h: 1.1, color: '#8a5a36', color2: '#2f3541',
  p: { stools: 4 },
  schema: [num('stools', 'Bar stools', 0, 12, 1), col('color', 'Counter'), col('color2', 'Back bar')],
  bounds(o) { return { w: o.w, d: o.d + (o.p.stools > 0 ? 0.6 : 0) + 0.7 }; },
  build(o, P) {
    const { w, d, h } = o;
    // local y: front (customers) = +y. Back bar sits behind (-y)
    P.box(0, 0, 0, w, d, h, o.color, { tc: shade(o.color, 1.25) });
    P.box(0, -d / 2 - 0.45, 0, w, 0.5, 1.9, o.color2);
    for (let i = 0; i < Math.floor(w / 0.5); i++) {
      P.cyl(-w / 2 + 0.3 + i * 0.5, -d / 2 - 0.2, 1.2, 0.045, 0.28, ['#7fc29b', '#e2a64a', '#d9534f', '#6aa6e8'][i % 4], { ns: true }, 8);
    }
    const n = o.p.stools | 0;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + ((i + 0.5) * w) / n;
      P.cyl(x, d / 2 + 0.4, 0, 0.03, 0.62, METAL, {}, 6); P.cyl(x, d / 2 + 0.4, 0.62, 0.18, 0.07, '#d9534f', {}, 10);
    }
  },
});

def('kiosk', {
  name: 'Kiosk / booth', cat: 'Vendors & Services', w: 2.4, d: 2.4, h: 2.6, color: '#f6f3ec', color2: '#3b82f6',
  p: { text: 'INFO', cross: false },
  schema: [txt('text', 'Sign text'), bool('cross', 'Red cross icon'), col('color', 'Walls'), col('color2', 'Roof')],
  build(o, P) {
    const { w, d, h } = o;
    P.box(0, 0, 0, w, d, h, o.color);
    P.quad([[-w / 2 + 0.3, d / 2 + 0.01, 1.0], [w / 2 - 0.3, d / 2 + 0.01, 1.0], [w / 2 - 0.3, d / 2 + 0.01, h - 0.4], [-w / 2 + 0.3, d / 2 + 0.01, h - 0.4]], '#27405f', { out: [0, 0, 1], ns: true });
    P.box(0, 0, h, w + 0.3, d + 0.3, 0.12, o.color2);
    const t = h + 0.13;
    if (o.p.cross) { const k = Math.min(w, d) * 0.55; P.frect(0, 0, t, k, k * 0.32, '#e0343b', { ns: true }); P.frect(0, 0, t, k * 0.32, k, '#e0343b', { ns: true }); }
    else if (o.p.text) P.text(0, 0, t, o.p.text, sizeOfText(o.p.text, w, d), '#ffffff');
  },
});

def('toilet', {
  name: 'Portable toilet', cat: 'Vendors & Services', w: 1.2, d: 1.2, h: 2.3, color: '#4aa3df', color2: '#f3f5f7', resize: { w: 1, d: 1, h: 0 },
  schema: [col('color', 'Cabin'), col('color2', 'Roof')],
  build(o, P) {
    P.box(0, 0, 0, o.w, o.d, o.h - 0.15, o.color);
    P.box(0, 0, o.h - 0.15, o.w + 0.06, o.d + 0.06, 0.15, o.color2);
    P.quad([[-0.32, o.d / 2 + 0.01, 0.1], [0.32, o.d / 2 + 0.01, 0.1], [0.32, o.d / 2 + 0.01, 1.9], [-0.32, o.d / 2 + 0.01, 1.9]], shade(o.color, 0.78), { out: [0, 0, 1], ns: true });
    P.frect(0, 0, o.h + 0.01, o.w * 0.5, o.d * 0.5, shade(o.color2, 0.9), { o2: true });
  },
});

def('car', {
  name: 'Car', cat: 'Vendors & Services', w: 4.4, d: 1.9, h: 1.5, color: '#d9534f', resize: { w: 1, d: 1, h: 0 },
  schema: [col('color', 'Body')],
  build(o, P) {
    const { w, d } = o, hd = d / 2;
    for (const sx of [-1.3, 1.3]) for (const sy of [-1, 1]) P.box(sx, sy * (hd - 0.12), 0, 0.7, 0.26, 0.65, '#1d2027');
    P.box(0, 0, 0.28, w, d - 0.1, 0.55, o.color);
    P.box(-0.1, 0, 0.83, w * 0.52, d - 0.2, 0.5, shade(o.color, 1.05), { tc: shade(o.color, 1.15) });
    for (const sy of [-1, 1]) P.quad([[-0.9, sy * (hd - 0.1) + 0.001 * sy, 0.9], [0.85, sy * (hd - 0.1), 0.9], [0.7, sy * (hd - 0.1), 1.28], [-0.75, sy * (hd - 0.1), 1.28]], '#a9d3f2', { out: [0, 0, 1], ns: true });
  },
});

// ===========================================================================
// STRUCTURES
// ===========================================================================
def('fence', {
  name: 'Fence / barrier', cat: 'Structures', w: 10, d: 0.5, h: 1.1, color: '#a9b2bd', resize: { w: 1, d: 0, h: 0 },
  p: { style: 'crowd' },
  schema: [sel('style', 'Type', [['crowd', 'Crowd barrier'], ['picket', 'Wooden picket'], ['rope', 'Rope & posts']]), col('color', 'Colour')],
  build(o, P) {
    const { w } = o, st = o.p.style;
    if (st === 'crowd') {
      const n = Math.max(1, Math.round(w / 2.3)), pl = w / n;
      for (let i = 0; i < n; i++) {
        const cx = -w / 2 + pl * (i + 0.5);
        P.box(cx, 0, 1.0, pl - 0.03, 0.05, 0.05, o.color); P.box(cx, 0, 0.5, pl - 0.03, 0.05, 0.04, o.color);
        const k = Math.max(3, Math.round(pl / 0.3));
        for (let j = 0; j <= k; j++) P.box(cx - (pl - 0.05) / 2 + (j * (pl - 0.05)) / k, 0, 0.1, 0.03, 0.03, 0.95, o.color);
        P.box(cx - pl / 2 + 0.1, 0, 0, 0.05, 0.5, 0.06, '#7e8793'); P.box(cx + pl / 2 - 0.1, 0, 0, 0.05, 0.5, 0.06, '#7e8793');
      }
    } else if (st === 'picket') {
      const n = Math.max(1, Math.round(w / 1.6));
      P.box(0, 0, 0.75, w, 0.05, 0.08, o.color); P.box(0, 0, 0.35, w, 0.05, 0.08, o.color);
      for (let i = 0; i <= n; i++) P.box(-w / 2 + (i * w) / n, 0, 0, 0.09, 0.09, 1.0, shade(o.color, 0.85));
    } else {
      const n = Math.max(1, Math.round(w / 2));
      for (let i = 0; i < n; i++) {
        const a = -w / 2 + (i * w) / n, b = -w / 2 + ((i + 1) * w) / n;
        P.box((a + b) / 2, 0, 0.8, b - a, 0.04, 0.05, '#d33f49');
      }
      for (let i = 0; i <= n; i++) { const x = -w / 2 + (i * w) / n; P.cyl(x, 0, 0, 0.04, 0.95, '#c9a24a', {}, 6); P.cyl(x, 0, 0.95, 0.07, 0.06, '#c9a24a', {}, 8); }
    }
  },
});

def('gate', {
  name: 'Entrance gate / arch', cat: 'Structures', w: 8, d: 1.2, h: 5, color: '#2f6fe0', color2: '#ffffff',
  p: { style: 'inflatable', text: 'WELCOME' },
  schema: [sel('style', 'Style', [['inflatable', 'Inflatable arch'], ['truss', 'Truss gate'], ['floral', 'Floral arch']]), txt('text', 'Sign text'), col('color', 'Colour'), col('color2', 'Accent / letters')],
  build(o, P) {
    const { w, d, h } = o, st = o.p.style;
    if (st === 'truss') {
      const s = 0.45;
      for (const sx of [-1, 1]) P.box(sx * (w / 2 - s / 2), 0, 0, s, s, h, o.color);
      P.box(0, 0, h - 0.9, w, s, 0.9, o.color, { tc: shade(o.color, 1.1) });
      if (o.p.text) P.vtext(0, s / 2 + 0.01, h - 0.62, o.p.text, 0.55, o.color2);
      return;
    }
    const th = st === 'floral' ? 0.5 : 0.8, n = 22;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI, x = ((w - th) / 2) * Math.cos(t), z = (h - th) * Math.sin(t);
      const c = st === 'floral' ? [o.color, o.color2, '#7bbf6a', '#ffb3c7'][i % 4] : o.color;
      P.box(x, 0, Math.max(0, z - th / 2 + (i === 0 || i === n ? th / 2 : 0)), th, Math.min(d, th + 0.2), th, c);
    }
    for (const sx of [-1, 1]) P.box(sx * ((w - th) / 2), 0, 0, th, Math.min(d, th + 0.2), th * 0.6, st === 'floral' ? '#7bbf6a' : o.color);
    if (o.p.text && st === 'inflatable') {
      const zc = (h - th) * 0.62, ct = Math.cos(Math.asin(Math.min(0.98, zc / (h - th)))), bw = Math.max(1, (w - th) * ct - th);
      P.box(0, 0, zc - 0.5, bw, 0.12, 1.0, o.color2);
      P.vtext(0, 0.07, zc, o.p.text, Math.min(0.62, bw / Math.max(4, o.p.text.length * 0.78)), o.color);
    }
  },
});

def('signpost', {
  name: 'Signpost', cat: 'Structures', w: 1.6, d: 0.2, h: 2.6, color: '#2f6fe0', resize: { w: 1, d: 0, h: 1 },
  p: { text: 'MAIN STAGE' },
  schema: [txt('text', 'Sign text'), col('color', 'Board')],
  build(o, P) {
    P.cyl(0, 0, 0, 0.05, o.h, '#8a929d', {}, 6);
    P.box(0, 0, o.h - 0.55, o.w, 0.07, 0.5, o.color);
    if (o.p.text) P.vtext(0, 0.045, o.h - 0.33, o.p.text, Math.min(0.3, o.w / Math.max(4, o.p.text.length * 0.7)) * 1.2, '#fff');
  },
});

def('flag', {
  name: 'Flag pole', cat: 'Structures', w: 1.2, d: 0.2, h: 4.5, color: '#e2573f', resize: { w: 0, d: 0, h: 1 },
  schema: [col('color', 'Flag')],
  build(o, P) {
    P.cyl(0, 0, 0, 0.04, o.h, '#c6ccd4', {}, 6);
    P.quad([[0.04, 0, o.h - 0.1], [o.w, 0, o.h - 0.25], [o.w, 0, o.h - 0.95], [0.04, 0, o.h - 0.8]], o.color, { dbl: true, ns: true });
  },
});

// ===========================================================================
// NATURE
// ===========================================================================
function canopyRings(P, R, h, c, z0 = 0) {
  const rings = [[R * 0.5, z0], [R, z0 + h * 0.32], [R * 0.86, z0 + h * 0.62], [0.02, z0 + h]];
  for (let k = 0; k < rings.length - 1; k++) {
    const [r0, a] = rings[k], [r1, b] = rings[k + 1];
    P.solid(regPoly(8, r0, 0, 0, 22), a, b - a, r1 / r0, k % 2 ? shade(c, 1.07) : c);
  }
}
def('tree', {
  name: 'Tree', cat: 'Nature', w: 3, d: 3, h: 4.5, color: '#58b85a', round: true,
  p: { kind: 'round' },
  schema: [sel('kind', 'Type', [['round', 'Round'], ['pine', 'Pine']]), col('color', 'Foliage')],
  build(o, P) {
    const R = o.w / 2, h = o.h;
    if (o.p.kind === 'pine') {
      P.cyl(0, 0, 0, Math.max(0.1, R * 0.08), h * 0.2, '#8a5a33', {}, 8);
      P.solid(regPoly(8, R, 0, 0, 22), h * 0.12, h * 0.4, 0.2, o.color);
      P.solid(regPoly(8, R * 0.78, 0, 0, 22), h * 0.38, h * 0.36, 0.15, shade(o.color, 1.06));
      P.solid(regPoly(8, R * 0.52, 0, 0, 22), h * 0.62, h * 0.38, 0.02, o.color);
    } else {
      P.cyl(0, 0, 0, Math.max(0.1, R * 0.1), h * 0.4, '#8a5a33', {}, 8);
      canopyRings(P, R, h * 0.72, o.color, h * 0.28);
    }
  },
});

def('bush', {
  name: 'Bush', cat: 'Nature', w: 1.3, d: 1.3, h: 0.9, color: '#6cc46a', round: true,
  schema: [col('color', 'Foliage')],
  build(o, P) { canopyRings(P, o.w / 2, o.h, o.color); },
});

def('hedge', {
  name: 'Hedge row', cat: 'Nature', w: 8, d: 0.7, h: 1.2, color: '#4fa956', resize: { w: 1, d: 1, h: 1 },
  schema: [col('color', 'Foliage')],
  build(o, P) {
    const n = Math.max(1, Math.round(o.w / 0.9)), sw = o.w / n;
    for (let i = 0; i < n; i++) P.box(-o.w / 2 + sw * (i + 0.5), 0, 0, sw - 0.02, o.d, o.h * (0.88 + 0.22 * prand(i + 1)), i % 2 ? shade(o.color, 1.06) : o.color);
  },
});

def('flowerbed', {
  name: 'Flower bed', cat: 'Nature', w: 3, d: 1.2, h: 0.25, color: '#7a5a3c', resize: { w: 1, d: 1, h: 0 },
  schema: [col('color', 'Soil')],
  build(o, P) {
    P.box(0, 0, 0, o.w, o.d, 0.18, o.color);
    const n = Math.round(o.w * o.d * 3.2);
    const cols = ['#ff6b8b', '#ffd166', '#ffffff', '#c08bff', '#ff9a4d'];
    for (let i = 0; i < n; i++) P.cyl((prand(i * 3.1) - 0.5) * (o.w - 0.25), (prand(i * 7.7) - 0.5) * (o.d - 0.25), 0.18, 0.09, 0.1, cols[i % cols.length], { ns: true }, 6);
  },
});

def('planter', {
  name: 'Planter', cat: 'Nature', w: 0.8, d: 0.8, h: 1.1, color: '#9a6b43', round: true, resize: { w: 1, d: 1, h: 0 },
  schema: [col('color', 'Pot')],
  build(o, P) { P.cone(0, 0, 0, o.w / 2, 0.4, o.color, {}, 10, 1.15); canopyRings(P, o.w * 0.5, o.h - 0.38, '#5cbd68', 0.38); },
});

// ===========================================================================
// GROUND & ZONES
// ===========================================================================
const ZONE_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2', '#f783ac'];
export const ZONE_PALETTE = ZONE_COLORS;
const zoneSchema = [
  col('color', 'Fill'), num('opacity', 'Opacity', 0.05, 1, 0.05, { p: true }),
  sel('border', 'Border', [['dashed', 'Dashed'], ['solid', 'Solid'], ['none', 'None']]),
];
function zoneBuild(o, P, poly) {
  const p = o.p, fill = o.color;
  P.flat(poly, 0.02, fill, { a: p.opacity, ns: true });
  if (p.border !== 'none') P.flat(poly, 0.025, 'none', { st: shade(fill, 0.7), sw: 1.6, dash: p.border === 'dashed' ? [6, 4] : null, nofill: true });
}
def('zone', {
  name: 'Zone', cat: 'Ground & Zones', w: 10, d: 7, h: 0, ground: true, color: '#4dabf7',
  p: { opacity: 0.35, border: 'dashed' }, showLabel: true, label: 'Zone',
  schema: zoneSchema, resize: { w: 1, d: 1, h: 0 },
  build(o, P) { zoneBuild(o, P, [[-o.w / 2, -o.d / 2], [o.w / 2, -o.d / 2], [o.w / 2, o.d / 2], [-o.w / 2, o.d / 2]]); },
});
def('polyzone', {
  name: 'Zone (polygon)', cat: 'Ground & Zones', w: 1, d: 1, h: 0, ground: true, world: true, poly: true, color: '#ffa94d',
  p: { opacity: 0.35, border: 'dashed' }, showLabel: true, label: 'Zone',
  schema: zoneSchema, resize: { w: 0, d: 0, h: 0 },
  build(o, P) { zoneBuild(o, P, o.pts); },
});

const surfaceSchema = [sel('surface', 'Surface', SURF_OPTS), col('color', 'Override colour', { optional: true })];
def('road', {
  name: 'Road / path', cat: 'Ground & Zones', w: 20, d: 4, h: 0, ground: true, color: '',
  p: { surface: 'asphalt' }, schema: surfaceSchema, resize: { w: 1, d: 1, h: 0 },
  build(o, P) {
    const horizontal = o.w >= o.d, len = horizontal ? o.w : o.d, wd = horizontal ? o.d : o.w;
    const s = SURFACES[o.p.surface] || SURFACES.asphalt, c = o.color || s.c;
    P.flat([[-o.w / 2, -o.d / 2], [o.w / 2, -o.d / 2], [o.w / 2, o.d / 2], [-o.w / 2, o.d / 2]], 0.03, c, { ns: true });
    const ends = horizontal ? [[-o.w / 2 + 0.01, 0], [o.w / 2 - 0.01, 0]] : [[0, -o.d / 2 + 0.01], [0, o.d / 2 - 0.01]];
    markStrip(P, ends, wd, o.p.surface);
  },
});
function markStrip(P, pts, width, surface) {
  const hw = width / 2, z = 0.035;
  const a = pts[0], b = pts[1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
  const line = (off, w, color, dash) => {
    const step = dash ? dash[0] + dash[1] : l;
    for (let t = 0; t < l - 0.01; t += step) {
      const t1 = Math.min(l, t + (dash ? dash[0] : l));
      const p0 = [a[0] + ux * t + nx * off, a[1] + uy * t + ny * off], p1 = [a[0] + ux * t1 + nx * off, a[1] + uy * t1 + ny * off];
      P.flat(segmentPoly(p0, p1, w / 2), z, color, { ns: true });
    }
  };
  if (surface === 'asphalt' && width >= 2.2) { line(0, 0.14, '#f2cb55', [1.6, 1.4]); line(hw - 0.25, 0.1, '#eceff3'); line(-(hw - 0.25), 0.1, '#eceff3'); }
  else if (surface === 'carpet') { line(hw - 0.08, 0.06, '#e9c46a'); line(-(hw - 0.08), 0.06, '#e9c46a'); }
  else if (surface === 'paver') { line(hw - 0.05, 0.08, '#cdbd9b'); line(-(hw - 0.05), 0.08, '#cdbd9b'); }
}

def('path', {
  name: 'Road (drawn path)', cat: 'Ground & Zones', w: 1, d: 1, h: 0, ground: true, world: true, line: true, color: '',
  p: { surface: 'asphalt', width: 4 }, schema: [...surfaceSchema, num('width', 'Width (m)', 0.5, 20, 0.25)], resize: { w: 0, d: 0, h: 0 },
  build(o, P) { buildStrip(P, o.pts, o.p.width, o.p.surface, o.color); },
});

def('arrow', {
  name: 'Flow arrow', cat: 'Ground & Zones', w: 4, d: 1.4, h: 0, ground: true, color: '#ffffff', resize: { w: 1, d: 1, h: 0 },
  schema: [col('color', 'Colour')],
  build(o, P) {
    const w = o.w, hd = o.d / 2, sh = Math.min(w * 0.4, o.d * 0.9);
    P.flat([[-w / 2, -hd * 0.45], [w / 2 - sh, -hd * 0.45], [w / 2 - sh, -hd], [w / 2, 0], [w / 2 - sh, hd], [w / 2 - sh, hd * 0.45], [-w / 2, hd * 0.45]], 0.045, o.color, { st: shade(o.color, 0.6), sw: 1 });
  },
});

def('label', {
  name: 'Text label', cat: 'Ground & Zones', w: 1.5, d: 1.5, h: 0.1, ground: true, label: 'Label', showLabel: true, color: '#1f2937', color2: '#ffffff', resize: { w: 0, d: 0, h: 0 },
  p: { mode: 'tag', size: 1.4, elev: 0 },
  schema: [
    sel('mode', 'Style', [['tag', 'Tag (always upright)'], ['ground', 'Painted on ground']]),
    num('size', 'Ground text size (m)', 0.3, 8, 0.1, { show: (o) => o.p.mode === 'ground' }),
    col('color', 'Tag / text'), col('color2', 'Tag text', { show: (o) => o.p.mode === 'tag' }),
  ],
  build(o, P) {
    if (o.p.mode === 'ground') P.text(0, 0, 0.05, o.label || 'Label', o.p.size, o.color);
  },
  noTag: (o) => o.p.mode === 'ground',
});

// ===========================================================================
// PALETTE: presets that appear in the library (several share one asset type)
// ===========================================================================
export const PALETTE = [
  { id: 'chair', asset: 'chair', name: 'Chair' },
  { id: 'chair_rows', asset: 'chair', name: 'Chair rows', over: { rot: 180, arr: { mode: 'grid', cols: 10, rows: 6, gx: 0.08, gy: 0.35, blockX: 5, aisleX: 1.4 } } },
  { id: 'chair_arc', asset: 'chair', name: 'Fan seating', over: { arr: { mode: 'arc', cols: 6, rows: 4, gy: 0.4, gx: 0.12, radius: 5, sweep: 110, start: 0, face: 'in' } } },
  { id: 'chair_ring', asset: 'chair', name: 'Chair circle', over: { arr: { mode: 'circle', count: 10, radius: 1.5, start: 0, sweep: 360, face: 'in' } } },
  { id: 'stool', asset: 'stool', name: 'Stool' },
  { id: 'bench', asset: 'bench', name: 'Bench' },
  { id: 'armchair', asset: 'sofa', name: 'Armchair', over: { w: 1.0, p: { seats: 1 } } },
  { id: 'sofa2', asset: 'sofa', name: '2-seater sofa', over: { w: 1.7, p: { seats: 2 } } },
  { id: 'sofa3', asset: 'sofa', name: '3-seater sofa', over: { w: 2.3, p: { seats: 3 } } },
  { id: 'sofa_l', asset: 'sofa', name: 'L-shaped sofa', over: { w: 3.0, d: 2.2, p: { shape: 'L', seats: 2 } } },
  { id: 'pouf', asset: 'pouf', name: 'Pouf' },

  { id: 'table_round', asset: 'table_round', name: 'Round table + chairs' },
  { id: 'table_round_bare', asset: 'table_round', name: 'Round table', over: { p: { seats: 0 } } },
  { id: 'table_rect', asset: 'table_rect', name: 'Rect. table + chairs' },
  { id: 'table_banquet', asset: 'table_rect', name: 'Banquet table', over: { w: 3.6, d: 0.9, p: { seatsLong: 6, seatsEnd: 1 } } },
  { id: 'buffet', asset: 'table_rect', name: 'Buffet table', over: { w: 3.2, d: 0.8, color: '#ffffff', p: { seatsLong: 0, food: true } } },
  { id: 'coffee_table', asset: 'table_rect', name: 'Coffee table', over: { w: 1.2, d: 0.6, h: 0.42, color: '#c9a67a', p: { cloth: false, seatsLong: 0 } } },
  { id: 'table_cocktail', asset: 'table_cocktail', name: 'Cocktail table' },

  { id: 'stage', asset: 'stage', name: 'Stage' },
  { id: 'runway', asset: 'stage', name: 'Runway', over: { w: 12, d: 2.2, h: 1, p: { backdrop: 'none', steps: false } } },
  { id: 'led_screen', asset: 'led_screen', name: 'LED screen' },
  { id: 'speaker', asset: 'speaker', name: 'Speaker stack' },
  { id: 'dj_booth', asset: 'dj_booth', name: 'DJ booth' },
  { id: 'podium', asset: 'podium', name: 'Podium' },
  { id: 'dancefloor', asset: 'dancefloor', name: 'Dance floor' },
  { id: 'mandap', asset: 'mandap', name: 'Mandap / wedding stage' },

  { id: 'truss_portal', asset: 'truss', name: 'Truss goalpost + lights' },
  { id: 'truss_straight', asset: 'truss', name: 'Straight truss', over: { w: 6, d: 0.3, h: 4.3, p: { shape: 'straight', lights: 4 } } },
  { id: 'truss_t', asset: 'truss', name: 'T-truss', over: { w: 8, d: 0.6, h: 5, p: { shape: 'T', lights: 5 } } },
  { id: 'truss_square', asset: 'truss', name: 'Box rig (4 towers)', over: { w: 8, d: 6, h: 5, p: { shape: 'square', lights: 5 } } },
  { id: 'truss_tower', asset: 'truss', name: 'Truss tower', over: { w: 0.5, d: 0.5, h: 4, p: { shape: 'tower' } } },
  { id: 'light_stand', asset: 'light_stand', name: 'Light stand' },

  { id: 'marquee', asset: 'marquee', name: 'Marquee tent' },
  { id: 'canopy', asset: 'canopy', name: 'Pop-up canopy' },
  { id: 'bigtop', asset: 'bigtop', name: 'Big top' },
  { id: 'umbrella', asset: 'umbrella', name: 'Parasol' },
  { id: 'dome', asset: 'dome', name: 'Dome tent' },

  { id: 'food_stall', asset: 'food_stall', name: 'Food stall' },
  { id: 'food_truck', asset: 'food_truck', name: 'Food truck' },
  { id: 'bar', asset: 'bar', name: 'Bar counter' },
  { id: 'kiosk_info', asset: 'kiosk', name: 'Info booth' },
  { id: 'kiosk_ticket', asset: 'kiosk', name: 'Ticket booth', over: { w: 2, d: 2, color2: '#f59f00', p: { text: 'TICKETS' } } },
  { id: 'kiosk_aid', asset: 'kiosk', name: 'First aid', over: { color2: '#f4f4f4', p: { cross: true } } },
  { id: 'toilet', asset: 'toilet', name: 'Portable toilet' },
  { id: 'toilet_block', asset: 'toilet', name: 'Toilet block', over: { arr: { mode: 'grid', cols: 5, rows: 1, gx: 0.05, gy: 0, blockX: 0, aisleX: 0, blockY: 0, aisleY: 0 } } },
  { id: 'car', asset: 'car', name: 'Car' },
  { id: 'parking', asset: 'car', name: 'Parking row', over: { rot: 90, arr: { mode: 'grid', cols: 1, rows: 8, gx: 0, gy: 0.7, blockX: 0, aisleX: 0, blockY: 0, aisleY: 0 } } },

  { id: 'fence', asset: 'fence', name: 'Crowd barrier' },
  { id: 'fence_picket', asset: 'fence', name: 'Picket fence', over: { color: '#f4efe4', p: { style: 'picket' } } },
  { id: 'fence_rope', asset: 'fence', name: 'Rope & posts', over: { w: 8, p: { style: 'rope' } } },
  { id: 'gate', asset: 'gate', name: 'Inflatable arch' },
  { id: 'gate_truss', asset: 'gate', name: 'Truss gate', over: { h: 4.5, p: { style: 'truss' }, color: '#434a57' } },
  { id: 'gate_floral', asset: 'gate', name: 'Floral arch', over: { w: 3, h: 3.2, d: 0.8, color: '#f6a5c0', color2: '#ffffff', p: { style: 'floral', text: '' } } },
  { id: 'signpost', asset: 'signpost', name: 'Signpost' },
  { id: 'flag', asset: 'flag', name: 'Flag pole' },

  { id: 'tree', asset: 'tree', name: 'Tree' },
  { id: 'pine', asset: 'tree', name: 'Pine tree', over: { color: '#3f9a58', w: 2.4, h: 5, p: { kind: 'pine' } } },
  { id: 'bush', asset: 'bush', name: 'Bush' },
  { id: 'hedge', asset: 'hedge', name: 'Hedge row' },
  { id: 'flowerbed', asset: 'flowerbed', name: 'Flower bed' },
  { id: 'planter', asset: 'planter', name: 'Planter' },

  { id: 'zone', asset: 'zone', name: 'Zone (rectangle)' },
  { id: 'polyzone', asset: 'polyzone', name: 'Zone (draw polygon)', tool: 'polyzone' },
  { id: 'road', asset: 'road', name: 'Road (rectangle)' },
  { id: 'path', asset: 'path', name: 'Road (draw path)', tool: 'path' },
  { id: 'carpet', asset: 'road', name: 'Red carpet', over: { w: 12, d: 1.6, p: { surface: 'carpet' } } },
  { id: 'lawn', asset: 'road', name: 'Lawn patch', over: { w: 10, d: 8, p: { surface: 'grass' } } },
  { id: 'water', asset: 'road', name: 'Pond / water', over: { w: 8, d: 6, p: { surface: 'water' } } },
  { id: 'arrow', asset: 'arrow', name: 'Flow arrow' },
  { id: 'label', asset: 'label', name: 'Text label' },
];

export function paletteByCat() {
  const m = new Map(CATEGORIES.map((c) => [c, []]));
  for (const it of PALETTE) m.get(ASSETS[it.asset].cat).push(it);
  return m;
}
