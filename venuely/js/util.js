// Small shared helpers: math, colour, geometry.

export const DEG = Math.PI / 180;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const uid = () => Math.random().toString(36).slice(2, 9);
export const snapTo = (v, step) => (step > 0 ? Math.round(v / step) * step : v);
export const round = (v, n = 2) => { const f = 10 ** n; return Math.round(v * f) / f; };

export function rot2(x, y, deg) {
  const a = deg * DEG, c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}

// ---- colour -------------------------------------------------------------
const rgbCache = new Map();
export function hexRgb(hex) {
  let v = rgbCache.get(hex);
  if (v) return v;
  if (hex.startsWith('rgb')) {
    v = hex.match(/[\d.]+/g).slice(0, 3).map(Number);
    rgbCache.set(hex, v);
    return v;
  }
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  rgbCache.set(hex, v);
  return v;
}

const shadeCache = new Map();
/** Multiply a hex colour by m (m<1 darkens, m>1 lightens toward white). */
export function shade(hex, m) {
  const key = hex + '|' + Math.round(m * 64);
  let v = shadeCache.get(key);
  if (v) return v;
  const [r, g, b] = hexRgb(hex);
  let out;
  if (m <= 1) out = [r * m, g * m, b * m];
  else { const t = m - 1; out = [r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t]; }
  v = `rgb(${out.map((x) => Math.round(clamp(x, 0, 255))).join(',')})`;
  shadeCache.set(key, v);
  return v;
}

export function toHex(r, g, b) {
  return '#' + [r, g, b].map((x) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0')).join('');
}
export function mix(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
export function luminance(hex) {
  const [r, g, b] = hexRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// ---- geometry -----------------------------------------------------------
export function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Convex hull (Andrew's monotone chain) of [x,y] points. */
export function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

export function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function regPoly(n, r, cx = 0, cy = 0, startDeg = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (startDeg + (360 / n) * i) * DEG;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

// deterministic pseudo random 0..1 from a number seed
export function prand(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ---- tiny DOM helper ------------------------------------------------------------
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
