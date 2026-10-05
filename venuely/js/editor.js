// Editor: owns the camera, selection and every pointer / keyboard interaction.

import { ASSETS } from './assets.js';
import { presetObject, createObject } from './scene.js';
import { Camera, Renderer, boxOf, boxCorners, hullOf, roundRect } from './render.js';
import { layoutOf, elementSize, gridExtent } from './layout.js';
import { pointInPoly, distToSeg, rot2, snapTo, DEG, clamp, uid } from './util.js';
import { PALETTE } from './assets.js';

const ACCENT = '#4f46e5';
const HANDLES = { nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0] };

export function resizeFlags(o) {
  const a = ASSETS[o.type];
  if (o.arr) return { w: 1, d: 1, h: 1 };
  return typeof a.resize === 'function' ? a.resize(o) : a.resize;
}

export class Editor {
  constructor(canvas, scene) {
    this.cv = canvas;
    this.scene = scene;
    this.renderer = new Renderer(canvas);
    this.cam = new Camera();
    this.sel = new Set();
    this.tool = 'select';
    this.drawing = null;
    this.drag = null;
    this.hoverId = null;
    this.space = false;
    this.pointers = new Map();
    this.clipboard = null;
    this.cursorGround = null;
    this.handlers = {};
    this.raf = 0;
    this.dpr = 1;
    this.W = 0; this.H = 0;
    this._bind();
    scene.on((k) => {
      if (k === 'load' || k === 'restore') this.pruneSelection();
      this.invalidate();
    });
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
  }

  // ---- tiny event emitter ----------------------------------------------------
  on(evt, fn) { (this.handlers[evt] ||= []).push(fn); }
  emit(evt, ...a) { for (const fn of this.handlers[evt] || []) fn(...a); }

  // ---- sizing / rendering -----------------------------------------------------
  resize() {
    const r = this.cv.parentElement.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = r.width; this.H = r.height;
    this.cv.width = Math.round(r.width * this.dpr);
    this.cv.height = Math.round(r.height * this.dpr);
    if (!this._fitted && r.width > 50) { this._fitted = true; this.fitView(); }
    this.invalidate();
  }
  invalidate() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
  }
  draw() {
    this.renderer.draw(this.scene, this.cam, {
      style: this.scene.meta.style, grid: this.scene.meta.grid, scaleBar: true, dpr: this.dpr,
      after: (ctx) => this.drawOverlay(ctx),
    });
  }

  // ---- selection ---------------------------------------------------------------
  get selected() { return this.scene.objects.filter((o) => this.sel.has(o.id)); }
  setSelection(ids) {
    this.sel = new Set(ids);
    this.emit('selection');
    this.invalidate();
  }
  pruneSelection() {
    const ids = new Set(this.scene.objects.map((o) => o.id));
    const next = [...this.sel].filter((i) => ids.has(i));
    this.setSelection(next);
  }

  // ---- view ----------------------------------------------------------------------
  venuePoints() {
    const v = this.scene.meta.venue;
    return [[0, 0, 0], [v.w, 0, 0], [v.w, v.d, 0], [0, v.d, 0], [0, 0, 5], [v.w, v.d, 5], [v.w, 0, 5], [0, v.d, 5]];
  }
  fitView() {
    this.cam.fit(this.venuePoints(), this.W, this.H, 70);
    this.emit('view'); this.invalidate();
  }
  setMode(mode) {
    if (mode === this.cam.mode) return;
    const c = this.cam.unproject(this.W / 2, this.H / 2);
    this.cam.mode = mode;
    this.recentre(c);
    this.emit('view');
  }
  rotateView(step) {
    if (this.cam.mode !== 'iso') { this.setMode('iso'); return; }
    const c = this.cam.unproject(this.W / 2, this.H / 2);
    this.cam.yaw = (this.cam.yaw + step + 360) % 360;
    this.recentre(c);
    this.emit('view');
  }
  recentre(g) {
    const [sx, sy] = this.cam.project(g[0], g[1], 0);
    this.cam.px += this.W / 2 - sx; this.cam.py += this.H / 2 - sy;
    this.invalidate();
  }
  zoomBy(f) { this.cam.zoomAt(this.W / 2, this.H / 2, f); this.emit('view'); this.invalidate(); }

  /** Frame everything that is currently selected / or the venue. */
  zoomToSelection() {
    const objs = this.selected;
    if (!objs.length) return this.fitView();
    const pts = [];
    for (const o of objs) { const b = boxOf(o); pts.push(...boxCorners(b, 0), ...boxCorners(b, b.h)); }
    this.cam.fit(pts, this.W, this.H, 120);
    this.cam.zoom = Math.min(this.cam.zoom, 60);
    this.emit('view'); this.invalidate();
  }

  setTool(t) {
    this.tool = t;
    this.drawing = null;
    if (t === 'polyzone' || t === 'path') this.drawing = { kind: t, pts: [], cursor: null };
    this.cv.style.cursor = t === 'hand' ? 'grab' : t === 'select' ? 'default' : 'crosshair';
    this.hint(t === 'polyzone' ? 'Click to add corners · double-click or Enter to close · Esc to cancel'
      : t === 'path' ? 'Click to add road points · double-click or Enter to finish · Esc to cancel' : '', true);
    this.emit('tool');
    this.invalidate();
  }
  hint(text, sticky = false) { this.emit('hint', text, sticky); }

  // ---- object operations -----------------------------------------------------------
  snapStep() { return this.scene.meta.snap || 0; }
  snap(v) { return snapTo(v, this.snapStep()); }

  viewCentreGround() {
    const g = this.cam.unproject(this.W / 2, this.H / 2);
    const v = this.scene.meta.venue;
    return [clamp(g[0], 2, v.w - 2), clamp(g[1], 2, v.d - 2)];
  }

  addPreset(id, at, over = {}) {
    const it = PALETTE.find((p) => p.id === id);
    if (!it) return null;
    if (it.tool) { this.setTool(it.tool); return null; }
    const o = presetObject(id, over);
    const g = at || this.viewCentreGround();
    const step = this.snapStep() || 0.5;
    o.x = snapTo(g[0], step); o.y = snapTo(g[1], step);
    if (!at) {
      // stagger repeated clicks so new items do not pile up on exactly the same spot
      const taken = () => this.scene.objects.some((q) => !q.pts && Math.abs(q.x - o.x) < 0.01 && Math.abs(q.y - o.y) < 0.01);
      for (let i = 0; i < 40 && taken(); i++) { o.x += 1.5; o.y += 1.5; }
    }
    this.scene.add(o);
    this.setSelection([o.id]);
    this.scene.commit();
    this.emit('objects');
    return o;
  }

  deleteSelected() {
    const ids = [...this.sel].filter((id) => !this.scene.byId(id)?.locked);
    if (!ids.length) return;
    this.scene.remove(ids);
    this.setSelection([]);
    this.scene.commit();
    this.emit('objects');
  }

  clone(o, dx = 1.5, dy = 1.5) {
    const c = JSON.parse(JSON.stringify(o, (k, v) => (k[0] === '_' ? undefined : v)));
    c.id = uid(); c.rev = 0;
    if (c.pts) c.pts = c.pts.map(([x, y]) => [x + dx, y + dy]); else { c.x += dx; c.y += dy; }
    return c;
  }
  duplicate() {
    const out = [];
    for (const o of this.selected) { const c = this.clone(o); this.scene.objects.push(c); out.push(c.id); }
    if (out.length) { this.setSelection(out); this.scene.commit(); this.emit('objects'); }
  }
  copy() { this.clipboard = this.selected.map((o) => JSON.parse(JSON.stringify(o, (k, v) => (k[0] === '_' ? undefined : v)))); if (this.clipboard.length) this.toast(`Copied ${this.clipboard.length} object${this.clipboard.length > 1 ? 's' : ''}`); }
  paste() {
    if (!this.clipboard || !this.clipboard.length) return;
    const out = [];
    for (const o of this.clipboard) { const c = this.clone(o, 1.5, 1.5); this.scene.objects.push(c); out.push(c.id); }
    this.clipboard = this.clipboard.map((o) => this.clone(o, 1.5, 1.5));
    this.setSelection(out); this.scene.commit(); this.emit('objects');
  }
  toast(m) { this.emit('toast', m); }

  nudge(dx, dy) {
    for (const o of this.selected) {
      if (o.locked) continue;
      if (o.pts) { o.pts = o.pts.map(([x, y]) => [x + dx, y + dy]); this.scene.touch(o); } else { o.x += dx; o.y += dy; }
    }
    this.invalidate(); this.emit('live');
  }
  rotateSelected(deg) {
    for (const o of this.selected) if (!o.locked && !o.pts) o.rot = ((o.rot + deg + 540) % 360) - 180;
    this.invalidate(); this.emit('live'); this.scene.commit();
  }

  reorder(kind) {
    const objs = this.scene.objects, ids = this.sel;
    const picked = objs.filter((o) => ids.has(o.id)), rest = objs.filter((o) => !ids.has(o.id));
    if (!picked.length) return;
    if (kind === 'front') this.scene.objects = [...rest, ...picked];
    else if (kind === 'back') this.scene.objects = [...picked, ...rest];
    else {
      const arr = objs.slice();
      const dir = kind === 'forward' ? 1 : -1;
      const idxs = arr.map((o, i) => (ids.has(o.id) ? i : -1)).filter((i) => i >= 0);
      if (dir > 0) idxs.reverse();
      for (const i of idxs) { const j = i + dir; if (j < 0 || j >= arr.length || ids.has(arr[j].id)) continue; [arr[i], arr[j]] = [arr[j], arr[i]]; }
      this.scene.objects = arr;
    }
    this.scene.commit(); this.invalidate(); this.emit('objects');
  }

  align(kind) {
    const objs = this.selected.filter((o) => !o.locked);
    if (objs.length < 2) return;
    const ext = (o) => {
      const b = boxOf(o), cs = boxCorners(b, 0);
      const xs = cs.map((c) => c[0]), ys = cs.map((c) => c[1]);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    };
    const E = objs.map((o) => ({ o, e: ext(o) }));
    const mv = (o, dx, dy) => { if (o.pts) { o.pts = o.pts.map(([x, y]) => [x + dx, y + dy]); this.scene.touch(o); } else { o.x += dx; o.y += dy; } };
    const minX = Math.min(...E.map((i) => i.e.x0)), maxX = Math.max(...E.map((i) => i.e.x1));
    const minY = Math.min(...E.map((i) => i.e.y0)), maxY = Math.max(...E.map((i) => i.e.y1));
    if (kind === 'left') E.forEach(({ o, e }) => mv(o, minX - e.x0, 0));
    if (kind === 'right') E.forEach(({ o, e }) => mv(o, maxX - e.x1, 0));
    if (kind === 'top') E.forEach(({ o, e }) => mv(o, 0, minY - e.y0));
    if (kind === 'bottom') E.forEach(({ o, e }) => mv(o, 0, maxY - e.y1));
    if (kind === 'cx') E.forEach(({ o, e }) => mv(o, (minX + maxX) / 2 - (e.x0 + e.x1) / 2, 0));
    if (kind === 'cy') E.forEach(({ o, e }) => mv(o, 0, (minY + maxY) / 2 - (e.y0 + e.y1) / 2));
    if (kind === 'dx' || kind === 'dy') {
      const horiz = kind === 'dx';
      const s = E.slice().sort((a, b) => (horiz ? a.e.x0 - b.e.x0 : a.e.y0 - b.e.y0));
      const total = horiz ? maxX - minX : maxY - minY;
      const used = s.reduce((t, i) => t + (horiz ? i.e.x1 - i.e.x0 : i.e.y1 - i.e.y0), 0);
      const gap = (total - used) / Math.max(1, s.length - 1);
      let cur = horiz ? minX : minY;
      for (const { o, e } of s) {
        const size = horiz ? e.x1 - e.x0 : e.y1 - e.y0;
        mv(o, horiz ? cur - e.x0 : 0, horiz ? 0 : cur - e.y0);
        cur += size + gap;
      }
    }
    this.scene.commit(); this.invalidate(); this.emit('live');
  }

  // ---- hit testing --------------------------------------------------------------------
  hitTest(sx, sy) {
    const objs = this.scene.objects;
    for (let i = objs.length - 1; i >= 0; i--) {
      const t = objs[i]._tag;
      if (t && !objs[i].hidden && !objs[i].locked && sx >= t.x && sx <= t.x + t.w && sy >= t.y && sy <= t.y + t.h) return objs[i];
    }
    const g = this.cam.unproject(sx, sy);
    const cands = [], ground = [];
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (o.hidden || o.locked) continue;
      const a = ASSETS[o.type];
      if (a.world) {
        if (a.poly && pointInPoly(g[0], g[1], o.pts)) ground.push(o);
        else if (a.line) {
          for (let k = 0; k < o.pts.length - 1; k++) {
            if (distToSeg(g[0], g[1], o.pts[k][0], o.pts[k][1], o.pts[k + 1][0], o.pts[k + 1][1]) <= o.p.width / 2 + 0.25) { ground.push(o); break; }
          }
        }
        continue;
      }
      const b = boxOf(o);
      if (a.ground) {
        const [lx, ly] = rot2(g[0] - b.cx, g[1] - b.cy, -b.rot);
        if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.d / 2) ground.push(o);
        continue;
      }
      if (pointInPoly(sx, sy, hullOf(o, this.cam))) cands.push({ o, b });
    }
    if (cands.length) {
      if (this.cam.mode === '2d') return cands.reduce((m, c) => (c.b.w * c.b.d < m.b.w * m.b.d ? c : m)).o;
      return cands.reduce((m, c) => (this.cam.depth(c.b.cx, c.b.cy, c.b.h / 2) > this.cam.depth(m.b.cx, m.b.cy, m.b.h / 2) ? c : m)).o;
    }
    return ground[0] || null;
  }

  handleList(o) {
    const a = ASSETS[o.type];
    if (a.world || o.locked) return [];
    const b = boxOf(o);
    const flags = resizeFlags(o);
    const list = [];
    const canArr = !o.arr || o.arr.mode === 'grid';
    if (canArr) {
      for (const [id, [hx, hy]] of Object.entries(HANDLES)) {
        if (hx && !flags.w) continue;
        if (hy && !flags.d) continue;
        if (a.round && !o.arr && (!hx || !hy)) continue;
        const [rx, ry] = rot2((hx * b.w) / 2, (hy * b.d) / 2, b.rot);
        list.push({ id, wx: b.cx + rx, wy: b.cy + ry });
      }
    }
    // rotate handle: above the "back" edge, in screen space
    const [tx, ty] = rot2(0, -b.d / 2, b.rot);
    list.push({ id: 'rot', wx: b.cx + tx, wy: b.cy + ty, rot: true });
    return list;
  }
  handleScreen(h) {
    const p = this.cam.project(h.wx, h.wy, 0);
    return h.rot ? [p[0], p[1] - 30] : p;
  }
  hitHandle(sx, sy) {
    if (this.sel.size !== 1) return null;
    const o = this.selected[0];
    for (const h of this.handleList(o)) {
      const [x, y] = this.handleScreen(h);
      if (Math.hypot(sx - x, sy - y) <= (h.rot ? 11 : 9)) return { kind: 'handle', id: h.id, o };
    }
    if (o.pts && !o.locked) {
      const pts = o.pts;
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = this.cam.project(pts[i][0], pts[i][1], 0);
        if (Math.hypot(sx - x, sy - y) <= 10) return { kind: 'vertex', i, o };
      }
      const n = ASSETS[o.type].poly ? pts.length : pts.length - 1;
      for (let i = 0; i < n; i++) {
        const q = pts[(i + 1) % pts.length];
        const [x, y] = this.cam.project((pts[i][0] + q[0]) / 2, (pts[i][1] + q[1]) / 2, 0);
        if (Math.hypot(sx - x, sy - y) <= 8) return { kind: 'mid', i, o };
      }
    }
    return null;
  }

  // ---- pointer input --------------------------------------------------------------------
  _bind() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => this.onDown(e));
    cv.addEventListener('pointermove', (e) => this.onMove(e));
    cv.addEventListener('pointerup', (e) => this.onUp(e));
    cv.addEventListener('pointercancel', (e) => this.onUp(e));
    cv.addEventListener('dblclick', (e) => this.onDbl(e));
    cv.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') { this.space = false; this.cv.style.cursor = this.tool === 'hand' ? 'grab' : 'default'; } });
  }

  pos(e) { const r = this.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  onDown(e) {
    this.cv.focus();
    this.cv.setPointerCapture(e.pointerId);
    const [sx, sy] = this.pos(e);
    this.pointers.set(e.pointerId, [sx, sy]);
    if (this.pointers.size === 2) { this.startPinch(); return; }

    const pan = e.button === 1 || e.button === 2 || this.space || this.tool === 'hand';
    if (pan) { this.drag = { type: 'pan', sx, sy, px: this.cam.px, py: this.cam.py }; this.cv.style.cursor = 'grabbing'; return; }

    const g = this.cam.unproject(sx, sy);

    if (this.drawing) { this.drawClick(g, e); return; }

    const h = this.hitHandle(sx, sy);
    if (h) {
      if (h.kind === 'handle') {
        const o = h.o, b = boxOf(o);
        this.drag = { type: h.id === 'rot' ? 'rotate' : 'resize', o, hid: h.id, start: { cx: o.x, cy: o.y, rot: o.rot, w: o.w, d: o.d, W: b.w, D: b.d, es: elementSize(o), arr: o.arr ? { ...o.arr } : null }, moved: false };
      } else if (h.kind === 'vertex') {
        if (e.altKey && h.o.pts.length > (ASSETS[h.o.type].poly ? 3 : 2)) { h.o.pts.splice(h.i, 1); this.scene.touch(h.o); this.scene.commit(); this.invalidate(); return; }
        this.drag = { type: 'vertex', o: h.o, i: h.i, moved: false };
      } else if (h.kind === 'mid') {
        h.o.pts.splice(h.i + 1, 0, [this.snap(g[0]), this.snap(g[1])]);
        this.scene.touch(h.o);
        this.drag = { type: 'vertex', o: h.o, i: h.i + 1, moved: true };
      }
      return;
    }

    const hit = this.hitTest(sx, sy);
    if (hit) {
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        const s = new Set(this.sel);
        if (s.has(hit.id)) s.delete(hit.id); else s.add(hit.id);
        this.setSelection([...s]);
      } else if (!this.sel.has(hit.id)) this.setSelection([hit.id]);
      this.drag = {
        type: 'move', g0: g, moved: false,
        items: this.selected.filter((o) => !o.locked).map((o) => ({ o, x: o.x, y: o.y, pts: o.pts ? o.pts.map((p) => [...p]) : null })),
      };
      return;
    }
    if (!(e.shiftKey)) this.setSelection([]);
    if (e.pointerType === 'touch') this.drag = { type: 'pan', sx, sy, px: this.cam.px, py: this.cam.py };
    else this.drag = { type: 'marquee', sx, sy, x: sx, y: sy, add: e.shiftKey, base: new Set(this.sel) };
  }

  onMove(e) {
    const [sx, sy] = this.pos(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, [sx, sy]);
    const g = this.cam.unproject(sx, sy);
    this.cursorGround = g;
    this.emit('coords', g);

    if (this.pinch && this.pointers.size >= 2) { this.updatePinch(); return; }

    const d = this.drag;
    if (d) {
      if (d.type === 'pan') { this.cam.px = d.px + (sx - d.sx); this.cam.py = d.py + (sy - d.sy); this.invalidate(); return; }
      if (d.type === 'marquee') { d.x = sx; d.y = sy; this.invalidate(); return; }
      if (d.type === 'move') return this.dragMove(d, g, e);
      if (d.type === 'resize') return this.dragResize(d, g, e);
      if (d.type === 'rotate') return this.dragRotate(d, g, e);
      if (d.type === 'vertex') {
        d.o.pts[d.i] = [this.snap(g[0]), this.snap(g[1])];
        d.moved = true; this.scene.touch(d.o); this.invalidate(); this.emit('live');
        return;
      }
    }
    if (this.drawing) { this.drawing.cursor = [this.snap(g[0]), this.snap(g[1])]; this.invalidate(); return; }

    // hover feedback
    if (e.pointerType !== 'touch' && !this.space && this.tool === 'select') {
      const h = this.hitHandle(sx, sy);
      if (h) { this.cv.style.cursor = h.kind === 'handle' ? (h.id === 'rot' ? 'grab' : this.cam.mode === '2d' ? (h.id.length === 2 ? (h.id === 'nw' || h.id === 'se' ? 'nwse-resize' : 'nesw-resize') : (h.id === 'e' || h.id === 'w' ? 'ew-resize' : 'ns-resize')) : 'pointer') : 'pointer'; if (this.hoverId) { this.hoverId = null; this.invalidate(); } return; }
      const hit = this.hitTest(sx, sy);
      const id = hit ? hit.id : null;
      this.cv.style.cursor = hit ? 'move' : 'default';
      if (id !== this.hoverId) { this.hoverId = id; this.invalidate(); }
    }
  }

  onUp(e) {
    this.pointers.delete(e.pointerId);
    if (this.pinch && this.pointers.size < 2) { this.pinch = null; this.drag = null; return; }
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    this.cv.style.cursor = this.tool === 'hand' || this.space ? 'grab' : 'default';
    if (d.type === 'marquee') {
      const x0 = Math.min(d.sx, d.x), x1 = Math.max(d.sx, d.x), y0 = Math.min(d.sy, d.y), y1 = Math.max(d.sy, d.y);
      if (x1 - x0 > 4 || y1 - y0 > 4) {
        const ids = new Set(d.add ? d.base : []);
        for (const o of this.scene.objects) {
          if (o.hidden || o.locked) continue;
          const b = boxOf(o);
          const [px, py] = this.cam.project(b.cx, b.cy, b.h / 2);
          if (px >= x0 && px <= x1 && py >= y0 && py <= y1) ids.add(o.id);
        }
        this.setSelection([...ids]);
      }
      this.invalidate();
      return;
    }
    if (d.moved) { this.scene.commit(); this.emit('live'); }
  }

  dragMove(d, g, e) {
    let dx = g[0] - d.g0[0], dy = g[1] - d.g0[1];
    if (!d.moved && Math.hypot(dx, dy) < 0.04 && !e.altKey) return;
    d.moved = true;
    const ref = d.items[0];
    if (!ref) return;
    if (this.snapStep() && !e.altKey) {
      const rx = ref.pts ? ref.pts[0][0] : ref.x, ry = ref.pts ? ref.pts[0][1] : ref.y;
      dx = this.snap(rx + dx) - rx; dy = this.snap(ry + dy) - ry;
    }
    for (const it of d.items) {
      if (it.pts) { it.o.pts = it.pts.map(([x, y]) => [x + dx, y + dy]); this.scene.touch(it.o); } else { it.o.x = it.x + dx; it.o.y = it.y + dy; }
    }
    this.invalidate(); this.emit('live');
  }

  dragRotate(d, g, e) {
    const { o, start } = d;
    let ang = Math.atan2(g[1] - start.cy, g[0] - start.cx) / DEG + 90;
    if (e.shiftKey) ang = Math.round(ang / 15) * 15;
    else { ang = Math.round(ang); for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(ang - s) <= 3) ang = s; }
    ang = ((ang + 540) % 360) - 180;
    o.rot = ang; d.moved = true;
    this.hint(`Rotation ${Math.round(ang)}°`);
    this.invalidate(); this.emit('live');
  }

  dragResize(d, g, e) {
    const { o, start } = d;
    const [hx, hy] = HANDLES[d.hid];
    const lp = rot2(g[0] - start.cx, g[1] - start.cy, -start.rot);
    const step = this.snapStep() || 0.05;
    const flags = resizeFlags(o), a = ASSETS[o.type];
    let W = start.W, D = start.D;
    if (o.arr) {
      const ar = o.arr, es = start.es;
      const best = (raw, size, gap, block, aisle) => { let n = 1; for (let i = 1; i <= 300; i++) { if (gridExtent(ar, i, size, gap, block, aisle) > raw + size * 0.5) break; n = i; } return n; };
      if (hx) { ar.cols = best(hx * lp[0] + start.W / 2, es.w, ar.gx, ar.blockX, ar.aisleX); W = gridExtent(ar, ar.cols, es.w, ar.gx, ar.blockX, ar.aisleX); }
      if (hy) { ar.rows = best(hy * lp[1] + start.D / 2, es.d, ar.gy, ar.blockY, ar.aisleY); D = gridExtent(ar, ar.rows, es.d, ar.gy, ar.blockY, ar.aisleY); }
      this.hint(`${ar.cols} × ${ar.rows} = ${ar.cols * ar.rows} items`);
    } else {
      if (hx && flags.w) W = Math.max(0.2, snapTo(hx * lp[0] + start.W / 2, step));
      if (hy && flags.d) D = Math.max(0.2, snapTo(hy * lp[1] + start.D / 2, step));
      if (a.round) { const s = Math.max(W, D); W = D = s; }
      o.w = Math.max(0.1, start.w + (W - start.W));
      o.d = Math.max(0.1, start.d + (D - start.D));
      if (a.onChange) { a.onChange(o, 'w'); }
      this.hint(`${(Math.round(W * 100) / 100)} × ${(Math.round(D * 100) / 100)} m`);
    }
    const [sx, sy] = rot2(hx * (W - start.W) / 2, hy * (D - start.D) / 2, start.rot);
    o.x = start.cx + sx; o.y = start.cy + sy;
    d.moved = true;
    this.scene.touch(o);
    this.invalidate(); this.emit('live');
  }

  // ---- drawing tools ----------------------------------------------------------------------
  drawClick(g, e) {
    const dr = this.drawing;
    const p = [this.snap(g[0]), this.snap(g[1])];
    const last = dr.pts[dr.pts.length - 1];
    if (last && Math.hypot(last[0] - p[0], last[1] - p[1]) < 0.01) return;
    if (dr.kind === 'polyzone' && dr.pts.length >= 3) {
      const [fx, fy] = this.cam.project(dr.pts[0][0], dr.pts[0][1], 0);
      const [sx, sy] = this.pos(e);
      if (Math.hypot(fx - sx, fy - sy) < 12) { this.finishDrawing(); return; }
    }
    dr.pts.push(p);
    this.invalidate();
  }
  onDbl(e) {
    if (this.drawing) {
      const dr = this.drawing;
      // the second click of the double-click has already added a duplicate point (ignored above)
      this.finishDrawing();
    }
  }
  finishDrawing() {
    const dr = this.drawing;
    if (!dr) return;
    const need = dr.kind === 'polyzone' ? 3 : 2;
    if (dr.pts.length < need) { this.toast(`Need at least ${need} points`); return; }
    const preset = PALETTE.find((p) => p.id === dr.kind);
    const o = presetObject(preset.id, { pts: dr.pts.map((p) => [...p]) });
    if (dr.kind === 'polyzone') {
      const col = ['#ffa94d', '#69db7c', '#4dabf7', '#da77f2', '#ff6b6b', '#ffd43b'][this.scene.objects.length % 6];
      o.color = col; o.label = 'New zone';
    }
    this.scene.add(o);
    this.setTool('select');
    this.setSelection([o.id]);
    this.scene.commit();
    this.emit('objects');
  }
  cancelDrawing() { this.setTool('select'); }

  // ---- pinch / wheel --------------------------------------------------------------------------
  startPinch() {
    const [a, b] = [...this.pointers.values()];
    this.drag = null;
    this.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
  }
  updatePinch() {
    const [a, b] = [...this.pointers.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    this.cam.px += c[0] - this.pinch.c[0]; this.cam.py += c[1] - this.pinch.c[1];
    this.cam.zoomAt(c[0], c[1], d / this.pinch.d);
    this.pinch = { d, c };
    this.emit('view'); this.invalidate();
  }
  onWheel(e) {
    e.preventDefault();
    const [sx, sy] = this.pos(e);
    const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
    this.cam.zoomAt(sx, sy, f);
    this.emit('view'); this.invalidate();
  }

  // ---- keyboard ------------------------------------------------------------------------------------
  onKey(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
      if (e.key === 'Escape') t.blur();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (e.code === 'Space') { this.space = true; this.cv.style.cursor = 'grab'; e.preventDefault(); return; }
    if (this.drawing) {
      if (k === 'enter') { this.finishDrawing(); e.preventDefault(); return; }
      if (k === 'escape') { this.cancelDrawing(); return; }
      if (k === 'backspace') { this.drawing.pts.pop(); this.invalidate(); e.preventDefault(); return; }
    }
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) this.scene.redo(); else this.scene.undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); this.scene.redo(); return; }
    if (mod && k === 'd') { e.preventDefault(); this.duplicate(); return; }
    if (mod && k === 'c') { this.copy(); return; }
    if (mod && k === 'v') { this.paste(); return; }
    if (mod && k === 'a') { e.preventDefault(); this.setSelection(this.scene.objects.filter((o) => !o.hidden && !o.locked).map((o) => o.id)); return; }
    if (mod) return;
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); this.deleteSelected(); return; }
    if (k === 'escape') { this.setSelection([]); this.setTool('select'); return; }
    if (k === '2') { this.setMode('2d'); return; }
    if (k === '3') { this.setMode('iso'); return; }
    if (k === 'g') { this.scene.meta.grid = !this.scene.meta.grid; this.scene.commit(); this.emit('view'); this.invalidate(); return; }
    if (k === 'f') { this.zoomToSelection(); return; }
    if (k === 'v') { this.setTool('select'); return; }
    if (k === 'h') { this.setTool('hand'); return; }
    if (k === 'r' && this.sel.size) { this.rotateSelected(e.shiftKey ? -15 : 15); return; }
    if (k === 'q') { this.rotateView(-90); return; }
    if (k === 'e') { this.rotateView(90); return; }
    if (k === '[') { this.reorder('backward'); return; }
    if (k === ']') { this.reorder('forward'); return; }
    if (k.startsWith('arrow') && this.sel.size) {
      e.preventDefault();
      const s = e.shiftKey ? 1 : this.snapStep() || 0.1;
      // arrows move on screen axes (2D) or world axes rotated with the view
      let dx = k === 'arrowright' ? s : k === 'arrowleft' ? -s : 0, dy = k === 'arrowdown' ? s : k === 'arrowup' ? -s : 0;
      if (this.cam.mode === 'iso') { [dx, dy] = rot2(dx, dy, -this.cam.yaw); }
      this.nudge(dx, dy);
      clearTimeout(this._nt); this._nt = setTimeout(() => this.scene.commit(), 350);
    }
  }

  // ---- overlay drawing --------------------------------------------------------------------------------
  drawOverlay(ctx) {
    const cam = this.cam;
    const poly = (pts, close = true) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); if (close) ctx.closePath(); };

    const outline = (o, strong) => {
      const a = ASSETS[o.type];
      ctx.save();
      ctx.lineJoin = 'round';
      if (a.world) {
        const pts = o.pts.map((p) => cam.project(p[0], p[1], 0));
        poly(pts, !!a.poly);
        ctx.strokeStyle = ACCENT; ctx.lineWidth = strong ? 2.5 : 1.5; ctx.setLineDash(strong ? [] : [5, 4]);
        if (a.poly && strong) { ctx.fillStyle = 'rgba(79,70,229,.1)'; ctx.fill(); }
        ctx.stroke();
      } else {
        const b = boxOf(o);
        const base = boxCorners(b, 0).map(([x, y, z]) => cam.project(x, y, z));
        ctx.strokeStyle = ACCENT; ctx.lineWidth = strong ? 2 : 1.4;
        ctx.setLineDash(strong ? [] : [5, 4]);
        if (strong) { poly(base); ctx.fillStyle = 'rgba(79,70,229,.10)'; ctx.fill(); }
        if (cam.mode === 'iso' && b.h > 0.2) {
          const top = boxCorners(b, b.h).map(([x, y, z]) => cam.project(x, y, z));
          ctx.globalAlpha = 0.85;
          poly(top); ctx.stroke();
          ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(base[i][0], base[i][1]); ctx.lineTo(top[i][0], top[i][1]); } ctx.stroke();
          ctx.globalAlpha = 1;
        }
        poly(base); ctx.stroke();
      }
      ctx.restore();
    };

    if (this.hoverId && !this.sel.has(this.hoverId) && !this.drag) { const o = this.scene.byId(this.hoverId); if (o) outline(o, false); }
    for (const o of this.selected) outline(o, true);

    // handles / vertices
    if (this.sel.size === 1) {
      const o = this.selected[0];
      const sq = (x, y, r = 4.5) => { ctx.beginPath(); roundRect(ctx, x - r, y - r, r * 2, r * 2, 2.5); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.8; ctx.stroke(); };
      for (const h of this.handleList(o)) {
        const [x, y] = this.handleScreen(h);
        if (h.rot) {
          const p = cam.project(h.wx, h.wy, 0);
          ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(x, y); ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.arc(x, y, 3.2, 0.4, Math.PI * 1.7); ctx.lineWidth = 1.6; ctx.stroke();
        } else sq(x, y);
      }
      if (o.pts) {
        const a = ASSETS[o.type];
        const n = a.poly ? o.pts.length : o.pts.length - 1;
        for (let i = 0; i < n; i++) {
          const q = o.pts[(i + 1) % o.pts.length];
          const [x, y] = cam.project((o.pts[i][0] + q[0]) / 2, (o.pts[i][1] + q[1]) / 2, 0);
          ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = 'rgba(79,70,229,.25)'; ctx.fill();
        }
        for (const p of o.pts) { const [x, y] = cam.project(p[0], p[1], 0); sq(x, y, 5); }
      }
      // size readout
      if (!o.pts) {
        const b = boxOf(o);
        const pts = boxCorners(b, 0).map(([x, y, z]) => cam.project(x, y, z));
        const bx = pts.reduce((s, p) => s + p[0], 0) / 4, by = Math.max(...pts.map((p) => p[1])) + 20;
        const txt = `${Math.round(b.w * 100) / 100} × ${Math.round(b.d * 100) / 100} m`;
        ctx.font = '600 11px Inter, system-ui, sans-serif';
        const w = ctx.measureText(txt).width + 14;
        ctx.beginPath(); roundRect(ctx, bx - w / 2, by - 10, w, 20, 10); ctx.fillStyle = ACCENT; ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx, by + 0.5);
      }
    }

    // drawing preview
    if (this.drawing) {
      const dr = this.drawing;
      const pts = dr.pts.map((p) => cam.project(p[0], p[1], 0));
      const cur = dr.cursor ? cam.project(dr.cursor[0], dr.cursor[1], 0) : null;
      const all = cur ? [...pts, cur] : pts;
      if (all.length) {
        ctx.save();
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        if (dr.kind === 'path') { ctx.strokeStyle = 'rgba(79,70,229,.35)'; ctx.lineWidth = 4 * cam.zoom * 0.8; poly(all, false); ctx.stroke(); }
        else if (all.length >= 3) { poly(all); ctx.fillStyle = 'rgba(79,70,229,.14)'; ctx.fill(); }
        ctx.strokeStyle = ACCENT; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); poly(all, dr.kind === 'polyzone' && all.length > 2); ctx.stroke(); ctx.setLineDash([]);
        for (const p of pts) { ctx.beginPath(); ctx.arc(p[0], p[1], 4.5, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); }
        if (pts.length && dr.kind === 'polyzone' && pts.length >= 3) { ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], 8, 0, 7); ctx.strokeStyle = ACCENT; ctx.stroke(); }
        ctx.restore();
      }
    }

    if (this.drag && this.drag.type === 'marquee') {
      const d = this.drag;
      ctx.save();
      ctx.fillStyle = 'rgba(79,70,229,.08)'; ctx.strokeStyle = ACCENT; ctx.lineWidth = 1;
      ctx.fillRect(Math.min(d.sx, d.x), Math.min(d.sy, d.y), Math.abs(d.x - d.sx), Math.abs(d.y - d.sy));
      ctx.strokeRect(Math.min(d.sx, d.x) + 0.5, Math.min(d.sy, d.y) + 0.5, Math.abs(d.x - d.sx), Math.abs(d.y - d.sy));
      ctx.restore();
    }
  }

  // ---- export -------------------------------------------------------------------------------------------
  /** Render the plan to an offscreen canvas, framed on the venue. */
  renderToCanvas(maxW = 2400, { tags = true, bg = true } = {}) {
    const cam = this.cam.clone();
    // measure aspect at zoom 1
    const m = cam.clone(); m.zoom = 1; m.px = 0; m.py = 0;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y, z] of this.venuePoints()) { const [sx, sy] = m.project(x, y, z); x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
    // include tall objects
    for (const o of this.scene.objects) { const b = boxOf(o); for (const [x, y, z] of [...boxCorners(b, 0), ...boxCorners(b, b.h)]) { const [sx, sy] = m.project(x, y, z); x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); } }
    const pad = 60, bw = x1 - x0, bh = y1 - y0;
    const scale = (maxW - pad * 2) / bw;
    const W = Math.round(maxW), H = Math.round(bh * scale + pad * 2);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cam.zoom = scale; cam.px = pad - x0 * scale; cam.py = pad - y0 * scale;
    const r = new Renderer(cv);
    r.draw(this.scene, cam, { style: this.scene.meta.style, grid: this.scene.meta.grid, scaleBar: true, dpr: 1, tags, bg });
    return cv;
  }
}
