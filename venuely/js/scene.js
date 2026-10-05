// Scene model: venue settings + ordered list of objects, with undo/redo and autosave.

import { ASSETS, PALETTE } from './assets.js';
import { DEFAULT_ARRAY, layoutOf } from './layout.js';
import { uid } from './util.js';

const STORE_KEY = 'venuely.plan.v1';

export function createObject(assetId, over = {}) {
  const a = ASSETS[assetId];
  if (!a) throw new Error('Unknown asset ' + assetId);
  const o = {
    id: uid(), type: assetId, name: a.name, x: 0, y: 0, rot: 0,
    w: a.w, d: a.d, h: a.h, color: a.color || '', color2: a.color2 || '#ffffff',
    p: JSON.parse(JSON.stringify(a.p || {})), arr: null,
    label: a.label || '', showLabel: !!a.showLabel, locked: false, hidden: false, rev: 0,
  };
  const { p, arr, ...rest } = over;
  Object.assign(o, rest);
  if (p) Object.assign(o.p, p);
  if (arr) o.arr = { ...DEFAULT_ARRAY, ...arr };
  if (a.poly || a.line) o.pts = over.pts ? over.pts.map((q) => [...q]) : [];
  return o;
}

export function presetObject(presetId, extra = {}) {
  const it = PALETTE.find((p) => p.id === presetId);
  const base = it.over || {};
  const over = { name: it.name, ...base, ...extra };
  over.p = { ...(base.p || {}), ...(extra.p || {}) };
  if (base.arr || extra.arr) over.arr = { ...(base.arr || {}), ...(extra.arr || {}) };
  return createObject(it.asset, over);
}

const blank = () => ({
  meta: { name: 'Untitled event', venue: { w: 60, d: 40 }, ground: 'grass', grid: true, snap: 0.5, style: 'outline' },
  objects: [],
});

export class Scene {
  constructor() {
    this.listeners = new Set();
    this.undoStack = [];
    this.redoStack = [];
    Object.assign(this, blank());
    this.head = this.snapshot();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(kind = 'change') { for (const fn of this.listeners) fn(kind); }

  byId(id) { return this.objects.find((o) => o.id === id); }
  touch(o) { o.rev++; }

  add(o) { this.objects.push(o); this.touch(o); return o; }
  remove(ids) {
    const set = new Set(ids);
    this.objects = this.objects.filter((o) => !set.has(o.id));
  }

  // ---- serialisation -----------------------------------------------------
  serialize() {
    return { v: 1, meta: this.meta, objects: this.objects };
  }
  snapshot() {
    return JSON.stringify(this.serialize(), (k, v) => (k[0] === '_' ? undefined : v));
  }
  load(data, { keepHistory = false } = {}) {
    const d = typeof data === 'string' ? JSON.parse(data) : data;
    const base = blank();
    this.meta = { ...base.meta, ...d.meta, venue: { ...base.meta.venue, ...(d.meta && d.meta.venue) } };
    this.objects = (d.objects || []).filter((o) => ASSETS[o.type]).map((o) => {
      const fresh = createObject(o.type, {});
      const clean = Object.fromEntries(Object.entries(o).filter(([k]) => k[0] !== '_'));
      const merged = { ...fresh, ...clean, p: { ...fresh.p, ...(o.p || {}) } };
      merged.rev = 0;
      return merged;
    });
    if (!keepHistory) { this.undoStack = []; this.redoStack = []; }
    this.head = this.snapshot();
    this.emit('load');
  }

  // ---- history -----------------------------------------------------------
  /** Call after a finished edit (drag end, field change, add, delete ...). */
  commit() {
    const s = this.snapshot();
    if (s === this.head) return false;
    this.undoStack.push(this.head);
    if (this.undoStack.length > 120) this.undoStack.shift();
    this.redoStack = [];
    this.head = s;
    this.save();
    this.emit('commit');
    return true;
  }
  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push(this.head);
    this._restore(this.undoStack.pop());
    return true;
  }
  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(this.head);
    this._restore(this.redoStack.pop());
    return true;
  }
  _restore(s) {
    const keepU = this.undoStack, keepR = this.redoStack;
    this.load(s, { keepHistory: true });
    this.undoStack = keepU; this.redoStack = keepR;
    this.head = s;
    this.save();
    this.emit('restore');
  }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  // ---- persistence -------------------------------------------------------
  save() {
    try { localStorage.setItem(STORE_KEY, this.head); } catch (e) { /* storage unavailable */ }
  }
  restoreSaved() {
    try {
      const s = localStorage.getItem(STORE_KEY);
      if (!s) return false;
      this.load(s);
      return true;
    } catch (e) { return false; }
  }

  // ---- queries -----------------------------------------------------------
  /** Aggregate counts for the summary tab (array multiplicity included). */
  summary() {
    const rows = new Map();
    let seats = 0;
    for (const o of this.objects) {
      if (o.hidden) continue;
      const a = ASSETS[o.type];
      const n = a.world ? 1 : layoutOf(o).els.length;
      const key = o.type + (o.type === 'sofa' ? ':' + o.p.shape + (o.p.shape === 'L' ? '' : o.p.seats) : '') + (o.type === 'tree' ? ':' + o.p.kind : '');
      const nm = o.type === 'sofa' ? (o.p.shape === 'L' ? 'L-shaped sofa' : `${o.p.seats}-seater sofa`) : o.type === 'tree' ? (o.p.kind === 'pine' ? 'Pine tree' : 'Tree') : a.name;
      const r = rows.get(key) || { name: nm, cat: a.cat, n: 0 };
      r.n += n;
      rows.set(key, r);
      if (o.type === 'chair') seats += n;
      if (o.type === 'stool') seats += n;
      if (o.type === 'bench') seats += n * Math.max(1, Math.round(o.w / 0.5));
      if (o.type === 'sofa') seats += n * (o.p.shape === 'L' ? o.p.seats + 2 : o.p.seats);
      if (o.type === 'table_round') seats += n * o.p.seats;
      if (o.type === 'table_rect') seats += n * (o.p.seatsLong * 2 + o.p.seatsEnd * 2);
    }
    return { rows: [...rows.values()].sort((a, b) => a.cat.localeCompare(b.cat) || b.n - a.n), seats };
  }
}
